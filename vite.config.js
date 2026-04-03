import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-hot-toast': path.resolve(__dirname, 'src/shims/react-hot-toast.js'),
    },
  },
  base: '/anjani-v2/', 
})
