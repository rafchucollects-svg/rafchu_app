import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // In production builds, drop all console.* calls and debugger statements.
  // Error reporting in prod should go through a real logger (or Sentry/etc),
  // not scattered console.logs. This also shrinks the bundle a bit.
  // `console.error` and `console.warn` are kept because some libraries
  // (Firebase, React) emit important diagnostics through them.
  esbuild: {
    pure: ["console.log", "console.debug", "console.info", "console.trace"],
    drop: ["debugger"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
});
