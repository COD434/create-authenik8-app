import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { registerSchema, type RegisterInput } from "@authenik8/contracts";
import { ApiError, authApi } from "@authenik8/api-client";
import { Button, Input } from "@authenik8/ui";
import { AuthShell } from "../../components/AuthShell";
import { ErrorNotice, Field, SuccessNotice } from "../../components/Page";

type RegistrationField = keyof RegisterInput;
type RegistrationErrors = Partial<Record<RegistrationField, string>>;

function validationErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): RegistrationErrors {
  const fields: RegistrationErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "name" || field === "email" || field === "password") && !fields[field]) {
      fields[field] = issue.message;
    }
  }
  return fields;
}

export function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<RegistrationErrors>({});
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<{ message: string; devVerificationToken?: string }>();
  const [pending, setPending] = useState(false);

  function update(field: RegistrationField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);

    const validation = registerSchema.safeParse(form);
    if (!validation.success) {
      setFieldErrors(validationErrors(validation.error));
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      setResult(await authApi.register(validation.data));
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields) {
        setFieldErrors(Object.fromEntries(
          Object.entries(caught.fields)
            .filter(([field]) => field === "name" || field === "email" || field === "password")
            .map(([field, messages]) => [field, messages[0]]),
        ));
      }
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start with a secure workspace" footer={<>Already registered? <Link to="/login">Sign in</Link></>}>
      {error !== undefined && <ErrorNotice error={error} />}
      {result ? (
        <SuccessNotice>{result.message}{result.devVerificationToken && <> Development token: <code>{result.devVerificationToken}</code></>}</SuccessNotice>
      ) : (
        <form className="form-stack" onSubmit={submit} noValidate>
          <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
            <Input id="name" autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(fieldErrors.name)} required />
          </Field>
          <Field label="Email address" htmlFor="email" error={fieldErrors.email}>
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} aria-invalid={Boolean(fieldErrors.email)} required />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldErrors.password}>
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update("password", event.target.value)} aria-invalid={Boolean(fieldErrors.password)} required />
          </Field>
          <p className="field-hint">Use 10 or more characters with uppercase, lowercase, and a number.</p>
          <Button type="submit" disabled={pending}><UserPlus size={17} /> {pending ? "Creating..." : "Create account"}</Button>
        </form>
      )}
    </AuthShell>
  );
}
