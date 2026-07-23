import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";

// Compact star rating input
function StarInput({ value, onChange, testidPrefix }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
                data-testid={`${testidPrefix}-star-${n}`}
                className={`text-3xl transition-colors ${n <= value ? "text-gold" : "text-gray-300"} hover:text-gold`}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function ReviewDialog({
  opportunityId, opportunityTitle, hours, ngoName,
  onDone, triggerTestId = "open-review-dialog",
  triggerLabel = "Leave review",
  triggerClass = "",
  external, // optional: {open, onOpenChange} to control externally without trigger
}) {
  const [openInternal, setOpenInternal] = useState(false);
  const isExternal = !!external;
  const open = isExternal ? external.open : openInternal;
  const setOpen = isExternal ? external.onOpenChange : setOpenInternal;

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [hoursAccurate, setHoursAccurate] = useState(null); // true / false / null
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) { toast.error("Please share a few words"); return; }
    if (hoursAccurate === null) { toast.error("Please answer the hours question"); return; }
    setBusy(true);
    try {
      await api.post("/reviews", {
        opportunity_id: opportunityId,
        rating, comment,
        hours_accurate: hoursAccurate,
      });
      toast.success("Thanks for sharing your experience");
      setOpen(false); setComment(""); setRating(5); setHoursAccurate(null);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to submit");
    } finally { setBusy(false); }
  };

  const content = (
    <DialogContent className="bg-white">
      <DialogHeader>
        <DialogTitle className="font-serif">Review your experience</DialogTitle>
      </DialogHeader>
      <div className="text-sm text-gray-500 -mt-2 mb-2">
        {opportunityTitle}{ngoName ? ` — ${ngoName}` : ""}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>How would you rate the nonprofit?</Label>
          <div className="mt-1"><StarInput value={rating} onChange={setRating} testidPrefix="review"/></div>
        </div>
        <div className="border border-[color:var(--caws-border)] rounded-md p-4 bg-warm-gray/40">
          <Label className="block mb-2">
            Were your hours{hours ? ` (${hours}h)` : ""} verified accurately?
          </Label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setHoursAccurate(true)}
                    className={`flex-1 py-2 rounded-md border transition-colors ${hoursAccurate === true ? "border-teal bg-teal text-white" : "border-[color:var(--caws-border)] text-navy hover:border-teal"}`}
                    data-testid="review-hours-yes">
              Yes
            </button>
            <button type="button" onClick={() => setHoursAccurate(false)}
                    className={`flex-1 py-2 rounded-md border transition-colors ${hoursAccurate === false ? "border-red-600 bg-red-600 text-white" : "border-[color:var(--caws-border)] text-navy hover:border-red-500"}`}
                    data-testid="review-hours-no">
              No
            </button>
          </div>
        </div>
        <div>
          <Label>Your experience</Label>
          <Textarea required value={comment} onChange={e => setComment(e.target.value)}
                    placeholder="How was working with this nonprofit? What impact did you see?"
                    className="mt-1" data-testid="review-comment-input"/>
        </div>
        <Button type="submit" disabled={busy}
                className="w-full bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="review-submit-btn">
          {busy ? "Submitting..." : "Submit review"}
        </Button>
      </form>
    </DialogContent>
  );

  if (isExternal) {
    return <Dialog open={open} onOpenChange={setOpen}>{content}</Dialog>;
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"
                className={`border-navy text-navy hover:bg-navy hover:text-white rounded-md ${triggerClass}`}
                data-testid={triggerTestId}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      {content}
    </Dialog>
  );
}

// Static display of stars (for lists)
export function StarDisplay({ rating, size = "text-base" }) {
  return (
    <div className={`flex gap-0.5 ${size}`}>
      {[1,2,3,4,5].map(n => (
        <span key={n} className={n <= rating ? "text-gold" : "text-gray-300"}>★</span>
      ))}
    </div>
  );
}
