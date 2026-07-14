import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Save, UserRound } from "lucide-react";
import { Button, Input } from "@authenik8/ui";
import { accountApi } from "@authenik8/api-client";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorNotice, Field, PageHeader, SuccessNotice } from "../../components/Page";

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: () => accountApi.updateProfile({ name }),
    onSuccess: ({ user: updated }) => { setUser(updated); setSaved(true); },
  });
  function submit(event: FormEvent) { event.preventDefault(); setSaved(false); mutation.mutate(); }
  return (
    <>
      <PageHeader title="Profile" description="Personal details used across your workspace." />
      <div className="settings-layout">
        <nav className="settings-nav"><a className="active" href="/settings/profile">Profile</a><a href="/settings/security">Security</a></nav>
        <form className="form-panel" onSubmit={submit}>
          <div className="form-section-heading"><span className="stat-icon cyan"><UserRound size={19} /></span><div><h2>Personal information</h2><p>Keep your workspace identity current.</p></div></div>
          {mutation.error && <ErrorNotice error={mutation.error} />}
          {saved && <SuccessNotice>Profile saved.</SuccessNotice>}
          <Field label="Full name" htmlFor="name"><Input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Email address" htmlFor="email"><Input id="email" type="email" value={user?.email ?? ""} disabled /></Field>
          <div className="form-actions"><Button type="submit" disabled={mutation.isPending}><Save size={17} /> {mutation.isPending ? "Saving..." : "Save changes"}</Button></div>
        </form>
      </div>
    </>
  );
}
