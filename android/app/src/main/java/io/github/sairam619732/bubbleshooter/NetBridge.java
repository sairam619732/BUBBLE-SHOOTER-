package io.github.sairam619732.bubbleshooter;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * JavaScript bridge (window.BSANative) for LAN multiplayer.
 *
 * Host side ("listen server"): a TCP ServerSocket that accepts players, plus a UDP responder
 * that answers discovery broadcasts. Client side: one TCP connection to a host, plus a UDP
 * scanner. Messages are newline-delimited UTF-8 JSON. All game logic stays in JavaScript;
 * this class only moves strings. Events go back to the page in batches via
 * window.__bsaNative(...).
 */
public class NetBridge {
    static final String DISCOVER_MSG = "BSA_DISCOVER_1";
    static final String HOST_PREFIX = "BSA_HOST_1\n";
    static final int DISCOVERY_PORT = 47778;
    private static final int MAX_LINE = 256 * 1024;

    private final MainActivity activity;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ConcurrentLinkedQueue<JSONObject> outbox = new ConcurrentLinkedQueue<>();
    private final AtomicBoolean flushScheduled = new AtomicBoolean(false);

    // Host state
    private volatile ServerSocket server;
    private volatile int hostPort;
    private volatile String hostInfo = "{}";
    private final Map<Integer, Peer> peers = new ConcurrentHashMap<>();
    private final AtomicInteger nextConn = new AtomicInteger(1);
    private volatile DatagramSocket responder;
    private WifiManager.MulticastLock multicastLock;

    // Client state
    private volatile Peer client;
    private final AtomicInteger clientGen = new AtomicInteger();
    private volatile DatagramSocket scanner;

    NetBridge(MainActivity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    boolean isNetworkActive() {
        return server != null || client != null;
    }

    // ------------------------------------------------------------------ events to JS

    void emitSimple(String type) {
        emit(obj("type", type));
    }

    void emitInsets(float top, float bottom, float left, float right) {
        JSONObject o = obj("type", "insets");
        try {
            o.put("top", top);
            o.put("bottom", bottom);
            o.put("left", left);
            o.put("right", right);
        } catch (JSONException ignored) {
        }
        emit(o);
    }

    private static JSONObject obj(String k, Object v) {
        JSONObject o = new JSONObject();
        try {
            o.put(k, v);
        } catch (JSONException ignored) {
        }
        return o;
    }

    private static JSONObject put(JSONObject o, String k, Object v) {
        try {
            o.put(k, v);
        } catch (JSONException ignored) {
        }
        return o;
    }

    private void emit(JSONObject event) {
        outbox.add(event);
        if (flushScheduled.compareAndSet(false, true)) main.post(this::flush);
    }

    private void flush() {
        flushScheduled.set(false);
        JSONArray batch = new JSONArray();
        JSONObject e;
        while ((e = outbox.poll()) != null) batch.put(e);
        if (batch.length() == 0) return;
        // Passed as a JS string literal and parsed on the page side.
        String js = "window.__bsaNative&&window.__bsaNative(" + JSONObject.quote(batch.toString()) + ")";
        web.evaluateJavascript(js, null);
    }

    // ------------------------------------------------------------------ host

    @JavascriptInterface
    public synchronized String hostStart(int port, String info) {
        hostStopInternal();
        hostInfo = info == null ? "{}" : info;
        ServerSocket ss = null;
        int bound = -1;
        for (int p = port; p < port + 10 && ss == null; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                ss = s;
                bound = p;
            } catch (IOException ignored) {
                // Port busy, try the next one.
            }
        }
        JSONObject res = new JSONObject();
        if (ss == null) {
            put(res, "ok", false);
            put(res, "error", "Could not open a network port. Is Wi-Fi on?");
            return res.toString();
        }
        server = ss;
        hostPort = bound;
        final ServerSocket accepting = ss;
        io.execute(() -> acceptLoop(accepting));
        startResponder();
        put(res, "ok", true);
        put(res, "port", bound);
        put(res, "addresses", new JSONArray(localIPv4()));
        return res.toString();
    }

    @JavascriptInterface
    public void hostUpdateInfo(String info) {
        if (info != null) hostInfo = info;
    }

    @JavascriptInterface
    public synchronized void hostStop() {
        hostStopInternal();
    }

    private void hostStopInternal() {
        ServerSocket s = server;
        server = null;
        if (s != null) {
            try {
                s.close();
            } catch (IOException ignored) {
            }
        }
        for (Peer p : peers.values()) p.close();
        peers.clear();
        DatagramSocket r = responder;
        responder = null;
        if (r != null) r.close();
        releaseMulticastLock();
    }

    @JavascriptInterface
    public void hostSend(int conn, String data) {
        Peer p = peers.get(conn);
        if (p != null) p.send(data);
    }

