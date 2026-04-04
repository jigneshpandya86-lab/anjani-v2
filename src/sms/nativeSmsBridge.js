const getCapacitorPlugins = () => {
  if (typeof window === 'undefined') return {}
  return window?.Capacitor?.Plugins || {}
}

const getSmsPlugin = () => {
  const plugins = getCapacitorPlugins()
  return plugins.SmsBackground || plugins.SMSBackground || null
}

export const isNativeSmsAvailable = () => {
  const plugin = getSmsPlugin()
  return Boolean(plugin && typeof plugin.send === 'function')
}

export const sendSmsNative = async ({ to, body }) => {
  const plugin = getSmsPlugin()
  if (!plugin?.send) {
    throw new Error('Native SMS plugin bridge unavailable')
  }

  await plugin.send({ to, body })
}
