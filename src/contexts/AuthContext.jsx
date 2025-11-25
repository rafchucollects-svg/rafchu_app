import { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * AuthContext provides authentication state and user profile
 * This changes infrequently (only on login/logout)
 */

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children, auth, db, authHandlers }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Auth listener
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      // Check if user has completed onboarding
      if (currentUser && db) {
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const profile = userSnap.data();
            setUserProfile(profile);
            setNeedsOnboarding(!profile.onboardingCompleted);
          } else {
            setUserProfile(null);
            setNeedsOnboarding(true);
          }
        } catch (error) {
          console.error("Failed to load user profile:", error);
          setNeedsOnboarding(true);
        }
      } else {
        setUserProfile(null);
        setNeedsOnboarding(false);
      }
    });

    return () => unsubscribe();
  }, [auth, db]);

  const value = {
    // Auth
    user,
    userProfile,
    setUserProfile,
    needsOnboarding,
    setNeedsOnboarding,
    auth,
    db,
    authHandlers,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

