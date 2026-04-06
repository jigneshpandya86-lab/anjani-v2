package com.anjani.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.anjani.app.sms.SmsBackgroundPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
