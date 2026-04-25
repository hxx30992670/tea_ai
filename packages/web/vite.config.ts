import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

function getDemoEnabled(mode: string) {
  const repoRoot = path.resolve(__dirname, "../..");
  const rootEnv = loadEnv(mode, repoRoot, "");
  const packageEnv = loadEnv(mode, __dirname, "");

  return packageEnv.VITE_APP_DEMO_ENABLED
    ?? packageEnv.APP_DEMO_ENABLED
    ?? rootEnv.APP_DEMO_ENABLED
    ?? rootEnv.VITE_APP_DEMO_ENABLED
    ?? "";
}

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_APP_DEMO_ENABLED": JSON.stringify(getDemoEnabled(mode)),
  },
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
}));
