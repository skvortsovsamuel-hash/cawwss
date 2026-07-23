import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Crest from "../components/Crest";
import { Button } from "../components/ui/button";

const Stat = ({ n, label, testid }) => (
  <div className="ledger-card" data-testid={testid}>
    <div className="ledger-number">{n?.toLocaleString?.() ?? "—"}</div>
    <div className="ledger-label">{label}</div>
  </div>
);

const Step = ({ num, title, body }) => (
  <div className="p-8 bg-white border border-[color:var(--caws-border)] rounded-md">
    <div className="font-serif text-4xl text-gold mb-3">{num}</div>
    <h3 className="font-serif text-xl text-navy mb-2">{title}</h3>
    <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
  </div>
);

export default function Landing() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState({ students: 0, nonprofits: 0, hours: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  useEffect(() => {
    api.get("/stats/public").then(r => setStats(r.data)).finally(() => setStatsLoading(false));
  }, []);

  // If a user is already logged in, route them straight to the opportunities feed
  if (!loading && user) return <Navigate to="/opportunities" replace/>;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="crest-container border-b border-[color:var(--caws-border)]">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32 text-center animate-fade-in">
          <div className="flex justify-center mb-8"><Crest size={128} /></div>
          <p className="gold-italic text-lg md:text-xl mb-6" data-testid="hero-tagline">
            Willing hands, real change — one hour at a time.
          </p>
          <h1 className="font-serif text-4xl md:text-6xl text-navy leading-[1.1] max-w-4xl mx-auto mb-8" data-testid="hero-headline">
            Serve your community.<br/>
            <span className="text-teal">See the impact.</span>
          </h1>
          <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto mb-10">
            CAWS matches students with trusted nonprofits doing work that matters — tutoring kids,
            feeding neighbors, restoring habitats. Every hour served is verified, so your effort
            counts where it counts.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link to="/signup"><Button className="bg-teal hover:bg-teal-hover text-white rounded-md px-8 py-6 text-base" data-testid="hero-signup-btn">Get started</Button></Link>
            <Link to="/opportunities"><Button variant="outline" className="border-navy text-navy hover:bg-navy hover:text-white rounded-md px-8 py-6 text-base" data-testid="hero-browse-btn">Browse opportunities</Button></Link>
          </div>
        </div>
      </section>

      {/* Stats ledger */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="text-xs tracking-[0.2em] text-gold uppercase mb-2">The Ledger</div>
          <h2 className="font-serif text-3xl md:text-4xl text-navy">Impact, by the numbers</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {statsLoading ? [1,2,3].map(i => (
            <div key={i} className="ledger-card animate-pulse" data-testid={`stat-skeleton-${i}`}>
              <div className="h-14 bg-warm-muted rounded mb-4"/>
              <div className="h-3 w-32 bg-warm-muted rounded"/>
            </div>
          )) : (
            <>
              <Stat n={stats.students} label="Students Enrolled" testid="stat-students"/>
              <Stat n={stats.nonprofits} label="Vetted Nonprofits" testid="stat-nonprofits"/>
              <Stat n={stats.hours} label="Verified Hours" testid="stat-hours"/>
            </>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-[color:var(--caws-border)]">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="text-xs tracking-[0.2em] text-gold uppercase mb-2">How it Works</div>
            <h2 className="font-serif text-3xl md:text-4xl text-navy">A simple, verified path from signup to certificate</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Step num="01" title="Discover" body="Find nonprofits working on causes you care about — locally or remote."/>
            <Step num="02" title="Serve" body="Show up. Do the work. Log the hours you spent helping people."/>
            <Step num="03" title="Grow" body="Nonprofits verify your service. Your record grows, your impact becomes real, and communities get stronger."/>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="font-serif text-3xl md:text-4xl text-navy mb-4">Ready to help?</h2>
        <p className="text-gray-600 mb-8 max-w-xl mx-auto">Free for students. Free for nonprofits. Because helping shouldn't cost anything.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link to="/signup?type=student"><Button className="bg-teal hover:bg-teal-hover text-white rounded-md px-8" data-testid="cta-student-btn">I'm a student</Button></Link>
          <Link to="/signup?type=ngo"><Button variant="outline" className="border-navy text-navy hover:bg-navy hover:text-white rounded-md px-8" data-testid="cta-ngo-btn">We're a nonprofit</Button></Link>
        </div>
      </section>

      <footer className="border-t border-[color:var(--caws-border)] bg-white py-8">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Crest size={32}/>
            <span className="font-serif text-navy">CAWS · Community Action With Students</span>
          </div>
          <div className="text-xs text-gray-500">© {new Date().getFullYear()} CAWS. Real service, real impact.</div>
        </div>
      </footer>
    </div>
  );
}
