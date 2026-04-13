import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 8080,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        //rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
