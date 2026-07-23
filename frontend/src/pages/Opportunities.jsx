import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { CAUSES, US_STATES } from "../lib/constants";

export default function Opportunities() {
  const { user } = useAuth();
  const firstName = (user?.name || "").split(" ")[0];
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ cause: "any", state: "any", remote: "any", max_hours: "" });
  const [textQuery, setTextQuery] = useState(searchParams.get("q") || "");
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [radius, setRadius] = useState(25);

  useEffect(() => {
    api.get("/config/nearby").then(r => setRadius(r.data.radius_miles || 25)).catch(() => {});
    // Restore saved location if user granted before
    try {
      const saved = JSON.parse(localStorage.getItem("caws_geo") || "null");
      if (saved && saved.lat && saved.lng) setCoords(saved);
    } catch {}
  }, []);

  const shareLocation = () => {
    if (!navigator.geolocation) { toast.error("Location isn't available on this device"); return; }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        localStorage.setItem("caws_geo", JSON.stringify(c));
        toast.success("Location shared — showing opportunities near you");
        setLocBusy(false);
      },
      (err) => {
        toast.error(err.code === 1 ? "Location permission denied" : "Couldn't get your location");
        setLocBusy(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };
  const clearLocation = () => { setCoords(null); setNearbyOnly(false); localStorage.removeItem("caws_geo"); };

  const load = async () => {
    setLoading(true);
    const params = {};
    if (f.cause && f.cause !== "any") params.cause = f.cause;
    if (f.state && f.state !== "any") params.state = f.state;
    if (f.remote === "remote") params.remote = true;
    if (f.remote === "inperson") params.remote = false;
    if (f.max_hours) params.max_hours = f.max_hours;
    if (coords) { params.near_lat = coords.lat; params.near_lng = coords.lng; }
    if (coords && nearbyOnly) params.nearby_only = true;
    try { const r = await api.get("/opportunities", { params }); setItems(r.data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [f, coords, nearbyOnly]);

  const filteredItems = useMemo(() => {
    const q = (textQuery || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter(o =>
      (o.title || "").toLowerCase().includes(q) ||
      (o.description || "").toLowerCase().includes(q) ||
      (o.ngo_name || "").toLowerCase().includes(q) ||
      (o.cause || "").toLowerCase().includes(q) ||
      (o.location || "").toLowerCase().includes(q)
    );
  }, [items, textQuery]);

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs tracking-[0.2em] text-gold uppercase mb-2">Discover</div>
            {user && firstName ? (
              <h1 className="font-serif text-4xl text-navy" data-testid="welcome-heading">
                Welcome, <span className="text-teal">{firstName}</span>!
              </h1>
            ) : (
              <h1 className="font-serif text-4xl text-navy">Volunteer opportunities</h1>
            )}
            <p className="text-gray-600 mt-2">
              {user && firstName
                ? "Here's what's happening in your community."
                : "Curated from vetted nonprofits."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!coords ? (
              <Button onClick={shareLocation} disabled={locBusy}
                      className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="share-location-btn">
                {locBusy ? "Getting location..." : "Share location for nearby matches"}
              </Button>
            ) : (
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <label className="flex items-center gap-2 text-sm text-navy cursor-pointer" data-testid="nearby-toggle-label">
                  <input type="checkbox" checked={nearbyOnly} onChange={e => setNearbyOnly(e.target.checked)}
                         className="accent-teal" data-testid="nearby-only-checkbox"/>
                  <span>Nearby only (within {radius} mi)</span>
                </label>
                <button onClick={clearLocation} className="text-xs text-gray-500 hover:text-navy underline" data-testid="clear-location-btn">
                  clear location
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Filters */}
        <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-4 mb-8 grid md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest">Cause</label>
            <Select value={f.cause} onValueChange={v => setF({...f, cause: v})}>
              <SelectTrigger data-testid="filter-cause-select" className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any cause</SelectItem>
                {CAUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest">State</label>
            <Select value={f.state} onValueChange={v => setF({...f, state: v})}>
              <SelectTrigger data-testid="filter-state-select" className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="any">Any state</SelectItem>
                {US_STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest">Format</label>
            <Select value={f.remote} onValueChange={v => setF({...f, remote: v})}>
              <SelectTrigger data-testid="filter-remote-select" className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any format</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="inperson">In-person</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest">Est. commitment</label>
            <Input type="number" placeholder="hrs (≤)" value={f.max_hours}
                   onChange={e => setF({...f, max_hours: e.target.value})} data-testid="filter-hours-input" className="mt-1"/>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white border border-[color:var(--caws-border)] rounded-md p-6 animate-pulse" data-testid={`opp-skeleton-${i}`}>
                <div className="h-6 w-2/3 bg-warm-muted rounded mb-3"/>
                <div className="h-4 w-1/2 bg-warm-muted rounded mb-4"/>
                <div className="h-3 w-full bg-warm-muted rounded"/>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-gray-500" data-testid="opp-empty">No opportunities match your filters yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {filteredItems.map(o => (
              <Link key={o.id} to={`/opportunities/${o.id}`} data-testid={`opp-card-${o.id}`}
                    className="block bg-white border border-[color:var(--caws-border)] rounded-md p-6 hover:border-teal transition-colors">
                <div className="flex justify-between items-start mb-2 gap-3">
                  <h3 className="font-serif text-xl text-navy">{o.title}</h3>
                  {o.is_remote && <Badge variant="outline" className="border-teal text-teal">Remote</Badge>}
                  {!o.is_remote && typeof o.distance_miles === "number" && (
                    <Badge variant="outline" className="border-gold text-gold" data-testid={`opp-distance-${o.id}`}>
                      {o.distance_miles < 1 ? "< 1 mi" : `${Math.round(o.distance_miles)} mi`}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-gray-500 mb-3">{o.ngo_name} · {o.location}</div>
                <p className="text-sm text-gray-700 line-clamp-2 mb-4">{o.description}</p>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="text-navy font-medium">~{o.hours_estimate}h</span>
                  <span>{o.cause}</span>
                  <span>{o.slots} slots</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
