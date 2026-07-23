import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "sonner";
import { Navigate, Link } from "react-router-dom";
import { CAUSES, US_STATES } from "../lib/constants";

export default function NGODashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("opps");
  const [ngo, setNgo] = useState(null);
  const [opps, setOpps] = useState([]);
  const [apps, setApps] = useState([]);
  const [hours, setHours] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [n, o, a, h] = await Promise.all([
        api.get("/ngo/me"),
        api.get("/ngo/opportunities"),
        api.get("/applications/ngo"),
        api.get("/hours/ngo"),
      ]);
      setNgo(n.data); setOpps(o.data); setApps(a.data); setHours(h.data);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    if (user?.ngo_status === "approved") load();
    else setLoading(false);
  }, [user?.ngo_status]);

  if (user?.ngo_status && user.ngo_status !== "approved") return <Navigate to="/ngo/pending" replace/>;

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8 flex justify-between items-start flex-wrap gap-4">
          <div>
            <div className="text-xs tracking-[0.2em] text-gold uppercase mb-1">Nonprofit Dashboard</div>
            <h1 className="font-serif text-3xl text-navy" data-testid="ngo-org-name">{ngo?.org_name || "Loading..."}</h1>
            <div className="text-sm text-gray-500 mt-1">{ngo?.location}</div>
          </div>
          <div className="ledger-card !p-4 !py-3" data-testid="ngo-reliability-card">
            <div className="ledger-number !text-3xl">{ngo?.reliability_score ?? "—"}</div>
            <div className="ledger-label">Reliability Score</div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="ledger-card" data-testid="ngo-opps-card"><div className="ledger-number">{opps.filter(o => o.status==="open").length}</div><div className="ledger-label">Active Opportunities</div></div>
          <div className="ledger-card" data-testid="ngo-apps-card"><div className="ledger-number">{apps.filter(a => a.status==="pending").length}</div><div className="ledger-label">Pending Applications</div></div>
          <div className="ledger-card" data-testid="ngo-hours-card"><div className="ledger-number">{hours.filter(h => h.status==="pending").length}</div><div className="ledger-label">Hours To Verify</div></div>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setTab("opps")} data-testid="ngo-tab-opps" className={`px-4 py-2 rounded-md text-sm ${tab==="opps"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Opportunities</button>
          <button onClick={() => setTab("apps")} data-testid="ngo-tab-apps" className={`px-4 py-2 rounded-md text-sm ${tab==="apps"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Applicants</button>
          <button onClick={() => setTab("hours")} data-testid="ngo-tab-hours" className={`px-4 py-2 rounded-md text-sm ${tab==="hours"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Verify Hours</button>
          <button onClick={() => setTab("profile")} data-testid="ngo-tab-profile" className={`px-4 py-2 rounded-md text-sm ${tab==="profile"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Profile</button>
        </div>

        {loading ? <div className="text-gray-500">Loading...</div> :
         tab === "opps" ? <OppsPanel opps={opps} reload={load}/> :
         tab === "apps" ? <AppsPanel apps={apps} reload={load}/> :
         tab === "hours" ? <HoursPanel hours={hours} reload={load}/> :
         <ProfilePanel ngo={ngo} reload={load}/>}
      </div>
    </div>
  );
}

function OppsPanel({ opps, reload }) {
  return (
    <div>
      <div className="mb-4 flex justify-end"><CreateOpp onDone={reload}/></div>
      {opps.length === 0 ? <div className="text-center py-12 text-gray-500" data-testid="ngo-opps-empty">No opportunities posted yet.</div> :
       <div className="space-y-3">
         {opps.map(o => (
           <div key={o.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5 flex justify-between items-center gap-4" data-testid={`ngo-opp-${o.id}`}>
             <div>
               <div className="font-serif text-lg text-navy">{o.title}</div>
               <div className="text-sm text-gray-500 mt-1">{o.cause} · {o.hours_estimate}h · {o.slots} slots</div>
             </div>
             <div className="flex items-center gap-3">
               <Badge className={o.status==="open"?"bg-teal text-white":"bg-gray-400 text-white"}>{o.status}</Badge>
               {o.status === "open" && <Button variant="outline" size="sm" data-testid={`ngo-opp-close-${o.id}`}
                                              onClick={async () => { await api.delete(`/opportunities/${o.id}`); toast.success("Closed"); reload(); }}>Close</Button>}
             </div>
           </div>
         ))}
       </div>}
    </div>
  );
}

function CreateOpp({ onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", cause: "", is_remote: false,
    address: "", room: "", city: "", state: "", zip_code: "",
    hours_estimate: 5, start_date: "", end_date: "", slots: 10
  });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.is_remote && !form.state) { toast.error("Select a state or mark as remote"); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        hours_estimate: parseInt(form.hours_estimate),
        slots: parseInt(form.slots),
        // Clear address/state fields if remote
        address: form.is_remote ? "" : form.address,
        room: form.is_remote ? "" : form.room,
        city: form.is_remote ? "" : form.city,
        state: form.is_remote ? "" : form.state,
        zip_code: form.is_remote ? "" : form.zip_code,
      };
      await api.post("/opportunities", payload);
      toast.success("Opportunity posted");
      setOpen(false); onDone?.();
      setForm({
        title: "", description: "", cause: "", is_remote: false,
        address: "", room: "", city: "", state: "", zip_code: "",
        hours_estimate: 5, start_date: "", end_date: "", slots: 10
      });
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="ngo-create-opp-btn">Post opportunity</Button></DialogTrigger>
      <DialogContent className="bg-white max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New opportunity</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Title</Label><Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} data-testid="opp-title-input" className="mt-1"/></div>
          <div><Label>Description</Label><Textarea required value={form.description} onChange={e => setForm({...form, description: e.target.value})} data-testid="opp-desc-input" className="mt-1"/></div>
          <div>
            <Label>Cause</Label>
            <select required value={form.cause} onChange={e => setForm({...form, cause: e.target.value})}
                    className="mt-1 w-full border border-input rounded-md px-3 py-2 bg-white" data-testid="opp-cause-select">
              <option value="">Select a cause...</option>
              {CAUSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 py-2 border-y border-[color:var(--caws-border)]">
            <Checkbox id="remote" checked={form.is_remote} onCheckedChange={v => setForm({...form, is_remote: !!v})} data-testid="opp-remote-checkbox"/>
            <Label htmlFor="remote">Remote / virtual (no physical location needed)</Label>
          </div>
          {!form.is_remote && (
            <div className="space-y-3 border-l-2 border-teal/30 pl-3">
              <div className="text-xs uppercase tracking-widest text-gray-500">Location</div>
              <div><Label>Street address</Label><Input placeholder="123 Main St" value={form.address} onChange={e => setForm({...form, address: e.target.value})} data-testid="opp-address-input" className="mt-1"/></div>
              <div><Label>Room / suite <span className="text-gray-400">(optional)</span></Label><Input placeholder="Suite 4B" value={form.room} onChange={e => setForm({...form, room: e.target.value})} data-testid="opp-room-input" className="mt-1"/></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Label>City</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} data-testid="opp-city-input" className="mt-1"/></div>
                <div>
                  <Label>State</Label>
                  <select value={form.state} onChange={e => setForm({...form, state: e.target.value})}
                          className="mt-1 w-full border border-input rounded-md px-3 py-2 bg-white" data-testid="opp-state-select">
                    <option value="">—</option>
                    {US_STATES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </div>
              </div>
              <div><Label>ZIP code</Label><Input value={form.zip_code} onChange={e => setForm({...form, zip_code: e.target.value})} data-testid="opp-zip-input" className="mt-1"/></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Est. commitment (hrs)</Label><Input type="number" min="1" required value={form.hours_estimate} onChange={e => setForm({...form, hours_estimate: e.target.value})} data-testid="opp-hours-input" className="mt-1"/></div>
            <div><Label>Slots</Label><Input type="number" min="1" required value={form.slots} onChange={e => setForm({...form, slots: e.target.value})} data-testid="opp-slots-input" className="mt-1"/></div>
            <div><Label>Start date</Label><Input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="mt-1"/></div>
            <div><Label>End date</Label><Input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} className="mt-1"/></div>
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="opp-submit-btn">
            {busy ? "Posting..." : "Post opportunity"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AppsPanel({ apps, reload }) {
  const update = async (id, status) => {
    try { await api.patch(`/applications/${id}/status`, null, { params: { status_val: status } }); toast.success("Updated"); reload(); }
    catch { toast.error("Failed"); }
  };
  if (apps.length === 0) return <div className="text-center py-12 text-gray-500" data-testid="ngo-apps-empty">No applications yet.</div>;
  return (
    <div className="space-y-3">
      {apps.map(a => (
        <div key={a.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5" data-testid={`ngo-app-${a.id}`}>
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <div className="font-serif text-lg text-navy">{a.opportunity_title}</div>
              <div className="text-sm text-gray-500 mt-1">
                <Link to={`/students/${a.student_id}`} className="text-teal hover:underline" data-testid={`app-student-link-${a.id}`}>
                  {a.student_name}
                </Link> · {a.student_email}
              </div>
              {a.message && <div className="text-sm text-gray-700 mt-2 italic">"{a.message}"</div>}
            </div>
            <div className="flex gap-2 items-center">
              <Badge className={a.status==="accepted"?"bg-teal text-white":a.status==="rejected"?"bg-destructive text-white":"bg-gold text-white"}>{a.status}</Badge>
              {a.status === "pending" && (
                <>
                  <Button size="sm" className="bg-teal hover:bg-teal-hover text-white rounded-md" onClick={() => update(a.id, "accepted")} data-testid={`app-accept-${a.id}`}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => update(a.id, "rejected")} data-testid={`app-reject-${a.id}`}>Reject</Button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HoursPanel({ hours, reload }) {
  const act = async (id, action) => {
    try { await api.patch(`/hours/${id}/${action}`); toast.success(action === "verify" ? "Verified & certificate issued" : "Rejected"); reload(); }
    catch { toast.error("Failed"); }
  };
  if (hours.length === 0) return <div className="text-center py-12 text-gray-500" data-testid="ngo-hours-empty">No hour logs to review.</div>;
  return (
    <div className="space-y-3">
      {hours.map(h => (
        <div key={h.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5" data-testid={`ngo-hour-${h.id}`}>
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div className="flex-1">
              <div className="font-serif text-lg text-navy">{h.student_name} — {h.hours}h</div>
              <div className="text-sm text-gray-500 mt-1">{h.opportunity_title} · {h.date}</div>
              <div className="text-sm text-gray-700 mt-2">{h.description}</div>
            </div>
            <div className="flex gap-2 items-center">
              <Badge className={h.status==="verified"?"bg-teal text-white":h.status==="rejected"?"bg-destructive text-white":"bg-gold text-white"}>{h.status}</Badge>
              {h.status === "pending" && (
                <>
                  <Button size="sm" className="bg-teal hover:bg-teal-hover text-white rounded-md" onClick={() => act(h.id, "verify")} data-testid={`hour-verify-${h.id}`}>Verify</Button>
                  <Button size="sm" variant="outline" onClick={() => act(h.id, "reject")} data-testid={`hour-reject-${h.id}`}>Reject</Button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfilePanel({ ngo, reload }) {
  const [form, setForm] = useState({
    org_name: ngo?.org_name || "",
    mission: ngo?.mission || "",
    category_tags: (ngo?.category_tags || []).join(", "),
    location: ngo?.location || "",
    contact_name: ngo?.contact_name || "",
    contact_phone: ngo?.contact_phone || "",
    website: ngo?.website || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm({ ...form, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, category_tags: form.category_tags.split(",").map(t => t.trim()).filter(Boolean) };
      await api.patch("/ngo/me", payload);
      toast.success("Profile updated");
      reload?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8">
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h3 className="font-serif text-xl text-navy">Organization profile</h3>
          <p className="text-sm text-gray-500 mt-1">This information is visible to students on your public profile.</p>
        </div>
        {ngo?.id && (
          <a href={`/ngos/${ngo.id}`} target="_blank" rel="noopener noreferrer"
             className="text-sm text-teal hover:underline" data-testid="ngo-view-public-profile">
            View public profile →
          </a>
        )}
      </div>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2"><Label>Organization name</Label><Input required value={form.org_name} onChange={e => set("org_name", e.target.value)} data-testid="ngo-profile-org-input" className="mt-1"/></div>
        <div className="md:col-span-2"><Label>Mission</Label><Textarea required value={form.mission} onChange={e => set("mission", e.target.value)} data-testid="ngo-profile-mission-input" className="mt-1"/></div>
        <div><Label>Category tags (comma-separated)</Label><Input value={form.category_tags} onChange={e => set("category_tags", e.target.value)} data-testid="ngo-profile-tags-input" className="mt-1"/></div>
        <div><Label>Location</Label><Input required value={form.location} onChange={e => set("location", e.target.value)} data-testid="ngo-profile-loc-input" className="mt-1"/></div>
        <div><Label>Contact name</Label><Input required value={form.contact_name} onChange={e => set("contact_name", e.target.value)} data-testid="ngo-profile-contact-input" className="mt-1"/></div>
        <div><Label>Contact phone</Label><Input value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)} data-testid="ngo-profile-phone-input" className="mt-1"/></div>
        <div className="md:col-span-2"><Label>Website</Label><Input value={form.website} onChange={e => set("website", e.target.value)} data-testid="ngo-profile-website-input" className="mt-1"/></div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="ngo-profile-save-btn">
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
