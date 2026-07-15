import { useState, type FormEvent } from "react";
import { ArrowLeft, Mail, RotateCcw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Input } from "@authenik8/ui";
import { authApi } from "@authenik8/api-client";
import { AuthShell } from "../../components/AuthShell";
import { ErrorNotice, Field, SuccessNotice } from "../../components/Page";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ message: string; devResetToken?: string }>();
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try { setResult(await authApi.forgotPassword(email)); } catch (caught) { setError(caught); }
  }
  return (
    <AuthShell title="Reset your password" subtitle="We will send a short-lived recovery link" footer={<Link to="/login"><ArrowLeft size={15} /> Back to sign in</Link>}>
      {error !== undefined && <ErrorNotice error={error} />}
      {result ? <SuccessNotice>{result.message}{result.devResetToken && <> Development token: <code>{result.devResetToken}</code></>}</SuccessNotice> : (
        <form className="form-stack" onSubmit={submit}>
          <Field label="Email address" htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
          <Button type="submit"><Mail size={17} /> Send recovery link</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>();
  const token = params.get("token") ?? "";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try { await authApi.resetPassword(token, password); setDone(true); } catch (caught) { setError(caught); }
  }
  return (
    <AuthShell title="Choose a new password" subtitle="This link can be used once" footer={<Link to="/login">Return to sign in</Link>}>
      {error !== undefined && <ErrorNotice error={error} />}
      {done ? <SuccessNotice>Password updated. You can sign in now.</SuccessNotice> : (
        <form className="form-stack" onSubmit={submit}>
          <Field label="New password" htmlFor="password"><Input id="password" type="password" minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
          <Button type="submit" disabled={!token}><RotateCcw size={17} /> Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}
