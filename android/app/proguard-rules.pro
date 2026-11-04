# The game UI calls these methods from JavaScript; keep them and their names.
-keepattributes JavascriptInterface
-keepclassmembers class io.github.sairam619732.bubbleshooter.NetBridge {
    @android.webkit.JavascriptInterface <methods>;
}
