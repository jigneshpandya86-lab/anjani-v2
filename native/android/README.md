# Android SMS Plugin Scaffold

This folder contains a Capacitor plugin implementation draft for the native SMS bridge expected by the web layer.

## JS bridge contract
`src/sms/nativeSmsBridge.js` expects a plugin exposed on `window.Capacitor.Plugins.SmsBackground` with:

- `send({ to, body })`

## Integration in generated Capacitor Android project
In the generated Capacitor Android project:

1. Place `SmsBackgroundPlugin.kt` in your Android package and ensure it is discoverable by Capacitor.
2. Confirm plugin name remains `SmsBackground` (matches JS bridge lookup).
3. Keep/extend `SEND_SMS` runtime permission handling.
4. Use `SmsManager` send path and return `success/message` JSON.
5. If needed, add delivery/sent intents for richer delivery telemetry.

`SmsBackgroundPlugin.kt` now includes a real `@CapacitorPlugin` + `@PluginMethod send` flow and can be adapted directly in your generated Android module.
