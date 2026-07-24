import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/api": { target: "http://localhost:3000", changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/@astryxdesign/")) return "astryx-vendor";
          if (id.includes("/react-router") || id.includes("/react-dom/") || id.includes("/react/")) return "react-vendor";
          if (id.includes("/@tanstack/")) return "query-vendor";
          if (id.includes("/lucide-react/")) return "icons-vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
