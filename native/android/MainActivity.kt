package com.anjani.app

import android.util.Log
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.anjani.app.sms.SmsBackgroundPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        try {
            registerPlugin(SmsBackgroundPlugin::class.java)
        } catch (error: Throwable) {
            Log.e("MainActivity", "Failed to register SmsBackgroundPlugin", error)
        }
        super.onCreate(savedInstanceState)
    }
}
