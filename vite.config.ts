import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "ChemStock – Chemical Inventory",
        short_name: "ChemStock",
        description: "Find, locate and manage laboratory chemicals.",
        theme_color: "#173B57",
        background_color: "#F7F9FA",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Read-only API calls fall back to the last response when offline.
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "GET" && !url.pathname.startsWith("/api/export"),
            handler: "NetworkFirst",
            options: {
              cacheName: "chemstock-api",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { chunkSizeWarningLimit: 900 },
});
