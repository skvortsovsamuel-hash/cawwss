import { useEffect, useState } from "react";
import { Link, Outlet, NavLink } from "react-router-dom";
import { api, getToken } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "sonner";
import ReviewDialog from "../components/ReviewDialog";

const Tab = ({ to, children, testid }) => (
  <NavLink to={to} end data-testid={testid}
           className={({isActive}) => `px-4 py-2 rounded-md text-sm transition-colors ${isActive ? "bg-navy text-white" : "text-navy hover:bg-warm-muted"}`}>
    {children}
  </NavLink>
);

export default function StudentDashboard() {
  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <StudentHome/>
      </div>
    </div>
  );
}

function StudentHome() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [apps, setApps] = useState([]);
  const [hours, setHours] = useState([]);
  const [certs, setCerts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [a, h, c, r] = await Promise.all([
        api.get("/applications/mine").catch(() => ({ data: [] })),
        api.get("/hours/mine").catch(() => ({ data: [] })),
        api.get("/certificates/mine").catch(() => ({ data: [] })),
        api.get("/reviews/mine").catch(() => ({ data: [] })),
      ]);
      setApps(a.data || []); setHours(h.data || []); setCerts(c.data || []); setReviews(r.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const totalVerified = hours.filter(h => h.status === "verified").reduce((s, h) => s + h.hours, 0);
  const pendingHours = hours.filter(h => h.status === "pending").reduce((s, h) => s + h.hours, 0);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.2em] text-gold uppercase mb-1">Student Dashboard</div>
          <h1 className="font-serif text-3xl text-navy" data-testid="student-welcome">Welcome, {user?.name}</h1>
        </div>
        <Link to="/opportunities"><Button className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="student-discover-btn">Discover opportunities</Button></Link>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-10">
        <div className="ledger-card" data-testid="student-verified-card"><div className="ledger-number">{totalVerified}</div><div className="ledger-label">Verified Hours</div></div>
        <div className="ledger-card" data-testid="student-pending-card"><div className="ledger-number">{pendingHours}</div><div className="ledger-label">Pending Hours</div></div>
        <div className="ledger-card" data-testid="student-certs-card"><div className="ledger-number">{certs.length}</div><div className="ledger-label">Certificates</div></div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setTab("overview")} data-testid="tab-apps" className={`px-4 py-2 rounded-md text-sm ${tab==="overview"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Applications</button>
        <button onClick={() => setTab("hours")} data-testid="tab-hours" className={`px-4 py-2 rounded-md text-sm ${tab==="hours"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Hours</button>
        <button onClick={() => setTab("certs")} data-testid="tab-certs" className={`px-4 py-2 rounded-md text-sm ${tab==="certs"?"bg-navy text-white":"text-navy hover:bg-warm-muted"}`}>Certificates</button>
      </div>

      {loading ? <div className="text-gray-500" data-testid="student-loading">Loading...</div> :
       tab === "overview" ? <ApplicationsList apps={apps}/> :
       tab === "hours" ? <HoursSection apps={apps} hours={hours} reviews={reviews} reload={load}/> :
       <CertsList certs={certs}/>}
    </div>
  );
}

