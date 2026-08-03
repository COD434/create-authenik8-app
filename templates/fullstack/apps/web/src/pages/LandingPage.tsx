import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

export function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Public navigation">
        <Link className="landing-brand" to="/">
          <img src="/authenik8-logo.svg" alt="" />
          <span>Authenik8 Workspace</span>
        </Link>
        <div className="landing-actions">
          <Link className="button button-secondary" to="/login">Sign in</Link>
          <Link className="button button-primary" to="/register">Create account</Link>
        </div>
      </nav>
      <section className="landing-hero">
        <span className="security-mark"><ShieldCheck size={16} /> OWNED IDENTITY</span>
        <h1>Build the product. Keep control of every identity boundary.</h1>
        <p>
          A reference workspace with secure sessions, account controls,
          administrator policy, audit history, and owned project data.
        </p>
        <div className="landing-cta">
          <Link className="button button-primary" to="/register">
            Start securely <ArrowRight size={17} />
          </Link>
          <Link className="button button-secondary" to="/login">
            <LockKeyhole size={17} /> Open workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
