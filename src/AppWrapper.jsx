import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { useMemo, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { AppProvider } from "./contexts/AppContext";
import { TaxProvider } from "./contexts/TaxContext";
import { ExpenseProvider } from "./contexts/ExpenseContext";
import { AppRouter } from "./Router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster, toast } from "./components/ui/Toaster";
import { ConfirmDialogHost } from "./components/ui/ConfirmDialog";
import { shouldUseRedirectAuth } from "./utils/authHelpers";

/**
 * AppWrapper - Main application wrapper
 * Handles Firebase initialization and provides global context
 */

// Firebase Configuration
// Uses environment variables if available, otherwise falls back to production config
// Note: Firebase API keys are safe to be public - security comes from Firebase Security Rules
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD9sA1Vz3Cmw28kkvaEs1SaTucJY1SvNTQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "rafchu-tcg-app.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "rafchu-tcg-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "rafchu-tcg-app.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1045008710585",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1045008710585:web:bafe104ec40fdaf3e71468",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

// Initialize Firebase
let app, auth, db;
let useEmulators = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  getAnalytics(app);
  
  // Connect to emulators only when explicitly opted in via VITE_USE_EMULATORS=true
  if (import.meta.env.VITE_USE_EMULATORS === "true" && !useEmulators) {
    try {
      connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "localhost", 8080);
      connectFunctionsEmulator(getFunctions(app), "localhost", 5001);
      connectStorageEmulator(getStorage(app), "localhost", 9199);
      useEmulators = true;
      console.log("🔧 Connected to Firebase Emulators");
      console.log("   Auth: http://localhost:9099");
      console.log("   Firestore: localhost:8080");
      console.log("   Emulator UI: http://localhost:4000");
    } catch (emulatorError) {
      console.warn("⚠️ Could not connect to emulators (they may not be running):", emulatorError.message);
      console.log("💡 To start emulators: firebase emulators:start");
    }
  }
  
  if (!useEmulators) {
    console.log("✅ Firebase connected to PRODUCTION");
    console.log("✅ Firebase Analytics initialized");
  }
} catch (error) {
  // Handle hot-reload in development
  try {
    auth = getAuth();
    db = getFirestore();
  } catch {
    console.error("Failed to initialize Firebase", error);
  }
}

const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

export function AppWrapper() {
  // Complete any in-flight redirect-based Google sign-in. When the user is
  // bounced through `rafchu-tcg-app.firebaseapp.com/__/auth/handler` and back,
  // the credential is delivered here on next page load. We swallow the
  // "no redirect in progress" case silently — that's the common path.
  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).catch((err) => {
      if (err?.code && err.code !== "auth/no-auth-event") {
        console.error("Redirect sign-in failed:", err);
        toast.error("Sign-in failed: " + (err.message || err.code));
      }
    });
  }, []);

  // Google Sign-In via Firebase Auth's built-in handler. This routes through
  // `rafchu-tcg-app.firebaseapp.com/__/auth/handler`, which means the origin
  // the app is loaded from does NOT need to be registered as an OAuth
  // "Authorized JavaScript origin" — only as a Firebase Auth authorized
  // domain. This avoids the `Error 400: origin_mismatch` GIS path entirely.
  const handleGoogleLogin = useMemo(() => async () => {
    if (!auth) {
      toast.error("Authentication not initialized");
      return;
    }

    const provider = new GoogleAuthProvider();

    if (shouldUseRedirectAuth(
      navigator.userAgent,
      navigator.maxTouchPoints,
      window.location.hostname,
    )) {
      await signInWithRedirect(auth, provider);
      return;
    }

    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err?.code && POPUP_FALLBACK_CODES.has(err.code)) {
        await signInWithRedirect(auth, provider);
        return;
      }
      console.error("Google sign-in failed:", err);
      toast.error("Sign-in failed: " + (err.message || "Unknown error"));
      throw err;
    }
  }, []);

  // Email/Password Sign Up
  const handleEmailSignUp = useMemo(() => async (email, password, displayName) => {
    if (!auth) {
      throw new Error("Authentication not initialized");
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Set display name
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
      return userCredential.user;
    } catch (err) {
      console.error("Email sign up failed", err);
      throw err;
    }
  }, []);

  // Email/Password Sign In
  const handleEmailLogin = useMemo(() => async (email, password) => {
    if (!auth) {
      throw new Error("Authentication not initialized");
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("Email login failed", err);
      throw err;
    }
  }, []);

  // Password Reset
  const handlePasswordReset = useMemo(() => async (email) => {
    if (!auth) {
      throw new Error("Authentication not initialized");
    }
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      console.error("Password reset failed", err);
      throw err;
    }
  }, []);

  // Logout
  const handleLogout = useMemo(() => async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.error("Logout failed", err);
      toast.error(`Logout failed: ${err.message}`);
    }
  }, []);

  const authHandlers = useMemo(() => ({
    onGoogleLogin: handleGoogleLogin,
    onEmailSignUp: handleEmailSignUp,
    onEmailLogin: handleEmailLogin,
    onPasswordReset: handlePasswordReset,
    onLogout: handleLogout,
  }), [handleGoogleLogin, handleEmailSignUp, handleEmailLogin, handlePasswordReset, handleLogout]);

  return (
    <ErrorBoundary>
      <AppProvider auth={auth} db={db} authHandlers={authHandlers}>
        <TaxProvider>
          <ExpenseProvider>
            <AppRouter 
              onGoogleLogin={handleGoogleLogin}
              onEmailSignUp={handleEmailSignUp}
              onEmailLogin={handleEmailLogin}
              onPasswordReset={handlePasswordReset}
              onLogout={handleLogout} 
            />
          </ExpenseProvider>
        </TaxProvider>
      </AppProvider>
      <Toaster />
      <ConfirmDialogHost />
    </ErrorBoundary>
  );
}
