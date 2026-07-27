import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

export default function NGOPending() {
  const { user, refresh } = useAuth();
  const [ngo, setNgo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const load = async () => {
    try { const r = await api.get("/ngo/me"); setNgo(r.data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post("/ngo/upload-legitimacy", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  useEffect(() => {
    // Poll status every 15s in case admin approves
    const id = setInterval(() => { load(); refresh(); }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8 text-center">
          <div className="inline-block px-3 py-1 text-xs tracking-widest uppercase bg-gold/10 text-gold rounded mb-4" data-testid="ngo-status-badge">
            {ngo?.status === "approved" ? "Approved" : ngo?.status === "rejected" ? "Rejected" : "Under Review"}
          </div>
          <h1 className="font-serif text-3xl text-navy mb-3">
            {ngo?.status === "approved" ? "You're all set" : "Thanks for registering"}
          </h1>
          <p className="text-gray-600 mb-8 max-w-lg mx-auto">
            {ngo?.status === "approved"
              ? "Your organization has been approved. Head to your dashboard to post opportunities."
              : "Our team will verify your organization within 1–2 business days. Please upload your legitimacy document (501(c)(3) letter, EIN letter, or registration certificate)."}
          </p>
          {ngo?.status === "pending" && (
            <div className="max-w-md mx-auto text-left border border-dashed border-[color:var(--caws-border)] rounded p-6">
              <div className="font-serif text-lg text-navy mb-2">Legitimacy document</div>
              <p className="text-sm text-gray-600 mb-4">PDF or image, max 10MB.</p>
              {ngo?.legitimacy_doc_id ? (
                <div className="text-sm text-teal" data-testid="doc-uploaded-status">Document uploaded ✓ (awaiting review)</div>
              ) : (
                <>
                  <input type="file" ref={fileInput} onChange={upload} accept=".pdf,.png,.jpg,.jpeg" hidden data-testid="ngo-doc-file-input"/>
                  <Button onClick={() => fileInput.current?.click()} disabled={uploading}
                          className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="ngo-upload-doc-btn">
                    {uploading ? "Uploading..." : "Upload document"}
                  </Button>
                </>
              )}
            </div>
          )}
          {ngo?.status === "approved" && (
            <Button onClick={() => window.location.href = "/ngo"} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="go-to-dashboard-btn">
              Go to dashboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
