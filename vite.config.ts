import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  // Inject the package.json version as a global so the footer (and any other
  // surface that needs it) renders the deployed build label. Stops the
  // hand-edited "Build RC5.27" string from drifting against the actual build.
  // Pair with the "bump version on every push" protocol — every change to
  // master/next must bump package.json so G can verify the deploy landed.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
