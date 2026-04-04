const getCapacitorPlugins = () => {
  if (typeof window === 'undefined') return {}
  return window?.Capacitor?.Plugins || {}
}

const getSmsPlugin = () => {
  const plugins = getCapacitorPlugins()
  return plugins.SmsBackground || plugins.SMSBackground || window?.SmsBackground || null
}

export const isNativeSmsAvailable = () => {
  const plugin = getSmsPlugin()
  return Boolean(plugin && typeof plugin.send === 'function')
}

export const sendSmsNative = async ({ to, body }) => {
  const plugin = getSmsPlugin()
  const sendMethod = plugin?.send || plugin?.sendSms
  if (!sendMethod) {
    throw new Error('Native SMS plugin bridge unavailable')
  }

  const result = await sendMethod.call(plugin, { to, body })
  if (result && typeof result === 'object') {
    return {
      success: result.success !== false,
      message: result.message || '',
    }
  }

  return { success: true, message: '' }
}
