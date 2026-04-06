const getCapacitorPlugins = () => {
  if (typeof window === 'undefined') return {}
  const plugins = window?.Capacitor?.Plugins || {}
  const pluginNames = Object.keys(plugins)
  console.log('🔍 Capacitor Plugins available:', pluginNames)
  return plugins
}

const getSmsPlugin = () => {
  const plugins = getCapacitorPlugins()
  const plugin = plugins.SmsBackground || null
  const found = !!plugin
  console.log('📱 SmsBackground plugin found:', found)
  if (plugin) {
    const hasSend = typeof plugin.send === 'function'
    console.log('✅ Plugin has send method:', hasSend)
  }
  return plugin
}

export const isNativeSmsAvailable = () => {
  const plugin = getSmsPlugin()
  const available = Boolean(plugin && typeof plugin.send === 'function')
  console.log('🔌 Native SMS Available:', available)
  return available
}

/**
 * Get plugin detection details for debugging
 * Returns object with plugin availability and method info
 */
export const getPluginDetectionInfo = () => {
  if (typeof window === 'undefined') {
    return { available: false, reason: 'window_undefined', pluginList: [] }
  }

  const plugins = window?.Capacitor?.Plugins || {}
  const pluginList = Object.keys(plugins)
  const plugin = plugins.SmsBackground

  if (!plugin) {
    return {
      available: false,
      reason: 'SmsBackground_not_in_plugins',
      pluginList,
    }
  }

  const hasSend = typeof plugin.send === 'function'
  if (!hasSend) {
    return {
      available: false,
      reason: 'send_method_missing',
      pluginList,
      methods: Object.keys(plugin),
    }
  }

  return {
    available: true,
    reason: 'plugin_ready',
    pluginList,
    methods: Object.keys(plugin),
  }
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
