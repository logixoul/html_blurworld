import { defineConfig } from "vite";

export default defineConfig({
  base: "/glass-modeling/",
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true
  }
});
