import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

export default function Settings() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/settings/me"); setData(r.data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setVisibility = async (v) => {
    try { await api.patch(`/settings/visibility?visibility=${v}`); toast.success("Privacy updated"); load(); }
    catch { toast.error("Failed"); }
  };
  const setMessagingAllowed = async (v) => {
    try {
      await api.patch("/settings/messaging", { messaging_allowed: v, notify_new_messages: data.notify_new_messages });
      toast.success("Updated"); load();
    } catch { toast.error("Failed"); }
  };
  const toggleNotifNewMsg = async () => {
    try {
      await api.patch("/settings/messaging", { messaging_allowed: data.messaging_allowed, notify_new_messages: !data.notify_new_messages });
      load();
    } catch { toast.error("Failed"); }
  };
  const unblock = async (uid) => {
    try { await api.post(`/settings/unblock/${uid}`); toast.success("Unblocked"); load(); }
    catch { toast.error("Failed"); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    try {
      await api.post("/settings/change-password", pw);
      toast.success("Password updated");
      setPw({ current_password: "", new_password: "" });
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const deleteAccount = async () => {
    const c1 = window.prompt("Type DELETE to permanently delete your account:");
    if (c1 !== "DELETE") return;
    if (!window.confirm("This is permanent. Continue?")) return;
    try {
      await api.delete("/settings/account");
      toast.success("Account deleted");
      await logout(); nav("/");
    } catch { toast.error("Failed"); }
  };

  if (loading || !data) return (
    <div className="min-h-screen"><Navbar/><div className="max-w-3xl mx-auto px-6 py-8 text-gray-500">Loading…</div></div>
  );

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="text-xs tracking-[0.2em] text-gold uppercase mb-2">Settings</div>
        <h1 className="font-serif text-3xl text-navy mb-8">Your account</h1>

        {/* Privacy */}
        {user?.role === "student" && (
          <Section title="Privacy" testId="settings-privacy">
            <Label className="text-sm">Profile visibility</Label>
            <div className="mt-2 grid md:grid-cols-3 gap-2">
              {[
                {v: "public", label: "Public", d: "Anyone can view"},
                {v: "ngos_only", label: "NGOs only", d: "Approved nonprofits"},
                {v: "private", label: "Private", d: "Only you"},
              ].map(o => (
                <button key={o.v} onClick={() => setVisibility(o.v)}
                        className={`p-3 rounded-md border text-left transition-colors ${data.visibility === o.v ? "border-teal bg-teal/10" : "border-[color:var(--caws-border)] hover:border-teal"}`}
                        data-testid={`settings-vis-${o.v}`}>
                  <div className="font-medium text-navy text-sm">{o.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{o.d}</div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Messaging */}
        <Section title="Messaging" testId="settings-messaging">
          <div>
            <Label className="text-sm">Who can message you</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                {v: "everyone", label: "Everyone"},
                {v: "no_one", label: "No one"},
              ].map(o => (
                <button key={o.v} onClick={() => setMessagingAllowed(o.v)}
                        className={`p-3 rounded-md border text-left transition-colors ${data.messaging_allowed === o.v ? "border-teal bg-teal/10" : "border-[color:var(--caws-border)] hover:border-teal"}`}
                        data-testid={`settings-msg-${o.v}`}>
                  <div className="font-medium text-navy text-sm">{o.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div>
              <Label className="text-sm">Notify me of new messages</Label>
              <div className="text-xs text-gray-500 mt-0.5">Show alerts and unread counts</div>
            </div>
            <button onClick={toggleNotifNewMsg}
                    className={`w-11 h-6 rounded-full transition-colors ${data.notify_new_messages ? "bg-teal" : "bg-gray-300"}`}
                    data-testid="settings-notify-msg-toggle">
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${data.notify_new_messages ? "translate-x-5" : "translate-x-0.5"}`}/>
            </button>
          </div>
          <div className="mt-6">
            <Label className="text-sm">Blocked users</Label>
            {data.blocked_users.length === 0 ? (
              <div className="text-xs text-gray-500 mt-2" data-testid="settings-no-blocked">You haven't blocked anyone.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {data.blocked_users.map(b => (
                  <div key={b.id} className="flex items-center justify-between border border-[color:var(--caws-border)] rounded-md p-3" data-testid={`blocked-${b.id}`}>
                    <div className="text-sm text-navy">{b.org_name || b.name}</div>
                    <Button onClick={() => unblock(b.id)} variant="outline" size="sm" data-testid={`unblock-${b.id}`}>Unblock</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" testId="settings-notifications">
          <div className="text-sm text-gray-600">
            You can control most notifications above (messaging). Application updates and hour verifications are always delivered as they're critical to your service record.
          </div>
        </Section>

        {/* Account security */}
        <Section title="Account security" testId="settings-security">
          <form onSubmit={changePw} className="space-y-3 mb-6">
            <Label className="text-sm">Change password</Label>
            <Input type="password" placeholder="Current password" required value={pw.current_password}
                   onChange={e => setPw({...pw, current_password: e.target.value})} data-testid="pw-current"/>
            <Input type="password" placeholder="New password (6+ chars)" required minLength={6} value={pw.new_password}
                   onChange={e => setPw({...pw, new_password: e.target.value})} data-testid="pw-new"/>
            <Button type="submit" className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="pw-submit">Update password</Button>
          </form>
          <div className="mb-6">
            <Label className="text-sm">Recent activity</Label>
            {data.login_activity.length === 0 ? (
              <div className="text-xs text-gray-500 mt-1">No recent activity logged.</div>
            ) : (
              <div className="mt-1 text-xs text-gray-600 space-y-1">
                {data.login_activity.slice(0, 5).map((l, i) => (
                  <div key={i}>{new Date(l.at).toLocaleString()} · {l.device || "unknown device"}</div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[color:var(--caws-border)] pt-4">
            <Label className="text-sm text-red-600">Danger zone</Label>
            <p className="text-xs text-gray-500 mt-1 mb-3">Deleting your account is permanent and can't be undone.</p>
            <Button onClick={deleteAccount} variant="outline" className="border-red-600 text-red-600 hover:bg-red-600 hover:text-white rounded-md" data-testid="delete-account-btn">
              Delete account
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, testId, children }) {
  return (
    <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-6 mb-6" data-testid={testId}>
      <h2 className="font-serif text-xl text-navy mb-4">{title}</h2>
      {children}
    </div>
  );
}
