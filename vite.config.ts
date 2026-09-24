import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), {
    name: "cuer-qr-zero-border",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "qr" && importer?.replaceAll("\\", "/").endsWith("/cuer/_dist/QrCode.js")) {
        return new URL("./src/compat/cuer-qr.ts", import.meta.url).pathname;
      }
    },
  }],
  build: {
    // Inline assets under 4KB
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Deterministic chunk names for SRI hashing
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    port: 5173,
  },
});
