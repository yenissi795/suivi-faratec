import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";

// --- TYPES ---
interface AuthContextType {
  user: any;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ error: "Non initialisé" }),
  signUp: async () => ({ error: "Non initialisé" }),
  signOut: async () => {},
});

// --- PROVIDER ---
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Récupérer la session au démarrage
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Erreur getSession:", error.message);
          setUser(null);
        } else {
          setUser(session?.user ?? null);
        }
      } catch (err) {
        console.error("Erreur init auth:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // 2. Écouter les changements d'état
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);

      if (event === "SIGNED_OUT") {
        setUser(null);
      } else if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        setUser(session?.user ?? null);
      } else if (event === "INITIAL_SESSION") {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    // 3. Rafraîchir le token toutes les 30 minutes
    const refreshInterval = setInterval(async () => {
      try {
        const { data: { session }, error } = await supabase.auth.refreshSession();
        if (error) {
          console.warn("Rafraîchissement échoué:", error.message);
          setUser(null); // Force la déconnexion propre
        } else if (session) {
          setUser(session.user);
        }
      } catch (err) {
        console.error("Erreur refresh token:", err);
      }
    }, 30 * 60 * 1000);

    // 4. Rafraîchir aussi quand l'onglet redevient visible (retour sur l'app)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        try {
          const { data: { session }, error } = await supabase.auth.refreshSession();
          if (error) {
            console.warn("Rafraîchissement au retour échoué:", error.message);
            setUser(null);
          } else if (session) {
            setUser(session.user);
          }
        } catch (err) {
          console.error("Erreur refresh au retour:", err);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      listener.subscription.unsubscribe();
      clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // --- CONNEXION ---
  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? error.message : null };
    } catch (err: any) {
      return { error: err.message || "Erreur inconnue" };
    }
  };

  // --- INSCRIPTION ---
  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error ? error.message : null };
    } catch (err: any) {
      return { error: err.message || "Erreur inconnue" };
    }
  };

  // --- DÉCONNEXION ---
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("Erreur signOut:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// --- HOOK ---
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur d'un AuthProvider");
  }
  return context;
}