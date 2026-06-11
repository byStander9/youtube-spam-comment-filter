import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: "src/content/content.ts",
        popup: "popup.html"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  }
});
