import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, KeyRound, Link2, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { Badge, Button, Input, Spinner } from "@authenik8/ui";
import { accountApi, authApi } from "@authenik8/api-client";
import { ErrorNotice, Field, PageHeader, SuccessNotice } from "../../components/Page";
import { enabledOAuthProviders } from "../../auth/providers";

export function SecurityPage() {
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: accountApi.sessions });
  const providers = useQuery({ queryKey: ["providers"], queryFn: accountApi.providers });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [passwordSaved, setPasswordSaved] = useState(false);
  const passwordMutation = useMutation({ mutationFn: () => accountApi.changePassword(passwords), onSuccess: () => { setPasswords({ currentPassword: "", newPassword: "" }); setPasswordSaved(true); } });
  const revoke = useMutation({ mutationFn: accountApi.revokeSession, onSuccess: () => client.invalidateQueries({ queryKey: ["sessions"] }) });
  async function link(provider: "google" | "github") {
    const result = await accountApi.startProviderLink(provider);
    window.location.assign(result.url);
  }
  function submitPassword(event: FormEvent) { event.preventDefault(); setPasswordSaved(false); passwordMutation.mutate(); }

  return (
    <>
      <PageHeader title="Security" description="Credentials, providers, and active sessions." />
      <div className="settings-layout">
        <nav className="settings-nav"><a href="/settings/profile">Profile</a><a className="active" href="/settings/security">Security</a></nav>
        <div className="settings-stack">
          <form className="form-panel" onSubmit={submitPassword}>
            <div className="form-section-heading"><span className="stat-icon violet"><KeyRound size={19} /></span><div><h2>Password</h2><p>Update your credential regularly.</p></div></div>
            {passwordMutation.error && <ErrorNotice error={passwordMutation.error} />}{passwordSaved && <SuccessNotice>Password updated.</SuccessNotice>}
            <div className="two-fields"><Field label="Current password" htmlFor="current-password"><Input id="current-password" type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} required /></Field><Field label="New password" htmlFor="new-password"><Input id="new-password" type="password" minLength={10} autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} required /></Field></div>
            <div className="form-actions"><Button type="submit" disabled={passwordMutation.isPending}>Update password</Button></div>
          </form>

          <section className="panel settings-panel">
            <div className="form-section-heading"><span className="stat-icon cyan"><Link2 size={19} /></span><div><h2>Linked providers</h2><p>External identities connected to this account.</p></div></div>
            {providers.isPending ? <Spinner /> : providers.error ? <ErrorNotice error={providers.error} /> : <div className="provider-list">
              {enabledOAuthProviders.map((provider) => {
                const linked = providers.data!.providers.find((item) => item.provider === provider);
                return <div className="provider-row" key={provider}><span className="provider-icon">{provider === "github" ? <Github size={20} /> : <span className="provider-g">G</span>}</span><div><strong>{provider === "github" ? "GitHub" : "Google"}</strong><small>{linked?.providerEmail ?? "Not connected"}</small></div>{linked ? <Badge tone="success">Connected</Badge> : <Button variant="secondary" onClick={() => void link(provider)}>Connect</Button>}</div>;
              })}
            </div>}
          </section>

          <section className="panel settings-panel">
            <div className="form-section-heading"><span className="stat-icon green"><MonitorSmartphone size={19} /></span><div><h2>Active sessions</h2><p>Devices with refresh access.</p></div></div>
            {revoke.error && <ErrorNotice error={revoke.error} />}
            {sessions.isPending ? <Spinner /> : sessions.error ? <ErrorNotice error={sessions.error} /> : <div className="session-list">
              {sessions.data!.sessions.map((session) => <div className="session-row" key={session.id}><span className="device-icon"><ShieldCheck size={19} /></span><div><strong>{session.userAgent}</strong><small>{session.ipAddress} · Last used {new Date(session.lastUsedAt).toLocaleString()}</small></div>{session.current && <Badge tone="accent">Current</Badge>}<Button className="icon-button" variant="ghost" onClick={() => revoke.mutate(session.id)} aria-label="Revoke session" title="Revoke session"><LogOut size={18} /></Button></div>)}
            </div>}
          </section>
        </div>
      </div>
    </>
  );
}
