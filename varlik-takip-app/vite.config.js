import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Electron dist'i file:// üzerinden yükleyecek — göreli asset yolları gerekiyor
  plugins: [react()],
  server: {
    host: true, // ağdaki diğer bilgisayarlardan da erişilebilsin diye tüm arayüzlerde dinle
  },
})
