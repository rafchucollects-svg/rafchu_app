import { createContext, useContext } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { CollectionProvider, useCollection } from "./CollectionContext";
import { UIProvider, useUI } from "./UIContext";

/**
 * AppContext combines Auth, Collection, and UI contexts
 * This provides backward compatibility while splitting concerns for better performance
 */

const AppContext = createContext(null);

export const useApp = () => {
  const auth = useAuth();
  const collection = useCollection();
  const ui = useUI();

  // Combine all contexts into one for backward compatibility
  return {
    ...auth,
    ...collection,
    ...ui,
  };
};

export const AppProvider = ({ children, auth, db, authHandlers }) => {
  return (
    <AuthProvider auth={auth} db={db} authHandlers={authHandlers}>
      <CollectionProvider>
        <UIProvider>
          {children}
        </UIProvider>
      </CollectionProvider>
    </AuthProvider>
  );
};

