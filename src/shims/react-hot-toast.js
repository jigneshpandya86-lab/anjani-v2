function noopToast() {
  return 'toast-shim'
}

noopToast.success = noopToast
noopToast.error = noopToast
noopToast.dismiss = () => {}
noopToast.remove = () => {}

export function Toaster() {
  return null
}

export default noopToast
