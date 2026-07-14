import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Spinner } from "@authenik8/ui";
import { authApi } from "@authenik8/api-client";
import { AuthShell } from "../../components/AuthShell";
import { ErrorNotice, SuccessNotice } from "../../components/Page";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setStatus("error"); setError(new Error("Verification token is missing")); return; }
    authApi.verifyEmail(token).then(() => setStatus("done")).catch((caught) => { setError(caught); setStatus("error"); });
  }, [params]);
  return (
    <AuthShell title="Email verification" subtitle="Confirming your account" footer={<Link to="/login">Continue to sign in</Link>}>
      {status === "loading" && <div className="center-status"><Spinner label="Verifying email" /></div>}
      {status === "done" && <SuccessNotice>Your email address is verified.</SuccessNotice>}
      {status === "error" && <ErrorNotice error={error} />}
    </AuthShell>
  );
}
