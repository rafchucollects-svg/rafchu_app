import { useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { AppProvider } from "./contexts/AppContext";
import { AppRouter } from "./Router";

/**
 * AppWrapper - Main application wrapper
 * Handles Firebase initialization and provides global context
 */

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9sA1Vz3Cmw28kkvaEs1SaTucJY1SvNTQ",
  authDomain: "rafchu-tcg-app.firebaseapp.com",
  projectId: "rafchu-tcg-app",
  storageBucket: "rafchu-tcg-app.firebasestorage.app",
  messagingSenderId: "1045008710585",
  appId: "1:1045008710585:web:bafe104ec40fdaf3e71468",
  measurementId: "G-079QZV72HK",
};

// Initialize Firebase
let app, auth, db, analytics;
let useEmulators = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  analytics = getAnalytics(app);
  
  // Connect to emulators in development mode
  if (import.meta.env.DEV && !useEmulators) {
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
  // Google Sign-In
  const handleGoogleLogin = useMemo(() => async () => {
    if (!auth) {
      alert("Authentication not initialized");
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Google login failed", err);
      if (err.code !== "auth/popup-closed-by-user") {
        throw err;
      }
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
      alert(`Logout failed: ${err.message}`);
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
    <AppProvider auth={auth} db={db} authHandlers={authHandlers}>
      <AppRouter 
        onGoogleLogin={handleGoogleLogin}
        onEmailSignUp={handleEmailSignUp}
        onEmailLogin={handleEmailLogin}
        onPasswordReset={handlePasswordReset}
        onLogout={handleLogout} 
      />
    </AppProvider>
  );
}

