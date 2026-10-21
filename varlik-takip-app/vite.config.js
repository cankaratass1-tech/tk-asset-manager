import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './', // göreli asset yolları: uygulama kök dizinde ya da bir alt yolda servis edilebilir
  plugins: [react()],
  server: {
    host: true, // ağdaki diğer bilgisayarlardan da erişilebilsin diye tüm arayüzlerde dinle
  },
})
