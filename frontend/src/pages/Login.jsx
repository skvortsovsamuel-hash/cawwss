import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Crest from "../components/Crest";
import GoogleButton from "../components/GoogleButton";
import BackLink from "../components/BackLink";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post("/auth/login", { email, password });
      login(r.data.token, r.data.user);
      toast.success("Welcome back");
      const dest = r.data.user.role === "admin" ? "/admin"
                 : r.data.user.role === "ngo" ? "/ngo"
                 : "/student";
      nav(dest);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen crest-container flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-4"><BackLink to="/" label="Back to home" testId="login-back-link"/></div>
        <Link to="/" className="flex flex-col items-center mb-8">
          <Crest size={64}/>
          <span className="font-serif text-2xl text-navy mt-3">CAWS</span>
        </Link>
        <div className="bg-white border border-[color:var(--caws-border)] rounded-md p-8">
          <h1 className="font-serif text-2xl text-navy mb-2">Welcome back</h1>
          <p className="text-sm text-gray-600 mb-6">Log in to continue your service journey.</p>
          <GoogleButton testId="login-google-btn"/>
          <div className="my-5 flex items-center gap-3 text-xs text-gray-400 uppercase tracking-widest">
            <div className="flex-1 h-px bg-[color:var(--caws-border)]"/>
            <span>or</span>
            <div className="flex-1 h-px bg-[color:var(--caws-border)]"/>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                     data-testid="login-email-input" className="mt-1"/>
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)}
                     data-testid="login-password-input" className="mt-1"/>
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="login-submit-btn">
              {loading ? "Logging in..." : "Log in"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-gray-600">
            No account? <Link to="/signup" className="text-teal hover:underline" data-testid="login-signup-link">Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
