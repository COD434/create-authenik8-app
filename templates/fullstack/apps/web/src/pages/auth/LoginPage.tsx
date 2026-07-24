import {
  useState,
  type ComponentProps,
  type ComponentType,
  type FormEvent,
  type InputHTMLAttributes,
} from "react";
import { Github, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "../../components/AuthShell";
import { getErrorMessage } from "../../components/Page";
import { useAuth } from "../../auth/AuthProvider";
import { enabledOAuthProviders } from "../../auth/providers";

type CredentialInputProps = ComponentProps<typeof TextInput> &
  Pick<InputHTMLAttributes<HTMLInputElement>, "autoComplete">;

// Astryx 0.1.7 forwards native input attributes at runtime but does not yet
// declare autoComplete. Keep that browser and password-manager contract here.
const CredentialInput = TextInput as ComponentType<CredentialInputProps>;

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
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace"
      footer={<>New to Authenik8? <Link to="/register">Create an account</Link></>}
    >
      {params.has("oauthError") && (
        <Banner
          className="login-alert"
          status="error"
          title="OAuth sign-in failed"
          description="The provider could not complete sign-in. Please try again."
        />
      )}
      {error !== undefined && (
        <Banner
          className="login-alert"
          status="error"
          title="Unable to sign in"
          description={getErrorMessage(error)}
        />
      )}
      <form className="form-stack login-form" onSubmit={submit}>
        <CredentialInput
          label="Email address"
          type="email"
          htmlName="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          startIcon={<Mail size={17} />}
          size="lg"
          width="100%"
          isRequired
        />
        <CredentialInput
          label="Password"
          type="password"
          htmlName="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          startIcon={<LockKeyhole size={17} />}
          size="lg"
          width="100%"
          isRequired
        />
        <div className="login-recovery"><Link to="/forgot-password">Forgot password?</Link></div>
        <Button
          type="submit"
          label="Sign in"
          variant="primary"
          icon={<KeyRound size={17} />}
          width="100%"
          isLoading={pending}
          isDisabled={pending}
        />
      </form>
      {enabledOAuthProviders.length > 0 && (
        <>
          <div className="divider"><span>or continue with</span></div>
          <div className="oauth-grid">
            {enabledOAuthProviders.map((provider) => (
              <Button
                key={provider}
                label={provider === "google" ? "Google" : "GitHub"}
                variant="secondary"
                width="100%"
                icon={provider === "google" ? <span className="provider-g">G</span> : <Github size={18} />}
                onClick={() => window.location.assign(`/api/auth/oauth/${provider}`)}
              />
            ))}
          </div>
        </>
      )}
    </AuthShell>
  );
}