    @JavascriptInterface
    public void hostClose(int conn) {
        Peer p = peers.remove(conn);
        if (p != null) p.close();
    }

    private void acceptLoop(ServerSocket ss) {
        while (!ss.isClosed()) {
            try {
                Socket s = ss.accept();
                s.setTcpNoDelay(true);
                s.setKeepAlive(true);
                int id = nextConn.getAndIncrement();
                Peer p = new Peer(s);
                peers.put(id, p);
                JSONObject ev = obj("type", "host:open");
                put(ev, "conn", id);
                put(ev, "addr", s.getInetAddress().getHostAddress());
                emit(ev);
                io.execute(() -> {
                    p.readLoop(line -> {
                        JSONObject m = obj("type", "host:data");
                        put(m, "conn", id);
                        put(m, "data", line);
                        emit(m);
                    });
                    if (peers.remove(id) != null || !p.closedByUs) {
                        JSONObject c = obj("type", "host:close");
                        put(c, "conn", id);
                        emit(c);
                    }
                    p.close();
                });
            } catch (IOException e) {
                if (ss.isClosed()) return;
            }
        }
    }

    /** Answers discovery broadcasts from phones looking for games. */
    private void startResponder() {
        acquireMulticastLock();
        try {
            DatagramSocket ds = new DatagramSocket(null);
            ds.setReuseAddress(true);
            ds.setBroadcast(true);
            ds.bind(new InetSocketAddress(DISCOVERY_PORT));
            responder = ds;
            io.execute(() -> {
                byte[] buf = new byte[512];
                while (!ds.isClosed()) {
                    try {
                        DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                        ds.receive(pkt);
                        String msg = new String(pkt.getData(), 0, pkt.getLength(), StandardCharsets.UTF_8).trim();
                        if (!DISCOVER_MSG.equals(msg) || server == null) continue;
                        JSONObject info;
                        try {
                            info = new JSONObject(hostInfo);
                        } catch (JSONException e) {
                            info = new JSONObject();
                        }
                        put(info, "port", hostPort);
                        byte[] reply = (HOST_PREFIX + info).getBytes(StandardCharsets.UTF_8);
                        ds.send(new DatagramPacket(reply, reply.length, pkt.getAddress(), pkt.getPort()));
                    } catch (IOException e) {
                        if (ds.isClosed()) return;
                    }
                }
            });
        } catch (IOException e) {
            // Discovery is optional; players can still join by address.
        }
    }

