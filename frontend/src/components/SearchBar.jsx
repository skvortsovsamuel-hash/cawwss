import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, User, Briefcase, X, Loader2 } from "lucide-react";
import { api } from "../lib/api";

/**
 * Global search bar with a debounced live-results dropdown.
 * Searches across nonprofits, volunteer profiles, and opportunities.
 */
export default function SearchBar({ compact = false }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({ nonprofits: [], profiles: [], opportunities: [] });
  const [counts, setCounts] = useState({ nonprofits: 0, profiles: 0, opportunities: 0 });
  const [activeFilter, setActiveFilter] = useState("all"); // all | nonprofits | profiles | opportunities
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Debounced fetch — always fetches unfiltered counts (limit=5 per type) then applies client filter
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults({ nonprofits: [], profiles: [], opportunities: [] });
      setCounts({ nonprofits: 0, profiles: 0, opportunities: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search`, { params: { q: query, limit: 5 } });
        const n = data.nonprofits || [];
        const p = data.profiles || [];
        const o = data.opportunities || [];
        setResults({ nonprofits: n, profiles: p, opportunities: o });
        setCounts({ nonprofits: n.length, profiles: p.length, opportunities: o.length });
      } catch {
        setResults({ nonprofits: [], profiles: [], opportunities: [] });
        setCounts({ nonprofits: 0, profiles: 0, opportunities: 0 });
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  // Reset active filter + highlight index when query changes
  useEffect(() => { setActiveIdx(-1); }, [q, activeFilter]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Keyboard shortcut: "/" or Cmd/Ctrl+K to focus
  useEffect(() => {
    const onKey = (e) => {
      const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if ((e.key === "/" && !isTyping) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flat = useMemo(() => {
    const list = [];
    if (activeFilter === "all" || activeFilter === "nonprofits") {
      results.nonprofits.forEach((n) => list.push({ ...n, _kind: "nonprofit" }));
    }
    if (activeFilter === "all" || activeFilter === "profiles") {
      results.profiles.forEach((p) => list.push({ ...p, _kind: "profile" }));
    }
    if (activeFilter === "all" || activeFilter === "opportunities") {
      results.opportunities.forEach((o) => list.push({ ...o, _kind: "opportunity" }));
    }
    return list;
  }, [results, activeFilter]);

  const totalCount = flat.length;
  const showNonprofits = (activeFilter === "all" || activeFilter === "nonprofits") && results.nonprofits.length > 0;
  const showProfiles = (activeFilter === "all" || activeFilter === "profiles") && results.profiles.length > 0;
  const showOpps = (activeFilter === "all" || activeFilter === "opportunities") && results.opportunities.length > 0;

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    setQ("");
    navigate(item.url);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, totalCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && flat[activeIdx]) {
        go(flat[activeIdx]);
      } else if (q.trim()) {
        // Fallback: send to opportunities page with the query
        setOpen(false);
        navigate(`/opportunities?q=${encodeURIComponent(q.trim())}`);
        setQ("");
      }
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${compact ? "w-full" : "w-full max-w-md"}`} data-testid="global-search">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/50 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActiveIdx(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search nonprofits, profiles, opportunities…"
          aria-label="Global search"
          className="w-full h-10 pl-9 pr-16 rounded-full border border-[color:var(--caws-border)] bg-white text-sm text-navy placeholder:text-navy/40 focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-teal transition"
          data-testid="global-search-input"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {q && (
            <button
              onClick={() => { setQ(""); inputRef.current?.focus(); }}
              className="p-1 rounded-full text-navy/50 hover:text-navy hover:bg-warm-muted"
              aria-label="Clear search"
              data-testid="global-search-clear"
            >
              <X size={14} />
            </button>
          )}
          {!q && (
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-navy/60 border border-[color:var(--caws-border)] rounded bg-warm-muted/50">
              /
            </kbd>
          )}
        </div>
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 mt-2 rounded-xl border border-[color:var(--caws-border)] bg-white shadow-xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto" data-testid="global-search-dropdown">
          {/* LinkedIn-style filter tabs */}
          <div className="flex gap-1 px-3 pt-3 pb-2 border-b border-[color:var(--caws-border)] overflow-x-auto scrollbar-hide" data-testid="search-filter-tabs">
            <FilterTab
              label="All"
              count={counts.nonprofits + counts.profiles + counts.opportunities}
              active={activeFilter === "all"}
              onClick={() => setActiveFilter("all")}
              testId="search-filter-all"
            />
            <FilterTab
              icon={<Building2 size={12} />}
              label="Nonprofits"
              count={counts.nonprofits}
              active={activeFilter === "nonprofits"}
              onClick={() => setActiveFilter("nonprofits")}
              testId="search-filter-nonprofits"
            />
            <FilterTab
              icon={<User size={12} />}
              label="Profiles"
              count={counts.profiles}
              active={activeFilter === "profiles"}
              onClick={() => setActiveFilter("profiles")}
              testId="search-filter-profiles"
            />
            <FilterTab
              icon={<Briefcase size={12} />}
              label="Opportunities"
              count={counts.opportunities}
              active={activeFilter === "opportunities"}
              onClick={() => setActiveFilter("opportunities")}
              testId="search-filter-opportunities"
            />
          </div>

          {loading && flat.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-navy/60">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          )}
          {!loading && flat.length === 0 && (
            <div className="px-4 py-6 text-sm text-navy/60" data-testid="global-search-empty">
              No {activeFilter === "all" ? "matches" : activeFilter} for <span className="font-medium text-navy">&ldquo;{q}&rdquo;</span>
            </div>
          )}

          {showNonprofits && (
            <ResultGroup label="Nonprofits" icon={<Building2 size={12} />}>
              {results.nonprofits.map((n, i) => {
                const idx = i;
                return (
                  <ResultRow
                    key={`n-${n.id}`}
                    active={activeIdx === idx}
                    onClick={() => go(n)}
                    icon={<Building2 size={16} className="text-teal" />}
                    title={n.name}
                    subtitle={n.subtitle}
                    detail={n.description}
                    testId={`search-result-nonprofit-${n.id}`}
                  />
                );
              })}
            </ResultGroup>
          )}

          {showProfiles && (
            <ResultGroup label="Volunteers" icon={<User size={12} />}>
              {results.profiles.map((p, i) => {
                const nonprofitOffset = (activeFilter === "all") ? results.nonprofits.length : 0;
                const idx = nonprofitOffset + i;
                return (
                  <ResultRow
                    key={`p-${p.id}`}
                    active={activeIdx === idx}
                    onClick={() => go(p)}
                    icon={<User size={16} className="text-teal" />}
                    title={p.name}
                    subtitle={p.subtitle}
                    detail={p.description}
                    testId={`search-result-profile-${p.id}`}
                  />
                );
              })}
            </ResultGroup>
          )}

          {showOpps && (
            <ResultGroup label="Opportunities" icon={<Briefcase size={12} />}>
              {results.opportunities.map((o, i) => {
                const nonprofitOffset = (activeFilter === "all") ? results.nonprofits.length : 0;
                const profileOffset = (activeFilter === "all") ? results.profiles.length : 0;
                const idx = nonprofitOffset + profileOffset + i;
                return (
                  <ResultRow
                    key={`o-${o.id}`}
                    active={activeIdx === idx}
                    onClick={() => go(o)}
                    icon={<Briefcase size={16} className="text-teal" />}
                    title={o.name}
                    subtitle={o.subtitle}
                    detail={o.description}
                    testId={`search-result-opportunity-${o.id}`}
                  />
                );
              })}
            </ResultGroup>
          )}

          {q.trim() && (
            <button
              onClick={() => { setOpen(false); navigate(`/opportunities?q=${encodeURIComponent(q.trim())}`); setQ(""); }}
              className="w-full text-left px-4 py-2.5 text-xs font-medium text-teal hover:bg-warm-muted border-t border-[color:var(--caws-border)]"
              data-testid="global-search-see-all"
            >
              See all results for &ldquo;{q}&rdquo; →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterTab({ label, count, active, onClick, icon, testId }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-teal text-white"
          : "text-navy/70 hover:bg-warm-muted"
      }`}
      data-testid={testId}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-white/25" : "bg-warm-muted"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function ResultGroup({ label, icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-semibold tracking-widest uppercase text-navy/50">
        {icon} {label}
      </div>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function ResultRow({ active, onClick, icon, title, subtitle, detail, testId }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition ${active ? "bg-warm-muted" : "hover:bg-warm-muted/60"}`}
      data-testid={testId}
    >
      <div className="mt-0.5 w-8 h-8 rounded-md bg-teal/10 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-navy truncate">{title}</div>
        {subtitle && <div className="text-xs text-navy/60 truncate">{subtitle}</div>}
        {detail && <div className="text-xs text-navy/50 truncate mt-0.5">{detail}</div>}
      </div>
    </button>
  );
}
