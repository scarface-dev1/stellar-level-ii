import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the SDK / wallet-kit / React vendor code into their own
        // chunks so the app entry stays small and cached separately.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@stellar/stellar-sdk")) return "stellar-sdk";
          if (id.includes("@creit.tech/stellar-wallets-kit")) return "wallets-kit";
          return "vendor";
        },
      },
    },
  },
});
