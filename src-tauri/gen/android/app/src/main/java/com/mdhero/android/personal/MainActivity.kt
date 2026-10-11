package com.mdhero.android.personal

import android.os.Bundle
import android.content.Intent
import androidx.activity.enableEdgeToEdge
import android.content.pm.ActivityInfo
import android.view.WindowManager
import android.webkit.WebView

class MainActivity : TauriActivity() {
  private var documentView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    documentView = webView
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) documentView?.post {
      // Process lifecycle callbacks are delayed and are not sent for every
      // quick app switch. Restore the WebView surface when this window returns.
      if (hasWindowFocus() && !isFinishing && !isDestroyed) {
        documentView?.onResume()
        documentView?.requestLayout()
        documentView?.invalidate()
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    setIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
  }
}
