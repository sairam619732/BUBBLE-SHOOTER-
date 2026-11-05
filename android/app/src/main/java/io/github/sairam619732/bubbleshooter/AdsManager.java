package io.github.sairam619732.bubbleshooter;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Google AdMob: one rewarded ad (extra shots) and one interstitial (between levels), each kept
 * loaded in the background. Ads start only after Google's consent form (UMP) says they may.
 * Every method must run on the main thread; NetBridge posts calls from JavaScript there.
 */
final class AdsManager {
    /** Sends "ad:closed" events back to the page. */
    interface Listener {
        void onAdClosed(String kind, boolean rewarded);
    }

    private static final long MIN_RETRY_MS = 20_000;
    private static final long MAX_RETRY_MS = 5 * 60_000;

    private final Activity activity;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean started = new AtomicBoolean(false);
    private volatile ConsentInformation consent;

    private volatile RewardedAd rewarded;
    private volatile InterstitialAd interstitial;
    private volatile boolean showing;
    private boolean loadingRewarded;
    private boolean loadingInterstitial;
    private long rewardedRetry = MIN_RETRY_MS;
    private long interstitialRetry = MIN_RETRY_MS;

    AdsManager(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
    }

    /** Asks for consent where the law requires it, then starts the ads SDK. */
    void start() {
        consent = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(
                activity,
                params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> startAds()),
                requestError -> startAds());
        // Consent given in an earlier session lets ads start right away.
        startAds();
    }

    private void startAds() {
        if (consent == null || !consent.canRequestAds()) return;
        if (!started.compareAndSet(false, true)) return;
        MobileAds.setRequestConfiguration(
                new RequestConfiguration.Builder()
                        .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_PG)
                        .build());
        // Google recommends initializing off the main thread.
        new Thread(() -> MobileAds.initialize(activity, status -> main.post(() -> {
            loadRewarded();
            loadInterstitial();
        }))).start();
    }

    // ------------------------------------------------------------------ loading

    private void loadRewarded() {
        if (!started.get() || rewarded != null || loadingRewarded || activity.isFinishing()) return;
        loadingRewarded = true;
        RewardedAd.load(activity, BuildConfig.REWARDED_ID, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedAd ad) {
                loadingRewarded = false;
                rewarded = ad;
                rewardedRetry = MIN_RETRY_MS;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError error) {
                loadingRewarded = false;
                rewarded = null;
                main.postDelayed(AdsManager.this::loadRewarded, rewardedRetry);
                rewardedRetry = Math.min(MAX_RETRY_MS, rewardedRetry * 2);
            }
        });
    }

    private void loadInterstitial() {
        if (!started.get() || interstitial != null || loadingInterstitial || activity.isFinishing()) return;
        loadingInterstitial = true;
        InterstitialAd.load(activity, BuildConfig.INTERSTITIAL_ID, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(InterstitialAd ad) {
                loadingInterstitial = false;
                interstitial = ad;
                interstitialRetry = MIN_RETRY_MS;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError error) {
                loadingInterstitial = false;
                interstitial = null;
                main.postDelayed(AdsManager.this::loadInterstitial, interstitialRetry);
                interstitialRetry = Math.min(MAX_RETRY_MS, interstitialRetry * 2);
            }
        });
    }

    // ------------------------------------------------------------------ showing

    void showRewarded() {
        RewardedAd ad = rewarded;
        if (ad == null || showing) {
            listener.onAdClosed("rewarded", false);
            loadRewarded();
            return;
        }
        rewarded = null;
        showing = true;
        final boolean[] earned = {false};
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                showing = false;
                listener.onAdClosed("rewarded", earned[0]);
                loadRewarded();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(AdError error) {
                showing = false;
                listener.onAdClosed("rewarded", false);
                loadRewarded();
            }
        });
        ad.show(activity, reward -> earned[0] = true);
    }

    void showInterstitial() {
        InterstitialAd ad = interstitial;
        if (ad == null || showing) {
            listener.onAdClosed("interstitial", false);
            loadInterstitial();
            return;
        }
        interstitial = null;
        showing = true;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                showing = false;
                listener.onAdClosed("interstitial", false);
                loadInterstitial();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(AdError error) {
                showing = false;
                listener.onAdClosed("interstitial", false);
                loadInterstitial();
            }
        });
        ad.show(activity);
    }

    /** Google's form for changing ad consent (Settings > Privacy choices). */
    void showPrivacyOptions() {
        UserMessagingPlatform.showPrivacyOptionsForm(activity, formError -> startAds());
    }

    /** What the page may offer right now, as JSON: {"rewarded":..,"interstitial":..,"privacy":..}. */
    String statusJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("rewarded", rewarded != null && !showing);
            o.put("interstitial", interstitial != null && !showing);
            ConsentInformation c = consent;
            o.put("privacy", c != null
                    && c.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        } catch (JSONException ignored) {
        }
        return o.toString();
    }
}
