import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Crest from "../components/Crest";
import GoogleButton from "../components/GoogleButton";
import BackLink from "../components/BackLink";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

export default function Signup() {
  const [params] = useSearchParams();
  const initial = params.get("type") === "ngo" ? "ngo" : params.get("type") === "student" ? "student" : null;
  const [mode, setMode] = useState(initial);

  if (!mode) return <ChoosePath onPick={setMode}/>;
  return mode === "student" ? <StudentForm/> : <NGOForm/>;
}

function ChoosePath({ onPick }) {
  return (
    <div className="min-h-screen crest-container flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-4"><BackLink to="/" label="Back to home" testId="signup-back-link"/></div>
        <Link to="/" className="flex flex-col items-center mb-8">
          <Crest size={64}/>
          <span className="font-serif text-2xl text-navy mt-3">CAWS</span>
        </Link>
        <h1 className="font-serif text-3xl text-navy text-center mb-2">Join CAWS</h1>
        <p className="text-center text-gray-600 mb-10">Pick your path.</p>
        <div className="grid md:grid-cols-2 gap-6">
          <button onClick={() => onPick("student")} data-testid="signup-choose-student"
                  className="text-left p-8 bg-white border border-[color:var(--caws-border)] rounded-md hover:border-teal transition-colors">
            <div className="text-xs tracking-widest text-gold uppercase mb-2">For Students</div>
            <h3 className="font-serif text-2xl text-navy mb-3">I'm a student</h3>
            <p className="text-sm text-gray-600">Discover opportunities, log verified hours, earn certificates.</p>
          </button>
          <button onClick={() => onPick("ngo")} data-testid="signup-choose-ngo"
                  className="text-left p-8 bg-white border border-[color:var(--caws-border)] rounded-md hover:border-teal transition-colors">
            <div className="text-xs tracking-widest text-gold uppercase mb-2">For Nonprofits</div>
            <h3 className="font-serif text-2xl text-navy mb-3">We're a nonprofit</h3>
            <p className="text-sm text-gray-600">Post opportunities, verify hours, build your reliability score.</p>
          </button>
        </div>
        <div className="text-center mt-8 text-sm text-gray-600">
          Already have an account? <Link to="/login" className="text-teal hover:underline">Log in</Link>
        </div>
      </div>
    </div>
  );
}

function StudentForm() {
  const [form, setForm] = useState({ name: "", email: "", password: "", school: "" });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const set = (k, v) => setForm({ ...form, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post("/auth/register/student", form);
      login(r.data.token, r.data.user);
      toast.success("Welcome to CAWS — check your email to verify");
      nav("/student");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen crest-container flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-4"><BackLink label="Back" testId="student-signup-back-link"/></div>
        <Link to="/" className="flex flex-col items-center mb-6"><Crest size={56}/></Link>
        <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8">
          <h1 className="font-serif text-2xl text-navy mb-2">Student sign-up</h1>
          <p className="text-sm text-gray-600 mb-6">Start building your verified service record.</p>
          <GoogleButton label="Sign up with Google" testId="signup-google-btn"/>
          <div className="my-5 flex items-center gap-3 text-xs text-gray-400 uppercase tracking-widest">
            <div className="flex-1 h-px bg-[color:var(--caws-border)]"/>
            <span>or with email</span>
            <div className="flex-1 h-px bg-[color:var(--caws-border)]"/>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Full name</Label><Input required value={form.name} onChange={e => set("name", e.target.value)} data-testid="student-name-input" className="mt-1"/></div>
            <div><Label>Email</Label><Input type="email" required value={form.email} onChange={e => set("email", e.target.value)} data-testid="student-email-input" className="mt-1"/></div>
            <div><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={e => set("password", e.target.value)} data-testid="student-password-input" className="mt-1"/></div>
            <div><Label>School / University (optional)</Label><Input value={form.school} onChange={e => set("school", e.target.value)} data-testid="student-school-input" className="mt-1"/></div>
            <Button type="submit" disabled={loading} className="w-full bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="student-signup-submit">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function NGOForm() {
  const [form, setForm] = useState({
    org_name: "", mission: "", category_tags: "", ein: "", location: "",
    contact_name: "", contact_phone: "", website: "", email: "", password: ""
  });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const set = (k, v) => setForm({ ...form, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, category_tags: form.category_tags.split(",").map(t => t.trim()).filter(Boolean) };
      const r = await api.post("/auth/register/ngo", payload);
      login(r.data.token, r.data.user);
      toast.success("Registered — check your email to verify. Upload your legitimacy doc next.");
      nav("/ngo/pending");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen crest-container flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-4"><BackLink label="Back" testId="ngo-signup-back-link"/></div>
        <Link to="/" className="flex flex-col items-center mb-6"><Crest size={56}/></Link>
        <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8">
          <h1 className="font-serif text-2xl text-navy mb-2">Nonprofit registration</h1>
          <p className="text-sm text-gray-600 mb-6">Every organization is reviewed before posting opportunities.</p>
          <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><Label>Organization name</Label><Input required value={form.org_name} onChange={e => set("org_name", e.target.value)} data-testid="ngo-org-input" className="mt-1"/></div>
            <div className="md:col-span-2"><Label>Mission statement</Label><Textarea required value={form.mission} onChange={e => set("mission", e.target.value)} data-testid="ngo-mission-input" className="mt-1"/></div>
            <div><Label>Category tags (comma-separated)</Label><Input placeholder="Education, Environment" value={form.category_tags} onChange={e => set("category_tags", e.target.value)} data-testid="ngo-tags-input" className="mt-1"/></div>
            <div><Label>EIN / Registration # <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label><Input value={form.ein} onChange={e => set("ein", e.target.value)} data-testid="ngo-ein-input" className="mt-1" placeholder="Leave blank if not applicable"/></div>
            <div><Label>Location (City, State)</Label><Input required value={form.location} onChange={e => set("location", e.target.value)} data-testid="ngo-location-input" className="mt-1"/></div>
            <div><Label>Website</Label><Input value={form.website} onChange={e => set("website", e.target.value)} data-testid="ngo-website-input" className="mt-1"/></div>
            <div><Label>Contact name</Label><Input required value={form.contact_name} onChange={e => set("contact_name", e.target.value)} data-testid="ngo-contact-input" className="mt-1"/></div>
            <div><Label>Contact phone</Label><Input value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)} data-testid="ngo-phone-input" className="mt-1"/></div>
            <div><Label>Email (login)</Label><Input type="email" required value={form.email} onChange={e => set("email", e.target.value)} data-testid="ngo-email-input" className="mt-1"/></div>
            <div><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={e => set("password", e.target.value)} data-testid="ngo-password-input" className="mt-1"/></div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={loading} className="w-full bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="ngo-signup-submit">
                {loading ? "Submitting..." : "Submit for review"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
