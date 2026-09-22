import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Em dev local, encaminha para scripts/dev-api-server.ts (sem depender do `vercel dev`).
      '/api': 'http://localhost:3001',
    },
  },
})
