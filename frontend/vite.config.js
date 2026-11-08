import { defineConfig } from "vite";

// Request /api diteruskan ke Flask (port 5000), jadi tidak perlu mengatur CORS saat development.
export default defineConfig({
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:5000" } },
});
