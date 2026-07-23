import { useEffect, useState } from "react";
import { api } from "../lib/api";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [tab, setTab] = useState("ngos");
  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="text-xs tracking-[0.2em] text-gold uppercase mb-1">Admin</div>
          <h1 className="font-serif text-3xl text-navy">Platform control center</h1>
        </div>
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setTab("ngos")} data-testid="admin-tab-ngos" className={`px-4 py-2 rounded-md text-sm ${tab==="ngos"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>NGO Approvals</button>
          <button onClick={() => setTab("stats")} data-testid="admin-tab-stats" className={`px-4 py-2 rounded-md text-sm ${tab==="stats"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Landing Stats</button>
          <button onClick={() => setTab("nearby")} data-testid="admin-tab-nearby" className={`px-4 py-2 rounded-md text-sm ${tab==="nearby"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Nearby Radius</button>
          <button onClick={() => setTab("users")} data-testid="admin-tab-users" className={`px-4 py-2 rounded-md text-sm ${tab==="users"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Users</button>
          <button onClick={() => setTab("branding")} data-testid="admin-tab-branding" className={`px-4 py-2 rounded-md text-sm ${tab==="branding"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Branding</button>
        </div>
        {tab === "ngos" ? <NGOPanel/> : tab === "stats" ? <StatsPanel/> : tab === "nearby" ? <NearbyPanel/> : tab === "users" ? <UsersPanel/> : <BrandingPanel/>}
      </div>
    </div>
  );
}

function NGOPanel() {
  const [ngos, setNgos] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); const r = await api.get("/admin/ngos"); setNgos(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);
  const act = async (id, action) => {
    try { await api.patch(`/admin/ngos/${id}/${action}`); toast.success("Updated"); load(); }
    catch { toast.error("Failed"); }
  };
  if (loading) return <div className="text-gray-500">Loading NGOs...</div>;
  return (
    <div className="space-y-3">
      {ngos.length === 0 && <div className="text-center py-12 text-gray-500" data-testid="admin-ngos-empty">No NGOs yet.</div>}
      {ngos.map(n => (
        <div key={n.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5" data-testid={`admin-ngo-${n.id}`}>
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div className="flex-1">
              <div className="font-serif text-lg text-navy">{n.org_name}</div>
              <div className="text-sm text-gray-500 mt-1">{n.location} · EIN: {n.ein}</div>
              <div className="text-sm text-gray-700 mt-2">{n.mission}</div>
              <div className="text-xs text-gray-500 mt-2">Contact: {n.contact_name} · {n.contact_phone || "no phone"} · {n.website || "no site"}</div>
              {n.legitimacy_doc_id && <div className="text-xs text-teal mt-1">Legitimacy doc uploaded ✓</div>}
            </div>
            <div className="flex gap-2 items-center">
              <Badge className={n.status==="approved"?"bg-teal text-white":n.status==="rejected"?"bg-destructive text-white":"bg-gold text-white"}>{n.status}</Badge>
              {n.status === "pending" && (
                <>
                  <Button size="sm" className="bg-teal hover:bg-teal-hover text-white rounded-md" onClick={() => act(n.id, "approve")} data-testid={`admin-approve-${n.id}`}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => act(n.id, "reject")} data-testid={`admin-reject-${n.id}`}>Reject</Button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsPanel() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/stats-config").then(r => setCfg(r.data)); }, []);
  if (!cfg) return <div className="text-gray-500">Loading...</div>;
  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...cfg };
      delete payload.id;
      payload.students_custom = parseInt(payload.students_custom) || 0;
      payload.nonprofits_custom = parseInt(payload.nonprofits_custom) || 0;
      payload.hours_custom = parseInt(payload.hours_custom) || 0;
      await api.put("/admin/stats-config", payload);
      toast.success("Landing stats updated");
    } catch { toast.error("Failed"); }
    finally { setBusy(false); }
  };
  const Row = ({ label, keyMode, keyVal, testid }) => (
    <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-5 flex items-center justify-between gap-4 flex-wrap" data-testid={testid}>
      <div>
        <div className="font-serif text-lg text-navy">{label}</div>
        <div className="text-xs text-gray-500 mt-1">Toggle between live database count and a manual override.</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Live</span>
          <Switch checked={cfg[keyMode]==="custom"} onCheckedChange={v => setCfg({...cfg, [keyMode]: v ? "custom" : "live"})} data-testid={`${testid}-switch`}/>
          <span className="text-xs text-gray-500">Custom</span>
        </div>
        <Input type="number" className="w-32" disabled={cfg[keyMode]!=="custom"} value={cfg[keyVal]} onChange={e => setCfg({...cfg, [keyVal]: e.target.value})} data-testid={`${testid}-input`}/>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <Row label="Students Enrolled" keyMode="students_mode" keyVal="students_custom" testid="admin-stat-students"/>
      <Row label="Vetted Nonprofits" keyMode="nonprofits_mode" keyVal="nonprofits_custom" testid="admin-stat-nonprofits"/>
      <Row label="Verified Hours" keyMode="hours_mode" keyVal="hours_custom" testid="admin-stat-hours"/>
      <Button onClick={save} disabled={busy} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="admin-stats-save-btn">
        {busy ? "Saving..." : "Save landing stats"}
      </Button>
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/admin/users").then(r => setUsers(r.data)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="text-gray-500">Loading...</div>;
  return (
    <div className="bg-white border border-[color:var(--caws-border)] rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-warm-muted"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Role</th><th className="text-left p-3">Joined</th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t border-[color:var(--caws-border)]" data-testid={`admin-user-${u.id}`}>
              <td className="p-3">{u.name}</td><td className="p-3">{u.email}</td>
              <td className="p-3"><Badge variant="outline">{u.role}</Badge></td>
              <td className="p-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrandingPanel() {
  const [busy, setBusy] = useState(false);
  const gen = async () => {
    setBusy(true);
    try { await api.post("/branding/generate-logo"); toast.success("Logo generated — refresh to see it"); }
    catch (e) { toast.error(e.response?.data?.detail || "Generation failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8">
      <h3 className="font-serif text-xl text-navy mb-2">CAWS Crest</h3>
      <p className="text-sm text-gray-600 mb-6">Generate an AI crest that represents unity and community action. Swappable anytime.</p>
      <Button onClick={gen} disabled={busy} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="admin-generate-logo-btn">
        {busy ? "Generating (may take 30s)..." : "Generate new crest"}
      </Button>
    </div>
  );
}

function NearbyPanel() {
  const [radius, setRadius] = useState(25);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/admin/nearby-config").then(r => {
      setRadius(r.data.radius_miles || 25);
      setLoaded(true);
    });
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/nearby-config", { radius_miles: parseInt(radius) || 25 });
      toast.success("Nearby radius updated");
    } catch { toast.error("Failed"); }
    finally { setBusy(false); }
  };
  if (!loaded) return <div className="text-gray-500">Loading...</div>;
  return (
    <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8 max-w-xl" data-testid="admin-nearby-panel">
      <h3 className="font-serif text-xl text-navy mb-2">"Near you" radius</h3>
      <p className="text-sm text-gray-600 mb-6">
        When students share their location on the discover page, opportunities within this distance are considered nearby.
        Applies to all users platform-wide.
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label>Radius (miles)</Label>
          <Input type="number" min="1" max="500" value={radius}
                 onChange={e => setRadius(e.target.value)} className="mt-1" data-testid="admin-nearby-radius-input"/>
        </div>
        <Button onClick={save} disabled={busy} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="admin-nearby-save-btn">
          {busy ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-xs">
        {[10, 25, 50].map(r => (
          <button key={r} type="button" onClick={() => setRadius(r)}
                  className={`px-3 py-2 rounded border transition-colors ${
                    parseInt(radius) === r
                      ? "border-teal bg-teal text-white"
                      : "border-[color:var(--caws-border)] text-navy hover:border-teal"
                  }`}
                  data-testid={`admin-nearby-preset-${r}`}>
            {r} miles
          </button>
        ))}
      </div>
    </div>
  );
}
