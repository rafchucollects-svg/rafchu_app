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
  build: {
    // Default is 500kb; we've been blowing past it on the main chunk. We now
    // split vendors below, so the warning is only meaningful if the *app*
    // chunk itself grows — bump the floor so we only bark on real regressions.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        // Split heavy vendor libs into their own chunks so they cache
        // independently from our app code. A change to a single page no longer
        // invalidates Firebase/React/framer-motion in users' browser caches,
        // which is a huge win for repeat visits.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase/")) return "vendor-firebase";
          if (id.includes("@firebase/")) return "vendor-firebase";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("jspdf") || id.includes("html2canvas")) return "vendor-pdf";
          if (id.includes("signature_pad")) return "vendor-signature";
          if (id.includes("react-router-dom") || id.includes("/react-router/")) return "vendor-router";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("scheduler")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
});
