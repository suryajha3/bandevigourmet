import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
        policies: resolve(__dirname, "policies.html"),
        products: resolve(__dirname, "products.html"),
        account: resolve(__dirname, "account.html"),
        wholesale: resolve(__dirname, "wholesale.html"),
        about: resolve(__dirname, "about.html")
      }
    }
  }
});
