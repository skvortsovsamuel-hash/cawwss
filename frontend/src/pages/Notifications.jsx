import { useEffect, useState } from "react";
import { api } from "../lib/api";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import ReviewDialog from "../components/ReviewDialog";

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewFor, setReviewFor] = useState(null); // notification being reviewed

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/notifications"); setItems(r.data || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const mark = async (id) => { await api.patch(`/notifications/${id}/read`); load(); };

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="font-serif text-3xl text-navy mb-6">Notifications</h1>
        {loading ? <div className="text-gray-500">Loading...</div> :
         items.length === 0 ? <div className="text-center py-12 text-gray-500" data-testid="notif-empty">You're all caught up.</div> :
         <div className="space-y-2">
           {items.map(n => {
             const isReviewRequest = n.type === "review_request";
             return (
               <div key={n.id}
                    className={`bg-white border rounded-md p-4 flex justify-between items-center gap-3 flex-wrap ${
                      isReviewRequest ? "border-gold" : "border-[color:var(--caws-border)]"
                    } ${!n.read ? "border-l-4 border-l-teal" : "opacity-70"}`}
                    data-testid={`notif-${n.id}`}>
                 <div className="flex-1 min-w-0">
                   {isReviewRequest && (
                     <div className="text-[10px] tracking-widest uppercase text-gold font-medium mb-1">Review Request</div>
                   )}
                   <div className="text-sm text-navy">{n.message}</div>
                   <div className="text-xs text-gray-500 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                 </div>
                 <div className="flex items-center gap-2">
                   {isReviewRequest && !n.read && (
                     <Button size="sm"
                             onClick={() => setReviewFor(n)}
                             className="bg-teal hover:bg-teal-hover text-white rounded-md"
                             data-testid={`notif-review-btn-${n.id}`}>
                       Leave review
                     </Button>
                   )}
                   {!n.read && (
                     <Button size="sm" variant="outline" onClick={() => mark(n.id)} data-testid={`notif-mark-${n.id}`}>
                       Mark read
                     </Button>
                   )}
                 </div>
               </div>
             );
           })}
         </div>}

        {reviewFor && (
          <ReviewDialog
            external={{ open: true, onOpenChange: (v) => { if (!v) setReviewFor(null); } }}
            opportunityId={reviewFor.opportunity_id}
            opportunityTitle={reviewFor.opportunity_title}
            hours={reviewFor.hours}
            ngoName={reviewFor.ngo_name}
            onDone={() => { setReviewFor(null); load(); }}
          />
        )}
      </div>
    </div>
  );
}
