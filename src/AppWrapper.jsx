import { useMemo, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithCredential,
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
let app, auth, db, analytics;
let useEmulators = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  analytics = getAnalytics(app);
  
  // Connect to emulators only when explicitly opted in via VITE_USE_EMULATORS=true
  if (import.meta.env.VITE_USE_EMULATORS === "true" && !useEmulators) {
    try {
      connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "localhost", 8080);
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

export function AppWrapper() {
  // Clean up any leftover GIS modal on auth state change
  useEffect(() => {
    const container = document.getElementById("gsi-btn-container");
    if (container) container.remove();
  }, []);

  // Google Sign-In using Google Identity Services (GIS) — bypasses redirect_uri entirely
  const handleGoogleLogin = useMemo(() => () => {
    if (!auth) {
      toast.error("Authentication not initialized");
      return;
    }

    // Wait for GIS script to load
    if (!window.google?.accounts?.id) {
      toast.info("Google sign-in is loading, please try again in a moment.");
      return;
    }

    const GOOGLE_CLIENT_ID = "1045008710585-kh31cut39285d0vo20o3481nsv9qvtk3.apps.googleusercontent.com";

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const credential = GoogleAuthProvider.credential(response.credential);
          await signInWithCredential(auth, credential);
          // Remove GIS modal if present
          const container = document.getElementById("gsi-btn-container");
          if (container) container.remove();
        } catch (err) {
          console.error("Firebase credential sign-in failed:", err);
          toast.error("Sign-in failed: " + (err.message || "Unknown error"));
        }
      },
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap not available (e.g. user dismissed it before, or 3rd party cookies blocked)
        // Fall back to the button/popup flow
        const btnContainer = document.createElement("div");
        btnContainer.id = "gsi-btn-container";
        btnContainer.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;";
        
        const inner = document.createElement("div");
        inner.style.cssText = "background:white;border-radius:16px;padding:32px;text-align:center;max-width:360px;width:90%;";
        inner.innerHTML = '<p style="margin-bottom:16px;font-weight:600;font-size:16px;">Sign in with Google</p><div id="gsi-btn"></div><button id="gsi-cancel" style="margin-top:16px;padding:8px 16px;border:1px solid #ddd;border-radius:8px;background:white;cursor:pointer;font-size:14px;">Cancel</button>';
        btnContainer.appendChild(inner);
        document.body.appendChild(btnContainer);

        window.google.accounts.id.renderButton(
          document.getElementById("gsi-btn"),
          { theme: "outline", size: "large", width: 280, text: "signin_with" }
        );

        document.getElementById("gsi-cancel").onclick = () => {
          btnContainer.remove();
        };
        btnContainer.onclick = (e) => {
          if (e.target === btnContainer) btnContainer.remove();
        };
      }
    });
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

