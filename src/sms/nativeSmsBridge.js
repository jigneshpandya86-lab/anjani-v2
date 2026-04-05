const getCapacitorPlugins = () => {
  if (typeof window === 'undefined') return {}
  const plugins = window?.Capacitor?.Plugins || {}
  console.log('🔍 Capacitor Plugins available:', Object.keys(plugins))
  return plugins
}

const getSmsPlugin = () => {
  const plugins = getCapacitorPlugins()
  const plugin = plugins.SmsBackground || null
  console.log('📱 SmsBackground plugin found:', !!plugin)
  if (plugin) {
    console.log('✅ Plugin has send method:', typeof plugin.send === 'function')
  }
  return plugin
}

export const isNativeSmsAvailable = () => {
  const plugin = getSmsPlugin()
  const available = Boolean(plugin && typeof plugin.send === 'function')
  console.log('🔌 Native SMS Available:', available)
  return available
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
