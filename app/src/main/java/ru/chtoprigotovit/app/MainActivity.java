package ru.chtoprigotovit.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";

    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String pendingSpeech;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        drawBehindSystemBars();

        web = new WebView(this);
        web.setBackgroundColor(0xFF141118);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        applySystemBarPadding();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        web.setWebViewClient(new Client());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START);
        }
    }

    @SuppressWarnings("deprecation")
    private void drawBehindSystemBars() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarPadding() {
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, left, right;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = bars.top;
                bottom = bars.bottom;
                left = bars.left;
                right = bars.right;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft();
                right = insets.getSystemWindowInsetRight();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.__appBack && window.__appBack()) ? 'closed' : 'none'", value -> {
            if (value == null || !value.contains("closed")) {
                MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.evaluateJavascript("window.__appResume && window.__appResume()", null);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.shutdown();
        }
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }

    private void js(String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    private void speakNow(String text) {
        if (tts == null) {
            pendingSpeech = text;
            tts = new TextToSpeech(this, status -> {
                if (status != TextToSpeech.SUCCESS) {
                    js("window.__ttsError && window.__ttsError()");
                    return;
                }
                int r = tts.setLanguage(new Locale("ru", "RU"));
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    js("window.__ttsError && window.__ttsError()");
                    return;
                }
                ttsReady = true;
                if (pendingSpeech != null) {
                    tts.speak(pendingSpeech, TextToSpeech.QUEUE_FLUSH, null, "step");
                    pendingSpeech = null;
                }
            });
        } else if (ttsReady) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "step");
        } else {
            pendingSpeech = text;
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(ClipData.newPlainText("Список покупок", text));
            }
        }

        @JavascriptInterface
        public void scheduleTimer(double endAt, String label) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
                }
                TimerReceiver.schedule(MainActivity.this, (long) endAt, label);
            });
        }

        @JavascriptInterface
        public void cancelTimer() {
            TimerReceiver.cancel(MainActivity.this);
        }

        @JavascriptInterface
        public double timerEnd() {
            return TimerReceiver.end(MainActivity.this);
        }

        @JavascriptInterface
        public void speak(String text) {
            runOnUiThread(() -> speakNow(text));
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                pendingSpeech = null;
                if (tts != null) tts.stop();
            });
        }

        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(send, "Поделиться"));
            });
        }

        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }

    private class Client extends WebViewClient {
        private final Map<String, String> types = new HashMap<>();

        Client() {
            types.put("html", "text/html");
            types.put("js", "text/javascript");
            types.put("css", "text/css");
            types.put("json", "application/json");
            types.put("jpg", "image/jpeg");
            types.put("jpeg", "image/jpeg");
            types.put("png", "image/png");
            types.put("webp", "image/webp");
            types.put("svg", "image/svg+xml");
            types.put("woff2", "font/woff2");
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!HOST.equals(uri.getHost())) {
                return null;
            }
            String path = uri.getPath();
            if (path == null || path.isEmpty() || path.equals("/")) {
                path = "/index.html";
            }
            path = path.substring(1);
            String ext = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase() : "";
            String mime = types.containsKey(ext) ? types.get(ext) : "application/octet-stream";
            boolean text = mime.startsWith("text/") || mime.equals("application/json");
            try {
                InputStream in = getAssets().open(path);
                return new WebResourceResponse(mime, text ? "utf-8" : null, in);
            } catch (IOException e) {
                WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
                r.setStatusCodeAndReasonPhrase(404, "Not Found");
                return r;
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (HOST.equals(uri.getHost())) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
            return true;
        }
    }
}