    private void acquireMulticastLock() {
        try {
            WifiManager wm = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && multicastLock == null) {
                multicastLock = wm.createMulticastLock("bsa-discovery");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
            }
        } catch (Exception ignored) {
        }
    }

    private void releaseMulticastLock() {
        try {
            if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
        } catch (Exception ignored) {
        }
        multicastLock = null;
    }

    // ------------------------------------------------------------------ client

    @JavascriptInterface
    public void clientConnect(String host, int port) {
        clientCloseInternal(false);
        final int gen = clientGen.incrementAndGet();
        io.execute(() -> {
            Socket s = new Socket();
            try {
                s.connect(new InetSocketAddress(host, port), 5000);
                s.setTcpNoDelay(true);
                s.setKeepAlive(true);
            } catch (Exception e) {
                try {
                    s.close();
                } catch (IOException ignored) {
                }
                if (gen == clientGen.get()) emitClientClose("Could not connect to " + host + ". Check you are on the same Wi-Fi.");
                return;
            }
            if (gen != clientGen.get()) {
                try {
                    s.close();
                } catch (IOException ignored) {
                }
                return;
            }
            Peer p = new Peer(s);
            client = p;
            emitSimple("client:open");
            p.readLoop(line -> {
                if (gen == clientGen.get()) emit(put(obj("type", "client:data"), "data", line));
            });
            p.close();
            if (gen == clientGen.get()) {
                client = null;
                if (!p.closedByUs) emitClientClose("Connection to the host was lost.");
            }
        });
    }

    private void emitClientClose(String reason) {
        emit(put(obj("type", "client:close"), "reason", reason));
    }

    @JavascriptInterface
    public void clientSend(String data) {
        Peer p = client;
        if (p != null) p.send(data);
    }

    @JavascriptInterface
    public void clientClose() {
        clientCloseInternal(true);
    }

    private void clientCloseInternal(boolean bumpGen) {
        if (bumpGen) clientGen.incrementAndGet();
        Peer p = client;
        client = null;
        if (p != null) p.close();
    }

    // ------------------------------------------------------------------ discovery (client)

    @JavascriptInterface
    public synchronized void discoverStart() {
        discoverStopInternal();
        try {
            DatagramSocket ds = new DatagramSocket();
            ds.setBroadcast(true);
            ds.setSoTimeout(400);
            scanner = ds;
            io.execute(() -> scanLoop(ds));
        } catch (IOException ignored) {
        }
    }

    @JavascriptInterface
    public synchronized void discoverStop() {
        discoverStopInternal();
    }

    private void discoverStopInternal() {
        DatagramSocket ds = scanner;
        scanner = null;
        if (ds != null) ds.close();
    }

    private void scanLoop(DatagramSocket ds) {
        byte[] query = DISCOVER_MSG.getBytes(StandardCharsets.UTF_8);
        byte[] buf = new byte[1024];
        long nextSend = 0;
        while (!ds.isClosed()) {
            long now = System.currentTimeMillis();
            if (now >= nextSend) {
                nextSend = now + 1200;
                for (InetAddress target : broadcastTargets()) {
                    try {
                        ds.send(new DatagramPacket(query, query.length, target, DISCOVERY_PORT));
                    } catch (IOException ignored) {
                    }
                }
            }
            try {
                DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                ds.receive(pkt);
                String msg = new String(pkt.getData(), 0, pkt.getLength(), StandardCharsets.UTF_8);
                if (!msg.startsWith(HOST_PREFIX)) continue;
                JSONObject ev = obj("type", "disc:found");
                put(ev, "address", pkt.getAddress().getHostAddress());
                put(ev, "info", msg.substring(HOST_PREFIX.length()));
                emit(ev);
            } catch (SocketTimeoutException ignored) {
                // Loop to resend.
            } catch (IOException e) {
                if (ds.isClosed()) return;
            }
        }
    }

    private static List<InetAddress> broadcastTargets() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
        } catch (IOException ignored) {
        }
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress b = ia.getBroadcast();
                    if (b != null && !out.contains(b)) out.add(b);
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    // ------------------------------------------------------------------ misc

    @JavascriptInterface
    public String localAddresses() {
        return new JSONArray(localIPv4()).toString();
    }

    private static List<String> localIPv4() {
        List<String> wifi = new ArrayList<>();
        List<String> other = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName() == null ? "" : ni.getName();
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan")) wifi.add(ip);
                    else if (a.isSiteLocalAddress()) other.add(ip);
                }
            }
        } catch (Exception ignored) {
        }
        wifi.addAll(other);
        return wifi;
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        int dur = Math.max(1, Math.min(ms, 400));
        try {
            Vibrator v;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm == null ? null : vm.getDefaultVibrator();
            } else {
                v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(dur, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(dur);
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setKeepScreenOn(boolean on) {
        activity.setKeepScreenOn(on);
    }

    @JavascriptInterface
    public void exitApp() {
        main.post(activity::finish);
    }

    @JavascriptInterface
    public void openUrl(String url) {
        activity.openExternal(url);
    }

    @JavascriptInterface
    public String appVersion() {
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return pi.versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    void shutdown() {
        hostStop();
        clientClose();
        discoverStop();
        io.shutdownNow();
    }

    // ------------------------------------------------------------------ connection

    interface LineHandler {
        void onLine(String line);
    }

    /** One TCP connection with an ordered background writer. */
    private final class Peer {
        final Socket socket;
        final ExecutorService writer = Executors.newSingleThreadExecutor();
        volatile boolean closedByUs;
        private BufferedWriter out;

        Peer(Socket socket) {
            this.socket = socket;
            try {
                out = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
            } catch (IOException e) {
                close();
            }
        }

        void send(String data) {
            if (out == null) return;
            try {
                writer.execute(() -> {
                    try {
                        out.write(data);
                        out.write('\n');
                        out.flush();
                    } catch (IOException e) {
                        close();
                    }
                });
            } catch (Exception ignored) {
                // Writer already shut down.
            }
        }

        /** Reads newline-delimited messages until the connection ends. */
        void readLoop(LineHandler handler) {
            try {
                InputStream in = socket.getInputStream();
                Reader r = new InputStreamReader(in, StandardCharsets.UTF_8);
                StringBuilder sb = new StringBuilder();
                char[] buf = new char[4096];
                int n;
                while ((n = r.read(buf)) != -1) {
                    for (int i = 0; i < n; i++) {
                        char ch = buf[i];
                        if (ch == '\n') {
                            if (sb.length() > 0) handler.onLine(sb.toString());
                            sb.setLength(0);
                        } else if (ch != '\r') {
                            sb.append(ch);
                            if (sb.length() > MAX_LINE) return;
                        }
                    }
                }
            } catch (IOException ignored) {
                // Connection closed.
            }
        }

        void close() {
            closedByUs = true;
            try {
                socket.close();
            } catch (IOException ignored) {
            }
            writer.shutdownNow();
        }
    }
}
