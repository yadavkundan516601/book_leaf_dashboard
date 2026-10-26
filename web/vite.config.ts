import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Also carries the SSE stream (/api/v1/events); Vite's proxy streams responses.
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
