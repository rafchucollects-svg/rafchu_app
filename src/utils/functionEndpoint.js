export const CLOUD_FUNCTIONS_BASE = (import.meta.env.VITE_CLOUD_FUNCTIONS_BASE ||
  (import.meta.env.VITE_USE_EMULATORS === "true"
    ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID || "rafchu-tcg-app"}/us-central1`
    : "https://us-central1-rafchu-tcg-app.cloudfunctions.net")).replace(/\/$/, "");
