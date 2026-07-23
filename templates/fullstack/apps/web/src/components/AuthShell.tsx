import type { ReactNode } from "react";
<<<<<<< HEAD
import { Card } from "@astryxdesign/core/Card";
=======
>>>>>>> main
import { Link } from "react-router-dom";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
<<<<<<< HEAD
        <Link className="auth-top-brand" to="/"><img src="/authenik8-logo.svg" alt="" /><span>Authenik8 <small>Workspace</small></span></Link>
=======
        <Link className="brand" to="/"><img src="/authenik8-logo.svg" alt="" /><span>Authenik8 <small>Workspace</small></span></Link>
>>>>>>> main
        <div className="auth-brand-copy">
          <img className="auth-logo" src="/authenik8-logo.svg" alt="Authenik8" />
          <span className="security-mark">A8 / IDENTITY</span>
          <h1>Secure product foundations, already connected.</h1>
          <p>One application boundary from browser session to owned data.</p>
        </div>
        <div className="auth-signal"><span className="signal-dot" /> Identity services operational</div>
      </section>
      <section className="auth-form-panel">
<<<<<<< HEAD
        <Card padding={0} className="auth-form-card">
          <div className="auth-form-wrap">
            <header><h2>{title}</h2><p>{subtitle}</p></header>
            {children}
            <footer>{footer}</footer>
          </div>
        </Card>
=======
        <div className="auth-form-wrap">
          <header><h2>{title}</h2><p>{subtitle}</p></header>
          {children}
          <footer>{footer}</footer>
        </div>
>>>>>>> main
      </section>
    </main>
  );
}
