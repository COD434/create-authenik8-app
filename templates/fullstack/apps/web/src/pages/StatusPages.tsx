import { ArrowLeft, LockKeyhole, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

function StatusPage({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return <main className="status-page"><div className="status-icon">{icon}</div><h1>{title}</h1><p>{message}</p><Link className="button button-primary" to="/"><ArrowLeft size={17} /> Return to dashboard</Link></main>;
}
export const ForbiddenPage = () => <StatusPage icon={<LockKeyhole />} title="Access denied" message="Your account does not have permission to view this area." />;
export const NotFoundPage = () => <StatusPage icon={<SearchX />} title="Page not found" message="The page you requested does not exist." />;
