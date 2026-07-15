import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spinner } from "@authenik8/ui";
import { useAuth } from "../../auth/AuthProvider";
import { AuthShell } from "../../components/AuthShell";
import { ErrorNotice } from "../../components/Page";

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuth } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    if (!code) { setError(new Error("OAuth exchange code is missing")); return; }
    completeOAuth(code).then(() => navigate("/", { replace: true })).catch(setError);
  }, [completeOAuth, navigate, params]);
  return (
    <AuthShell title="Completing sign in" subtitle="Securing your new session" footer={<span />}>
      {error ? <ErrorNotice error={error} /> : <div className="center-status"><Spinner label="Completing OAuth sign in" /></div>}
    </AuthShell>
  );
}
