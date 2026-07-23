import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { StarDisplay } from "../components/ReviewDialog";

export default function NGOProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [ngo, setNgo] = useState(null);
  const [opps, setOpps] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/ngos/${id}`).then(r => setNgo(r.data)).catch(() => setNgo(null)),
      api.get(`/opportunities`, { params: { ngo_id: id } }).then(r => setOpps(r.data)).catch(() => {}),
      api.get(`/reviews/ngo/${id}`).then(r => setReviews(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0;

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-5xl mx-auto px-6 py-10">
        {loading ? (
          <div className="animate-pulse space-y-4" data-testid="ngo-profile-skeleton">
            <div className="h-8 w-1/2 bg-warm-muted rounded"/>
            <div className="h-4 w-1/3 bg-warm-muted rounded"/>
            <div className="h-32 bg-warm-muted rounded"/>
          </div>
        ) : !ngo ? (
          <div className="text-center py-20 text-gray-500" data-testid="ngo-profile-not-found">
            Nonprofit not found or not yet approved. <Link to="/opportunities" className="text-teal">Browse opportunities</Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="text-xs tracking-[0.2em] text-gold uppercase mb-2">Nonprofit Profile</div>
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h1 className="font-serif text-4xl text-navy" data-testid="ngo-profile-name">{ngo.org_name}</h1>
                  <div className="text-gray-600 mt-2">{ngo.location}</div>
                  {ngo.website && (
                    <a href={ngo.website.startsWith("http") ? ngo.website : `https://${ngo.website}`}
                       target="_blank" rel="noopener noreferrer" className="text-sm text-teal hover:underline mt-1 inline-block"
                       data-testid="ngo-profile-website">{ngo.website}</a>
                  )}
                </div>
                <div className="ledger-card !p-5 min-w-[180px] text-center" data-testid="ngo-profile-reliability">
                  <div className="ledger-number !text-4xl">{ngo.reliability_score}</div>
                  <div className="ledger-label">Reliability Score</div>
                </div>
              </div>
              {user?.role === "student" && ngo.user_id && (
                <div className="mt-4">
                  <Button onClick={() => nav(`/messages?with=${ngo.user_id}`)}
                          className="bg-teal hover:bg-teal-hover text-white rounded-md"
                          data-testid="ngo-message-btn">
                    Message {ngo.org_name}
                  </Button>
                </div>
              )}
              {ngo.category_tags?.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-4">
                  {ngo.category_tags.map(t => (
                    <Badge key={t} variant="outline" className="border-navy text-navy" data-testid={`ngo-tag-${t}`}>{t}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8 mb-8">
              <h2 className="font-serif text-xl text-navy mb-3">Mission</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap" data-testid="ngo-profile-mission">{ngo.mission}</p>
            </div>

            <div className="mb-10">
              <h2 className="font-serif text-2xl text-navy mb-4">Open opportunities</h2>
              {opps.length === 0 ? (
                <div className="text-gray-500" data-testid="ngo-profile-no-opps">No open opportunities right now.</div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {opps.map(o => (
                    <Link key={o.id} to={`/opportunities/${o.id}`} data-testid={`ngo-profile-opp-${o.id}`}
                          className="bg-white border border-[color:var(--caws-border)] rounded-md p-5 hover:border-teal transition-colors">
                      <div className="font-serif text-lg text-navy">{o.title}</div>
                      <div className="text-xs text-gray-500 mt-1">{o.cause} · {o.hours_estimate}h · {o.location}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-serif text-2xl text-navy">What volunteers say</h2>
                {reviews.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <StarDisplay rating={Math.round(avgRating)}/>
                    <span data-testid="ngo-profile-avg-rating">{avgRating.toFixed(1)} · {reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
              {reviews.length === 0 ? (
                <div className="text-gray-500" data-testid="ngo-profile-no-reviews">No reviews yet. Be the first to volunteer here.</div>
              ) : (
                <div className="space-y-3">
                  {reviews.map(r => (
                    <div key={r.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5" data-testid={`ngo-profile-review-${r.id}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <StarDisplay rating={r.rating} size="text-sm"/>
                        <span className="text-sm font-medium text-navy">{r.student_name}</span>
                        <span className="text-xs text-gray-500">· {new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-gray-700">{r.comment}</p>
                      <div className="text-xs text-gray-400 mt-2">on "{r.opportunity_title}"</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
