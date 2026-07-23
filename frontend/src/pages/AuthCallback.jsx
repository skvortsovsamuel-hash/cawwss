import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { toast } from "sonner";
import Crest from "../components/Crest";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const nav = useNavigate();
  const { loginSession } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match ? decodeURIComponent(match[1]) : null;

    if (!sessionId) {
      toast.error("Missing session id");
      nav("/login", { replace: true });
      return;
    }

    api.post("/auth/google-session", { session_id: sessionId })
      .then((r) => {
        loginSession(r.data.user);
        // Clear hash from URL
        window.history.replaceState({}, "", window.location.pathname);
        const role = r.data.user.role;
        const dest = role === "admin" ? "/admin"
                   : role === "ngo" ? "/ngo"
                   : "/student";
        toast.success(`Welcome, ${r.data.user.name?.split(" ")[0] || ""}`);
        nav(dest, { replace: true });
      })
      .catch((e) => {
        toast.error(e.response?.data?.detail || "Google sign-in failed");
        nav("/login", { replace: true });
      });
    // eslint-disable-next-line
  }, []);

  return (
    <div className="min-h-screen crest-container flex items-center justify-center px-6">
      <div className="text-center">
        <div className="flex justify-center mb-6"><Crest size={64}/></div>
        <div className="font-serif text-2xl text-navy mb-2">Signing you in…</div>
        <div className="text-sm text-gray-500">One moment.</div>
      </div>
    </div>
  );
}
