import { execFileSync } from "node:child_process";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const SERVER_DIR = path.resolve(import.meta.dirname, "server");

/** Static build: point the server's Node-only modules at their in-browser versions. */
function browserServer(): Plugin {
  const swaps: Record<string, string> = {
    db: path.resolve(import.meta.dirname, "src/static/db.ts"),
    dataFiles: path.resolve(import.meta.dirname, "src/static/dataFiles.ts"),
  };
  return {
    name: "chemstock-browser-server",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer?.startsWith(SERVER_DIR)) return null;
      const name = /^\.\.?\/(?:\.\.\/)?(db|dataFiles)$/.exec(source)?.[1];
      return name ? swaps[name] : null;
    },
  };
}

/** Writes dist/chemstock-seed.tar.gz from the default spreadsheet, so a plain `vite build` ships the data. */
function writeSeed(): Plugin {
  return {
    name: "chemstock-seed",
    apply: "build",
    closeBundle() {
      execFileSync(path.resolve(import.meta.dirname, "node_modules/.bin/tsx"), ["scripts/build_static_seed.ts"], {
        stdio: "inherit",
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Hosts run `vite build` with no flags. That build must contain the data; only --mode server is the Node version.
  const browser = command === "build" && mode !== "server";
  return {
  plugins: [
    browser && browserServer(),
    browser && writeSeed(),
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
        // The static build bundles the database engine, so it must be cached to work offline.
        maximumFileSizeToCacheInBytes: browser ? 40 * 1024 * 1024 : undefined,
        globPatterns: browser ? ["**/*.{js,css,html,svg,png,woff2,wasm,data,gz}"] : undefined,
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
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  build: { chunkSizeWarningLimit: 900, target: "es2022" },
};
});
