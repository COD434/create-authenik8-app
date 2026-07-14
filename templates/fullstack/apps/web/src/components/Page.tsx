import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ApiError } from "@authenik8/api-client";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const fieldMessage = error instanceof ApiError
    ? Object.values(error.fields ?? {}).flat()[0]
    : undefined;
  const message = error instanceof ApiError
    ? fieldMessage ?? error.message
    : "Something went wrong. Try again.";
  return <div className="notice notice-error" role="alert"><AlertTriangle size={17} /><span>{message}</span></div>;
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return <div className="notice notice-success" role="status"><CheckCircle2 size={17} /><span>{children}</span></div>;
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return <label className="field" htmlFor={htmlFor}><span>{label}</span>{children}{error && <small>{error}</small>}</label>;
}
