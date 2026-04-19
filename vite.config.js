import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {},
  },
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  server: {
    middlewareMode: false,
  },
  esbuild: {
    // Strip console.log/debug/info and debugger statements from production
    // bundles so debug output never reaches end users. Errors/warnings are
    // retained on purpose — they still go to Sentry / browser DevTools if set.
    drop: ['debugger'],
    pure: ['console.log', 'console.debug', 'console.info'],
  },
})
