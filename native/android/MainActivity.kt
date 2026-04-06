package com.anjani.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.anjani.app.sms.SmsBackgroundPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SmsBackgroundPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