function ApplicationsList({ apps = [] }) {
  if (apps.length === 0) return <div className="text-center py-12 text-gray-500" data-testid="apps-empty">No applications yet. <Link to="/opportunities" className="text-teal">Discover opportunities</Link></div>;
  return (
    <div className="space-y-3">
      {apps.map(a => (
        <div key={a.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5 flex justify-between items-center gap-4" data-testid={`app-item-${a.id}`}>
          <div>
            <Link to={`/opportunities/${a.opportunity_id}`} className="font-serif text-lg text-navy hover:text-teal">{a.opportunity_title}</Link>
            <div className="text-xs text-gray-500 mt-1">Applied {new Date(a.created_at).toLocaleDateString()}</div>
          </div>
          <Badge className={a.status==="accepted"?"bg-teal text-white":a.status==="rejected"?"bg-destructive text-white":"bg-gold text-white"}>{a.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function HoursSection({ apps = [], hours = [], reviews = [], reload }) {
  const accepted = apps.filter(a => a.status === "accepted");
  const reviewedOppIds = new Set((reviews || []).map(r => r.opportunity_id));
  const loggedOppIds = new Set((hours || []).map(h => h.opportunity_id));
  // Only opportunities that are accepted AND don't already have an hour log
  const loggableAccepted = accepted.filter(a => !loggedOppIds.has(a.opportunity_id));
  return (
    <div>
      <div className="mb-6 flex justify-between items-center flex-wrap gap-3">
        <div className="text-sm text-gray-600">
          Log hours for accepted opportunities. <span className="text-gray-400">One submission per opportunity.</span>
        </div>
        <LogHoursDialog accepted={loggableAccepted} onDone={reload}/>
      </div>
      {hours.length === 0 ? (
        <div className="text-center py-12 text-gray-500" data-testid="hours-empty">No hours logged yet.</div>
      ) : (
        <div className="space-y-3">
          {hours.map(h => (
            <div key={h.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5 flex justify-between items-center gap-4 flex-wrap" data-testid={`hour-item-${h.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-serif text-lg text-navy">{h.opportunity_title}</div>
                <div className="text-xs text-gray-500 mt-1">{h.date} · {h.hours} hours · {h.ngo_name}</div>
                <div className="text-sm text-gray-700 mt-2">{h.description}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={h.status==="verified"?"bg-teal text-white":h.status==="rejected"?"bg-destructive text-white":"bg-gold text-white"}>{h.status}</Badge>
                {h.status === "verified" && !reviewedOppIds.has(h.opportunity_id) && (
                  <ReviewDialog opportunityId={h.opportunity_id} opportunityTitle={h.opportunity_title}
                                onDone={reload} triggerTestId={`review-open-${h.id}`}/>
                )}
                {h.status === "verified" && reviewedOppIds.has(h.opportunity_id) && (
                  <span className="text-xs text-gray-500" data-testid={`review-done-${h.id}`}>Reviewed ✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LogHoursDialog({ accepted, onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ opportunity_id: "", hours: "", date: "", description: "" });
  const [busy, setBusy] = useState(false);
  // Cache opp details (esp. hours_estimate) so we can enforce the cap client-side
  const [oppMax, setOppMax] = useState(null);

  const onOppChange = async (opp_id) => {
    setForm(f => ({ ...f, opportunity_id: opp_id, hours: "" }));
    setOppMax(null);
    if (!opp_id) return;
    try {
      const r = await api.get(`/opportunities/${opp_id}`);
      setOppMax(r.data?.hours_estimate ?? null);
    } catch { /* ignore */ }
  };

  const submit = async (e) => {
    e.preventDefault();
    const hoursNum = parseFloat(form.hours);
    if (oppMax !== null && hoursNum > oppMax) {
      toast.error(`Max ${oppMax} hours for this opportunity`);
      return;
    }
    setBusy(true);
    try {
      await api.post("/hours", { ...form, hours: hoursNum });
      toast.success("Hours submitted for verification");
      setOpen(false);
      setForm({ opportunity_id: "", hours: "", date: "", description: "" });
      setOppMax(null);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm({ opportunity_id: "", hours: "", date: "", description: "" }); setOppMax(null); } }}>
      <DialogTrigger asChild>
        <Button className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="log-hours-btn">Log hours</Button>
      </DialogTrigger>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Log volunteer hours</DialogTitle></DialogHeader>
        {accepted.length === 0 ? (
          <div className="py-4" data-testid="log-hours-no-accepted">
            <p className="text-sm text-gray-700 mb-4">
              No opportunities are open for hour logging right now. Either you haven't been accepted to one yet,
              or you've already submitted hours for the ones you've been accepted to (one submission per opportunity).
            </p>
            <Link to="/opportunities">
              <Button className="bg-teal hover:bg-teal-hover text-white rounded-md w-full" data-testid="log-hours-discover-btn">
                Discover opportunities
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Opportunity</Label>
              <select required value={form.opportunity_id} onChange={e => onOppChange(e.target.value)}
                      className="mt-1 w-full border border-input rounded-md px-3 py-2" data-testid="log-hours-opp-select">
                <option value="">Select...</option>
                {accepted.map(a => <option key={a.id} value={a.opportunity_id}>{a.opportunity_title}</option>)}
              </select>
            </div>
            <div>
              <Label>
                Hours{oppMax !== null && <span className="text-xs text-gray-500 ml-2">(max {oppMax} for this opportunity)</span>}
              </Label>
              <Input type="number" step="0.5" min="0.5" max={oppMax ?? undefined} required
                     value={form.hours} onChange={e => setForm({...form, hours: e.target.value})}
                     data-testid="log-hours-hours-input" className="mt-1"/>
            </div>
            <div><Label>Date</Label><Input type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} data-testid="log-hours-date-input" className="mt-1"/></div>
            <div><Label>What did you do?</Label><Textarea required value={form.description} onChange={e => setForm({...form, description: e.target.value})} data-testid="log-hours-desc-input" className="mt-1"/></div>
            <Button type="submit" disabled={busy} className="w-full bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="log-hours-submit-btn">
              {busy ? "Submitting..." : "Submit for verification"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CertsList({ certs = [] }) {
  const token = getToken();
  if (certs.length === 0) return <div className="text-center py-12 text-gray-500" data-testid="certs-empty">No certificates yet. Verified hours earn certificates.</div>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {certs.map(c => (
        <div key={c.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-6" data-testid={`cert-item-${c.id}`}>
          <div className="text-xs tracking-widest text-gold uppercase mb-2">Certificate of Service</div>
          <div className="font-serif text-lg text-navy mb-1">{c.opportunity_title}</div>
          <div className="text-sm text-gray-500 mb-4">{c.ngo_name} · {c.hours}h · {c.date}</div>
          <a href={`${process.env.REACT_APP_BACKEND_URL}/api/certificates/${c.id}/download?auth=${token}`} target="_blank" rel="noopener noreferrer">
            <Button className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid={`cert-download-${c.id}`}>Download PDF</Button>
          </a>
        </div>
      ))}
    </div>
  );
}
