import { useState, type FormEvent } from "react";
import { Github, KeyRound } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input } from "@authenik8/ui";
import { AuthShell } from "../../components/AuthShell";
import { ErrorNotice, Field } from "../../components/Page";
import { useAuth } from "../../auth/AuthProvider";
import { enabledOAuthProviders } from "../../auth/providers";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await login({ email, password });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your workspace" footer={<>New to Authenik8? <Link to="/register">Create an account</Link></>}>
      {params.has("oauthError") && <ErrorNotice error={new Error("OAuth sign-in could not be completed")} />}
      {error !== undefined && <ErrorNotice error={error} />}
      <form className="form-stack" onSubmit={submit}>
        <Field label="Email address" htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
        <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
        <div className="form-row end"><Link to="/forgot-password">Forgot password?</Link></div>
        <Button type="submit" disabled={pending}><KeyRound size={17} /> {pending ? "Signing in..." : "Sign in"}</Button>
      </form>
      {enabledOAuthProviders.length > 0 && <><div className="divider"><span>or continue with</span></div>
        <div className="oauth-grid">
          {enabledOAuthProviders.map((provider) => <Button key={provider} variant="secondary" onClick={() => window.location.assign(`/api/auth/oauth/${provider}`)}>{provider === "google" ? <span className="provider-g">G</span> : <Github size={18} />} {provider === "google" ? "Google" : "GitHub"}</Button>)}
        </div></>}
    </AuthShell>
  );
}
