import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Crest from "./Crest";
import SearchBar from "./SearchBar";
import { Button } from "./ui/button";
import { Mail, MessageSquare, Settings as SettingsIcon, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}

function AlertsButton() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) { setCount(0); setMsgCount(0); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const [n, m] = await Promise.all([
          api.get("/notifications").catch(() => ({data:[]})),
          api.get("/messages/unread-count").catch(() => ({data:{unread:0}})),
        ]);
        if (!cancelled) {
          setCount((n.data || []).filter(x => !x.read).length);
          setMsgCount(m.data?.unread || 0);
        }
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;
  return (
    <>
      <button
        onClick={() => navigate("/messages")}
        className="relative p-2 rounded-md text-navy hover:bg-warm-muted transition-colors"
        aria-label={`Messages${msgCount > 0 ? ` (${msgCount} unread)` : ""}`}
        data-testid="nav-messages-btn"
      >
        <MessageSquare size={20}/>
        {msgCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-medium flex items-center justify-center leading-none border-2 border-white" data-testid="msg-badge">
            {msgCount > 99 ? "99+" : msgCount}
          </span>
        )}
      </button>
      <button
        onClick={() => navigate("/notifications")}
        className="relative p-2 rounded-md text-navy hover:bg-warm-muted transition-colors"
        aria-label={`Alerts${count > 0 ? ` (${count} unread)` : ""}`}
        data-testid="nav-alerts-btn"
      >
        <Mail size={20}/>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-medium flex items-center justify-center leading-none border-2 border-white" data-testid="alerts-badge">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <button
        onClick={() => navigate("/settings")}
        className="p-2 rounded-md text-navy hover:bg-warm-muted transition-colors"
        aria-label="Settings"
        data-testid="nav-settings-btn"
      >
        <SettingsIcon size={20}/>
      </button>
    </>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dashHref = user?.role === "admin" ? "/admin"
                  : user?.role === "ngo" ? "/ngo"
                  : user?.role === "student" ? "/student" : "/";

  return (
    <nav className="bg-white border-b border-[color:var(--caws-border)] sticky top-0 z-40" data-testid="main-navbar">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 flex-shrink-0" data-testid="nav-home-link">
          <Crest size={40} />
          <div className="leading-tight">
            <div className="font-serif text-xl text-navy tracking-tight">CAWS</div>
            <div className="text-[10px] tracking-widest text-gray-500 uppercase">Community · Action · Students</div>
          </div>
        </Link>

        <div className="hidden md:block flex-1 max-w-md mx-4">
          <SearchBar />
        </div>

        <div className="flex items-center gap-2">
          {!user && (
            <>
              <Button onClick={() => navigate("/signup")} data-testid="nav-signup-btn"
                      className="bg-teal hover:bg-teal-hover text-white rounded-md">Sign up</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md text-navy hover:bg-warm-muted transition-colors"
                          aria-label="Menu" data-testid="nav-menu-trigger">
                    <HamburgerIcon/>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white w-48">
                  <DropdownMenuLabel className="font-serif text-navy">Explore</DropdownMenuLabel>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={() => navigate("/opportunities")} data-testid="nav-browse-link" className="cursor-pointer">
                    Browse opportunities
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/login")} data-testid="nav-login-link" className="cursor-pointer">
                    Log in
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {user && (
            <>
              <AlertsButton/>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md text-navy hover:bg-warm-muted transition-colors"
                          aria-label="Menu" data-testid="nav-menu-trigger">
                    <HamburgerIcon/>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white w-56">
                  <DropdownMenuLabel className="font-serif text-navy truncate">
                    {user.name || user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={() => navigate(dashHref)} data-testid="nav-dashboard-link" className="cursor-pointer">
                    Dashboard
                  </DropdownMenuItem>
                  {user.role === "student" && (
                    <>
                      <DropdownMenuItem onClick={() => navigate("/opportunities")} data-testid="nav-discover-link" className="cursor-pointer">
                        Discover
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/students/${user.id}`)} data-testid="nav-profile-link" className="cursor-pointer">
                        My profile
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/notifications")} data-testid="nav-notif-link" className="cursor-pointer">
                    Alerts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={async () => { await logout(); navigate("/"); }}
                                    data-testid="nav-logout-btn" className="cursor-pointer text-navy">
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
      {/* Mobile search row */}
      <div className="md:hidden px-4 pb-3 -mt-1">
        <SearchBar compact />
      </div>
    </nav>
  );
}
