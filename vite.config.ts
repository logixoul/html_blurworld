import { defineConfig } from "vite";

export default defineConfig({
  base: "/erosion/",
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true
  }
});
