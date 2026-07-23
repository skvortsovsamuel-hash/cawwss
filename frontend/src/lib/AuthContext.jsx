import { createContext, useContext, useEffect, useState } from "react";
import { api, setAuth, clearAuth, getUser, getToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If returning from Google OAuth callback, let AuthCallback handle the exchange
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    // Attempt /auth/me: works whether we have a JWT in localStorage OR a session_token cookie
    api.get("/auth/me").then((r) => {
      setUser(r.data);
      localStorage.setItem("caws_user", JSON.stringify(r.data));
    }).catch(() => {
      clearAuth();
      setUser(null);
    }).finally(() => setLoading(false));
  }, []);

  const login = (token, u) => { setAuth(token, u); setUser(u); };
  const loginSession = (u) => {
    // Cookie-based session (Google) — no bearer token stored
    localStorage.removeItem("caws_token");
    localStorage.setItem("caws_user", JSON.stringify(u));
    setUser(u);
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    clearAuth();
    setUser(null);
  };
  const refresh = async () => {
    const r = await api.get("/auth/me");
    setUser(r.data);
    localStorage.setItem("caws_user", JSON.stringify(r.data));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginSession, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
