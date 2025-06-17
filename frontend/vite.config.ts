import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import serveStatic from "vite-plugin-serve-static";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1800,
  },
  plugins: [
    react(),
    serveStatic([
      {
        pattern: /^\/artifact\/(.*)/,
        resolve: (groups) => path.join("../backend/agent_sessions/", decodeURI(groups[1])),
      },
    ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        ws: true,
        //rewrite: path => path.replace(/^\/api/, ''),
      },

    },
  }
})
