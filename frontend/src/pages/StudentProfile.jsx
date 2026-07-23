import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, BACKEND_URL, getToken } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import BadgeDisplay from "../components/BadgeDisplay";
import { StarDisplay } from "../components/ReviewDialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ACCENT_PALETTE = [
  { name: "Forest", value: "#0e3217" },
  { name: "Green",  value: "#407d4e" },
  { name: "Sage",   value: "#78af84" },
  { name: "Teal",   value: "#008080" },
  { name: "Rose",   value: "#B76E79" },
  { name: "Coral",  value: "#E27D60" },
  { name: "Indigo", value: "#4B4E9B" },
  { name: "Plum",   value: "#6B4E71" },
];

const fileUrl = (id) => id ? `${BACKEND_URL}/api/files/${id}?auth=${encodeURIComponent(getToken() || "")}` : null;

export default function StudentProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const isOwn = user?.id === id;

  // Edit-mode state lifted so the header (avatar/cover/accent) can live-preview
  const [form, setForm] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [uploadingAv, setUploadingAv] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const avRef = useRef(null);
  const cvRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/students/${id}`);
      setData(r.data);
    } catch {
      setData(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const beginEdit = () => {
    setForm({
      bio: data.bio || "",
      interests: (data.interests || []).join(", "),
      availability: data.availability || "",
      visibility: data.visibility || "public",
      accent_color: data.accent_color || "#407d4e",
      avatar_file_id: data.avatar_file_id || null,
      cover_file_id: data.cover_file_id || null,
      pinned_opportunity_id: data.pinned_opportunity?.id || "",
    });
    setAvatarPreview(null);
    setCoverPreview(null);
    setEditMode(true);
  };
  const cancelEdit = () => {
    setEditMode(false);
    setForm(null);
    setAvatarPreview(null);
    setCoverPreview(null);
  };

  const upload = async (file, kind) => {
    const fd = new FormData();
    fd.append("file", file);
    if (kind === "avatar") setUploadingAv(true); else setUploadingCv(true);
    const previewUrl = URL.createObjectURL(file);
    if (kind === "avatar") setAvatarPreview(previewUrl); else setCoverPreview(previewUrl);
    try {
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm(f => ({ ...f, [kind === "avatar" ? "avatar_file_id" : "cover_file_id"]: r.data.file_id }));
      toast.success(kind === "avatar" ? "Photo uploaded" : "Cover uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
      if (kind === "avatar") setAvatarPreview(null); else setCoverPreview(null);
    } finally {
      if (kind === "avatar") setUploadingAv(false); else setUploadingCv(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-5xl mx-auto px-6 py-8 animate-pulse space-y-6" data-testid="profile-skeleton">
        <div className="h-48 bg-warm-muted rounded-md"/>
        <div className="h-24 bg-warm-muted rounded-md"/>
        <div className="h-32 bg-warm-muted rounded-md"/>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-5xl mx-auto px-6 py-16 text-center text-gray-500" data-testid="profile-not-found">
        Profile not available.
      </div>
    </div>
  );

  // Which values are on screen right now (editing = live preview, else = saved values)
  const accent = editMode && form ? form.accent_color : (data.accent_color || "#407d4e");
  const shownAvatarId = editMode && form ? form.avatar_file_id : data.avatar_file_id;
  const shownCoverId = editMode && form ? form.cover_file_id : data.cover_file_id;
  const shownAvatarPreview = editMode ? avatarPreview : null;
  const shownCoverPreview = editMode ? coverPreview : null;

  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="max-w-5xl mx-auto pb-16">
        {/* Cover */}
        <div className="relative h-48 md:h-64 overflow-hidden group" data-testid="profile-cover"
             style={{ background: accent }}>
          {(shownCoverPreview || shownCoverId) && (
            <img src={shownCoverPreview || fileUrl(shownCoverId)} alt="Cover"
                 className="w-full h-full object-cover"/>
          )}
          {editMode && isOwn && (
            <>
              <input type="file" hidden ref={cvRef} accept="image/*" data-testid="cover-file-input"
                     onChange={e => e.target.files?.[0] && upload(e.target.files[0], "cover")}/>
              <button onClick={() => cvRef.current?.click()} disabled={uploadingCv}
                      className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-1.5 transition"
                      data-testid="upload-cover-btn">
                {uploadingCv ? <Loader2 size={12} className="animate-spin"/> : <Camera size={12}/>}
                {uploadingCv ? "Uploading…" : (shownCoverId ? "Change cover" : "Add cover")}
              </button>
            </>
          )}
        </div>

        <div className="px-6 -mt-16 relative">
          {/* Avatar overlaps the cover — clickable in edit mode */}
          <div className="relative w-32 h-32" data-testid="profile-avatar-wrapper">
            <div
              className={`w-32 h-32 rounded-full border-4 border-white overflow-hidden shadow-md ${editMode && isOwn ? "cursor-pointer" : ""}`}
              style={{ background: `${accent}30` }}
              onClick={() => { if (editMode && isOwn && !uploadingAv) avRef.current?.click(); }}
              data-testid="profile-avatar"
              role={editMode && isOwn ? "button" : undefined}
              aria-label={editMode && isOwn ? "Change profile photo" : undefined}
            >
              {(shownAvatarPreview || shownAvatarId) ? (
                <img src={shownAvatarPreview || fileUrl(shownAvatarId)} alt={data.name}
                     className="w-full h-full object-cover"/>
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif text-4xl"
                     style={{ color: accent }}>
                  {(data.name || "?")[0]}
                </div>
              )}
            </div>

            {editMode && isOwn && (
              <>
                <input type="file" hidden ref={avRef} accept="image/*" data-testid="avatar-file-input"
                       onChange={e => e.target.files?.[0] && upload(e.target.files[0], "avatar")}/>
                {/* Camera overlay button */}
                <button
                  onClick={() => avRef.current?.click()}
                  disabled={uploadingAv}
                  className="absolute bottom-1 right-1 w-9 h-9 rounded-full text-white shadow-md flex items-center justify-center hover:scale-105 transition disabled:opacity-70"
                  style={{ background: accent }}
                  aria-label="Change profile photo"
                  data-testid="upload-avatar-btn"
                >
                  {uploadingAv ? <Loader2 size={16} className="animate-spin"/> : <Camera size={16}/>}
                </button>
              </>
            )}
          </div>

          {/* Name */}
          <div className="mt-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="font-serif text-3xl md:text-4xl text-navy" data-testid="profile-name">{data.name}</h1>
              {data.school && <div className="text-gray-600 mt-1" data-testid="profile-school">{data.school}</div>}
              <div className="text-xs text-gray-400 mt-1">
                Member since {data.created_at ? new Date(data.created_at).toLocaleDateString(undefined, {year:'numeric', month:'long'}) : "—"}
              </div>
            </div>
            {isOwn && !editMode && (
              <Button onClick={beginEdit}
                      className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="profile-edit-btn">
                Edit profile
              </Button>
            )}
            {!isOwn && user?.role === "ngo" && (
              <Button onClick={() => window.location.assign(`/messages?with=${data.id}`)}
                      className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="student-message-btn">
                Message {data.name?.split(" ")[0] || "student"}
              </Button>
            )}
          </div>

          {editMode && isOwn && form ? (
            <EditForm
              form={form}
              setForm={setForm}
              onDone={() => { cancelEdit(); load(); }}
              onCancel={cancelEdit}
              accent={accent}
            />
          ) : (
            <PublicView data={data} accent={accent}/>
          )}
        </div>
      </div>
    </div>
  );
}

function PublicView({ data, accent }) {
  return (
    <>
      {/* Bio + interests */}
      {(data.bio || (data.interests || []).length > 0 || data.availability) && (
        <div className="mt-8 bg-white border rounded-md p-6" style={{ borderColor: `${accent}30` }}>
          {data.bio && <p className="text-gray-700 whitespace-pre-wrap" data-testid="profile-bio">{data.bio}</p>}
          {(data.interests || []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.interests.map(i => (
                <Badge key={i} variant="outline"
                       style={{ borderColor: accent, color: accent }}
                       data-testid={`interest-${i}`}>{i}</Badge>
              ))}
            </div>
          )}
          {data.availability && (
            <div className="mt-4 text-sm text-gray-500">
              <span className="uppercase tracking-widest text-xs mr-2">Availability</span>
              <span data-testid="profile-availability">{data.availability}</span>
            </div>
          )}
        </div>
      )}

      {/* Pinned opp */}
      {data.pinned_opportunity && (
        <div className="mt-8" data-testid="profile-pinned">
          <div className="text-xs tracking-widest uppercase mb-2" style={{ color: accent }}>Featured</div>
          <Link to={`/opportunities/${data.pinned_opportunity.id}`}
                className="block bg-white border-2 rounded-md p-6 hover:shadow-md transition-shadow"
                style={{ borderColor: accent }}>
            <div className="font-serif text-xl text-navy">{data.pinned_opportunity.title}</div>
            <div className="text-sm text-gray-500 mt-1">{data.pinned_opportunity.ngo_name} · {data.pinned_opportunity.cause}</div>
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="mt-8">
        <div className="text-xs tracking-widest uppercase mb-3" style={{ color: accent }}>The Record</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard n={data.total_hours} label="Verified Hours" testId="stat-total-hours"/>
          <StatCard n={data.opportunity_count} label="Opportunities" testId="stat-opp-count"/>
          <StatCard n={data.ngo_count} label="Nonprofits" testId="stat-ngo-count"/>
          <StatCard n={data.months_active} label="Months Active" testId="stat-months-active"/>
        </div>
        {Object.keys(data.hours_by_category || {}).length > 0 && (
          <div className="mt-6 bg-white border border-[color:var(--caws-border)] rounded-md p-6">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Hours by cause</div>
            <div className="space-y-2">
              {Object.entries(data.hours_by_category).sort((a,b) => b[1] - a[1]).map(([cause, hrs]) => {
                const pct = Math.round((hrs / data.total_hours) * 100);
                return (
                  <div key={cause} data-testid={`hours-cat-${cause}`}>
                    <div className="flex justify-between text-sm text-navy mb-1">
                      <span>{cause}</span>
                      <span className="text-gray-500">{hrs}h · {pct}%</span>
                    </div>
                    <div className="h-2 bg-warm-muted rounded overflow-hidden">
                      <div className="h-full" style={{ width: `${pct}%`, background: accent }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="mt-8 bg-white border border-[color:var(--caws-border)] rounded-md p-6" data-testid="badges-section">
        <div className="text-xs tracking-widest uppercase mb-4" style={{ color: accent }}>Badges</div>
        <BadgeDisplay tierBadges={data.tier_badges} categoryBadges={data.category_badges}/>
      </div>

      {/* Public reviews from NGOs */}
      <div className="mt-8">
        <div className="text-xs tracking-widest uppercase mb-3" style={{ color: accent }}>Reviews from nonprofits</div>
        {(data.public_reviews || []).length === 0 ? (
          <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-6 text-gray-500 text-sm" data-testid="no-public-reviews">
            No public reviews yet.
          </div>
        ) : (
          <div className="space-y-3">
            {data.public_reviews.map(r => (
              <div key={r.id} className="bg-white border border-[color:var(--caws-border)] rounded-md p-5" data-testid={`public-review-${r.id}`}>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <StarDisplay rating={r.rating} size="text-sm"/>
                  <span className="text-sm font-medium text-navy">{r.ngo_name}</span>
                  <span className="text-xs text-gray-500">· {new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-gray-700">{r.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ n, label, testId }) {
  return (
    <div className="ledger-card !p-5" data-testid={testId}>
      <div className="ledger-number !text-3xl">{typeof n === "number" ? n.toLocaleString() : n}</div>
      <div className="ledger-label !mt-2">{label}</div>
    </div>
  );
}

function EditForm({ form, setForm, onDone, onCancel, accent }) {
  const [completed, setCompleted] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/students/me/completed").then(r => setCompleted(r.data || [])).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        bio: form.bio,
        interests: form.interests.split(",").map(t => t.trim()).filter(Boolean),
        availability: form.availability,
        visibility: form.visibility,
        accent_color: form.accent_color,
        avatar_file_id: form.avatar_file_id,
        cover_file_id: form.cover_file_id,
        pinned_opportunity_id: form.pinned_opportunity_id || null,
      };
      await api.patch("/students/me", payload);
      toast.success("Profile updated");
      onDone?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-8 bg-white border rounded-md p-6 space-y-6" style={{ borderColor: `${accent}30` }} data-testid="profile-edit-form">
      <div className="text-xs tracking-widest uppercase" style={{ color: accent }}>Edit profile</div>

      {/* Bio */}
      <div>
        <Label>Bio</Label>
        <Textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})}
                  placeholder="Tell nonprofits a bit about yourself…" className="mt-1" data-testid="bio-input"/>
      </div>

      {/* Interests */}
      <div>
        <Label>Interests <span className="text-xs text-gray-500">(comma separated)</span></Label>
        <Input value={form.interests} onChange={e => setForm({...form, interests: e.target.value})}
               placeholder="Tutoring, Trail cleanup, Community meals"
               className="mt-1" data-testid="interests-input"/>
      </div>

      {/* Availability */}
      <div>
        <Label>Availability</Label>
        <Input value={form.availability} onChange={e => setForm({...form, availability: e.target.value})}
               placeholder="Weekends, evenings after 6pm, spring break"
               className="mt-1" data-testid="availability-input"/>
      </div>

      {/* Accent — live preview */}
      <div>
        <Label>Accent color <span className="text-xs text-gray-500">(previews live)</span></Label>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="accent-color-picker">
          {ACCENT_PALETTE.map(c => (
            <button key={c.value} type="button" title={c.name}
                    onClick={() => setForm({...form, accent_color: c.value})}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${form.accent_color === c.value ? "border-navy scale-110" : "border-white hover:scale-105"}`}
                    style={{ background: c.value }}
                    data-testid={`accent-${c.name.toLowerCase()}`}/>
          ))}
        </div>
      </div>

      {/* Pinned opp */}
      <div>
        <Label>Featured opportunity</Label>
        <select value={form.pinned_opportunity_id}
                onChange={e => setForm({...form, pinned_opportunity_id: e.target.value})}
                className="mt-1 w-full border border-input rounded-md px-3 py-2 bg-white"
                data-testid="pinned-select">
          <option value="">None</option>
          {completed.map(o => <option key={o.id} value={o.id}>{o.title} — {o.ngo_name}</option>)}
        </select>
        {completed.length === 0 && (
          <p className="text-xs text-gray-500 mt-1">Complete an opportunity (verified hours) to pin it here.</p>
        )}
      </div>

      {/* Visibility */}
      <div>
        <Label>Profile visibility</Label>
        <div className="mt-2 flex gap-2 flex-wrap" data-testid="visibility-picker">
          {[
            {v: "public", label: "Public", d: "Anyone can view"},
            {v: "ngos_only", label: "NGOs only", d: "Only vetted nonprofits"},
            {v: "private", label: "Private", d: "Only you"},
          ].map(o => (
            <button key={o.v} type="button" onClick={() => setForm({...form, visibility: o.v})}
                    className={`flex-1 min-w-[120px] p-3 rounded-md border transition-colors text-left ${form.visibility === o.v ? "bg-teal/10" : "border-[color:var(--caws-border)] hover:border-teal"}`}
                    style={form.visibility === o.v ? { borderColor: accent } : undefined}
                    data-testid={`visibility-${o.v}`}>
              <div className="font-medium text-navy text-sm">{o.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{o.d}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2 border-t border-[color:var(--caws-border)]">
        <Button onClick={save} disabled={busy}
                style={{ background: accent }}
                className="hover:opacity-90 text-white rounded-md flex-1" data-testid="profile-save-btn">
          {busy ? "Saving..." : "Save changes"}
        </Button>
        <Button onClick={onCancel} variant="outline" className="rounded-md" data-testid="profile-cancel-btn">
          Cancel
        </Button>
      </div>
    </div>
  );
}
