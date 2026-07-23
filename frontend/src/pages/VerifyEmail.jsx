import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Crest from "../components/Crest";
import { Button } from "../components/ui/button";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("Missing verification token."); return; }
    api.post(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async () => {
        setStatus("success");
        try { await refresh(); } catch {}
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e.response?.data?.detail || "This verification link is invalid or has expired.");
      });
    // eslint-disable-next-line
  }, [token]);

  return (
    <div className="min-h-screen crest-container flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <Link to="/" className="inline-flex flex-col items-center mb-6"><Crest size={64}/></Link>
        <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8" data-testid="verify-email-card">
          {status === "verifying" && (
            <>
              <h1 className="font-serif text-2xl text-navy mb-2">Confirming your email…</h1>
              <p className="text-sm text-gray-600">One moment.</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="text-5xl text-teal mb-3" data-testid="verify-success-icon">✓</div>
              <h1 className="font-serif text-2xl text-navy mb-2">Email confirmed</h1>
              <p className="text-sm text-gray-600 mb-6">You're all set. Time to go make a difference.</p>
              <Button onClick={() => nav("/")} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="verify-continue-btn">
                Continue
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="font-serif text-2xl text-navy mb-2">Verification failed</h1>
              <p className="text-sm text-gray-600 mb-6" data-testid="verify-error-msg">{message}</p>
              <Link to="/login"><Button variant="outline" className="border-navy text-navy hover:bg-navy hover:text-white rounded-md">Back to login</Button></Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
