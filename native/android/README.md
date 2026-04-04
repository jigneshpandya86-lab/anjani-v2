# Android SMS Plugin Scaffold

This folder contains a Kotlin implementation template for the native SMS bridge expected by the web layer.

## JS bridge contract
`src/sms/nativeSmsBridge.js` expects a plugin exposed on `window.Capacitor.Plugins.SmsBackground` with:

- `send({ to, body })`

## Integration step in generated Capacitor Android project
In the generated Capacitor Android project:

1. Create plugin class that exposes `@PluginMethod fun send(call: PluginCall)`.
2. Validate `to` and `body`.
3. Request/check `Manifest.permission.SEND_SMS`.
4. Use `SmsManager` to send SMS.
5. Resolve/reject `PluginCall` with structured result.

`SmsBackgroundPlugin.kt` now includes the core send logic (permission check + `SmsManager.sendTextMessage`) and can be adapted directly into your Capacitor plugin class.
