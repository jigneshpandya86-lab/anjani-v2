package com.anjani.app.sms

import android.Manifest
import android.content.pm.PackageManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Expected JS contract (see src/sms/nativeSmsBridge.js):
 *   SmsBackground.send({ to: String, body: String })
 */
@CapacitorPlugin(
  name = "SmsBackground",
  permissions = [
    Permission(
      alias = "sms",
      strings = [Manifest.permission.SEND_SMS]
    )
  ]
)
class SmsBackgroundPlugin : Plugin() {
  @PluginMethod
  fun send(call: PluginCall) {
    val to = call.getString("to", "")?.trim().orEmpty()
    val body = call.getString("body", "")?.trim().orEmpty()

    if (to.isBlank()) {
      call.reject("Recipient is required")
      return
    }
    if (body.isBlank()) {
      call.reject("Message body is required")
      return
    }

    if (getPermissionState("sms") != PermissionState.GRANTED) {
      requestPermissionForAlias("sms", call, "smsPermissionCallback")
      return
    }

    try {
      val smsManager = context.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
      smsManager.sendTextMessage(to, null, body, null, null)
      val result = JSObject()
      result.put("success", true)
      result.put("message", "SMS sent")
      call.resolve(result)
    } catch (error: Throwable) {
      call.reject(error.message ?: "SMS send failed")
    }
  }

  @PermissionCallback
  private fun smsPermissionCallback(call: PluginCall) {
    if (getPermissionState("sms") == PermissionState.GRANTED) {
      send(call)
      return
    }

    val hasSmsPermission = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.SEND_SMS
    ) == PackageManager.PERMISSION_GRANTED

    if (hasSmsPermission) {
      send(call)
      return
    }

    call.reject("SEND_SMS permission not granted")
  }
}
