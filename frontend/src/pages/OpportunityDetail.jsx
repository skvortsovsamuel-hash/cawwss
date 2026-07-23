import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

export default function OpportunityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [opp, setOpp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get(`/opportunities/${id}`).then(r => setOpp(r.data)).finally(() => setLoading(false));
  }, [id]);

  const apply = async () => {
    if (!user) return nav("/login");
    setApplying(true);
    try {
      await api.post("/applications", { opportunity_id: id, message });
      toast.success("Application submitted");
      nav("/student/applications");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to apply");
    } finally { setApplying(false); }
  };

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-4xl mx-auto px-6 py-12">
        {loading ? (
          <div className="animate-pulse space-y-4" data-testid="opp-detail-skeleton">
            <div className="h-10 w-2/3 bg-warm-muted rounded"/>
            <div className="h-4 w-1/2 bg-warm-muted rounded"/>
            <div className="h-40 bg-warm-muted rounded mt-6"/>
          </div>
        ) : !opp ? (
          <div className="text-center py-16">Opportunity not found. <Link to="/opportunities" className="text-teal">Browse others</Link></div>
        ) : (
          <div>
            <Link to="/opportunities" className="text-sm text-teal hover:underline mb-4 inline-block" data-testid="back-to-opps">← Back to discover</Link>
            <div className="flex items-start gap-3 flex-wrap mb-3">
              <h1 className="font-serif text-4xl text-navy" data-testid="opp-title">{opp.title}</h1>
              {opp.is_remote && <Badge className="bg-teal text-white">Remote</Badge>}
            </div>
            <div className="text-gray-600 mb-8">
              <Link to={`/ngos/${opp.ngo_id}`} className="text-teal hover:underline" data-testid="opp-ngo-link">{opp.ngo_name}</Link> · {opp.location}
            </div>
            <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8 mb-8">
              <div className="grid grid-cols-3 gap-6 mb-8 pb-6 border-b border-[color:var(--caws-border)]">
                <div><div className="text-xs tracking-widest uppercase text-gray-500 mb-1">Est. Commitment</div><div className="font-serif text-2xl text-navy">~{opp.hours_estimate}h</div></div>
                <div><div className="text-xs tracking-widest uppercase text-gray-500 mb-1">Cause</div><div className="font-serif text-2xl text-navy">{opp.cause}</div></div>
                <div><div className="text-xs tracking-widest uppercase text-gray-500 mb-1">Slots</div><div className="font-serif text-2xl text-navy">{opp.slots}</div></div>
              </div>
              <h3 className="font-serif text-lg text-navy mb-2">About this opportunity</h3>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed" data-testid="opp-description">{opp.description}</p>
              {(opp.start_date || opp.end_date) && (
                <div className="mt-4 text-sm text-gray-600">
                  {opp.start_date && <span>Starts: {opp.start_date}</span>}{opp.start_date && opp.end_date && <span> · </span>}
                  {opp.end_date && <span>Ends: {opp.end_date}</span>}
                </div>
              )}
            </div>

            {user?.role === "student" && (
              <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8">
                <h3 className="font-serif text-xl text-navy mb-4">Apply</h3>
                <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message to the nonprofit..."
                          className="mb-4" data-testid="apply-message-input"/>
                <Button onClick={apply} disabled={applying} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="apply-submit-btn">
                  {applying ? "Submitting..." : "Submit application"}
                </Button>
              </div>
            )}
            {!user && (
              <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-6 text-center">
                <Link to="/signup"><Button className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="signup-to-apply-btn">Sign up to apply</Button></Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
