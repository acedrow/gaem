import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// When VITE_CF_DEV is set (npm run dev:cf), the client talks to the wrangler
// worker on :8787 via same-origin paths so it matches production. Vite proxies
// API/WS to wrangler; static assets are served from publicDir by Vite directly.
const cfDev = !!process.env.VITE_CF_DEV;
const workerTarget = "http://localhost:8787";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: cfDev
      ? {
          "/api": { target: workerTarget, changeOrigin: true },
          "/ws": { target: workerTarget, changeOrigin: true, ws: true },
        }
      : undefined,
  },
});
