import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now().toString()),
  },
})
