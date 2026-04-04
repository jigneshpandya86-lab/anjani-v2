package com.anjani.app.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat

/**
 * Scaffold for Capacitor-native SMS bridge.
 *
 * Expected JS contract (see src/sms/nativeSmsBridge.js):
 *   SmsBackground.send({ to: String, body: String })
 */
class SmsBackgroundPlugin(private val context: Context) {
  data class SendRequest(
    val to: String,
    val body: String,
  )

  data class SendResult(
    val success: Boolean,
    val message: String = "",
  )

  fun send(request: SendRequest): SendResult {
    if (request.to.isBlank()) return SendResult(false, "Recipient is required")
    if (request.body.isBlank()) return SendResult(false, "Message body is required")

    val hasSmsPermission = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.SEND_SMS
    ) == PackageManager.PERMISSION_GRANTED

    if (!hasSmsPermission) {
      return SendResult(false, "SEND_SMS permission not granted")
    }

    return try {
      val smsManager = context.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
      smsManager.sendTextMessage(request.to, null, request.body, null, null)
      SendResult(true, "SMS sent")
    } catch (error: Throwable) {
      SendResult(false, error.message ?: "SMS send failed")
    }
  }
}
