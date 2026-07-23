import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'KAD Mobile - Kinross Active Directory',
        short_name: 'KAD Mobile',
        description: 'Gestão de Identidades e Acessos Kinross',
        theme_color: '#1e1e1e',
        background_color: '#121212',
        display: 'standalone', // Faz abrir em tela cheia, como um app nativo
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    host: true, // Permite acesso pela rede local
    port: 5173
  }
})