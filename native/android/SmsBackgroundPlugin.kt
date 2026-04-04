package com.anjani.app.sms

/**
 * Scaffold for Capacitor-native SMS bridge.
 *
 * Expected JS contract (see src/sms/nativeSmsBridge.js):
 *   SmsBackground.send({ to: String, body: String })
 */
class SmsBackgroundPlugin {
  data class SendRequest(
    val to: String,
    val body: String,
  )

  data class SendResult(
    val success: Boolean,
    val message: String = "",
  )

  /**
   * TODO: Wire into Android SmsManager in the native Android project.
   * This repository currently does not include the generated Capacitor Android module.
   */
  fun send(request: SendRequest): SendResult {
    if (request.to.isBlank()) return SendResult(false, "Recipient is required")
    if (request.body.isBlank()) return SendResult(false, "Message body is required")
    return SendResult(false, "Native SMS sending not wired in this repository yet")
  }
}
