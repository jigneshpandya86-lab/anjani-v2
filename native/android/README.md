# Android SMS Plugin Scaffold

This folder contains a scaffold class for the native SMS bridge expected by the web layer.

## JS bridge contract
`src/sms/nativeSmsBridge.js` expects a plugin exposed on `window.Capacitor.Plugins.SmsBackground` with:

- `send({ to, body })`

## Next integration step
In the generated Capacitor Android project:

1. Create plugin class that exposes `@PluginMethod fun send(call: PluginCall)`.
2. Validate `to` and `body`.
3. Request/check `Manifest.permission.SEND_SMS`.
4. Use `SmsManager` to send SMS.
5. Resolve/reject `PluginCall` with structured result.

This repo keeps the scaffold here so JS and native teams can align on the contract before wiring full Android code.
