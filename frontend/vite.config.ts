import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true
  },
  preview: {
    host: true,
    allowedHosts: ["bookminds-frontend.onrender.com"]
    // OR use: allowedHosts: "all"
  }
})