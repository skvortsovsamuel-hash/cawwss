import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { toast } from "sonner";

export default function VerifyBanner() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState(null);
  if (!user || user.role === "admin" || user.email_verified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await api.post("/auth/resend-verification");
      toast.success("Verification email sent. Check your inbox.");
    } catch { toast.error("Couldn't send email. Try again shortly."); }
    finally { setBusy(false); }
  };

  const getLink = async () => {
    setBusy(true);
    try {
      const r = await api.get("/auth/my-verify-link");
      if (r.data.already_verified) {
        toast.success("You're already verified!");
        await refresh();
        return;
      }
      setLink(r.data.verify_url);
      setExpanded(true);
    } catch { toast.error("Couldn't get link."); }
    finally { setBusy(false); }
  };

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="bg-gold/15 border-b border-gold/40" data-testid="verify-email-banner">
      <div className="max-w-6xl mx-auto px-6 py-2.5 flex justify-between items-center gap-4 flex-wrap text-sm">
        <div className="text-navy">
          <span className="font-medium">Verify your email</span> — sent to <span className="font-medium">{user.email}</span>.
          {!expanded && (
            <button onClick={() => setExpanded(true)}
                    className="ml-2 text-xs text-gray-600 hover:text-navy underline underline-offset-2"
                    data-testid="verify-not-received-btn">
              Didn't get it?
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={resend} disabled={busy}
                  className="text-teal hover:text-teal-hover font-medium underline underline-offset-2"
                  data-testid="resend-verify-btn">
            {busy && !link ? "Sending…" : "Resend link"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="max-w-6xl mx-auto px-6 pb-3 -mt-1" data-testid="verify-help-expanded">
          <div className="bg-white border border-gold/50 rounded-md p-4 text-sm text-navy">
            <div className="font-medium mb-1">Still can't find the email?</div>
            <p className="text-gray-600 text-xs mb-3">
              Some email providers (or our email service's sandbox mode) can silently block delivery. You can
              generate your personal verification link and open it directly — it's tied to your account and safe to use.
            </p>
            {!link ? (
              <button onClick={getLink} disabled={busy}
                      className="text-teal hover:text-teal-hover font-medium underline underline-offset-2"
                      data-testid="get-my-verify-link-btn">
                {busy ? "Loading…" : "Get my verification link"}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={link} className="text-teal underline font-medium break-all" data-testid="my-verify-link">
                    {link}
                  </a>
                </div>
                <div className="flex gap-3">
                  <button onClick={copyLink} className="text-xs text-navy hover:text-teal underline underline-offset-2" data-testid="copy-verify-link-btn">Copy link</button>
                  <a href={link} className="text-xs text-navy hover:text-teal underline underline-offset-2" data-testid="open-verify-link">Open in this tab</a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
