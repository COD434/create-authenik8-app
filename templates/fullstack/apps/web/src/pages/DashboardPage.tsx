import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, CheckCircle2, FolderKanban, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, EmptyState, Spinner } from "@authenik8/ui";
import { accountApi, healthApi, projectApi } from "@authenik8/api-client";
import { PageHeader, ErrorNotice } from "../components/Page";
import { useAuth } from "../auth/AuthProvider";

export function DashboardPage() {
  const { user } = useAuth();
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectApi.list });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: accountApi.sessions });
  const health = useQuery({ queryKey: ["health"], queryFn: healthApi.status, refetchInterval: 60_000 });

  return (
    <>
      <PageHeader title={`Good to see you, ${user?.name.split(" ")[0]}`} description="Your workspace and identity services at a glance." />
      <div className="stat-grid">
        <Card className="stat-card"><span className="stat-icon cyan"><FolderKanban size={19} /></span><div><span>Projects</span><strong>{projects.data?.projects.length ?? "-"}</strong></div></Card>
        <Card className="stat-card"><span className="stat-icon violet"><MonitorSmartphone size={19} /></span><div><span>Active sessions</span><strong>{sessions.data?.sessions.length ?? "-"}</strong></div></Card>
        <Card className="stat-card"><span className="stat-icon green"><ShieldCheck size={19} /></span><div><span>Email security</span><strong>{user?.verified ? "Verified" : "Pending"}</strong></div></Card>
        <Card className="stat-card"><span className="stat-icon amber"><Activity size={19} /></span><div><span>API status</span><strong>{health.data?.status ?? "Checking"}</strong></div></Card>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Recent projects</h2><p>Latest workspace activity</p></div><Link className="text-link" to="/projects">View all <ArrowRight size={15} /></Link></div>
          {projects.isPending ? <div className="panel-loading"><Spinner /></div> : projects.error ? <ErrorNotice error={projects.error} /> : projects.data!.projects.length === 0 ? (
            <EmptyState icon={<FolderKanban />} title="No projects yet" action={<Link className="button button-primary" to="/projects/new">Create project</Link>}>Create the first owned resource in this workspace.</EmptyState>
          ) : (
            <div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Updated</th></tr></thead><tbody>
              {projects.data!.projects.slice(0, 5).map((project) => <tr key={project.id}><td><Link className="table-link" to={`/projects/${project.id}`}>{project.name}</Link></td><td><Badge tone={project.status === "ACTIVE" ? "success" : project.status === "ARCHIVED" ? "neutral" : "warning"}>{project.status}</Badge></td><td>{new Date(project.updatedAt).toLocaleDateString()}</td></tr>)}
            </tbody></table></div>
          )}
        </section>
        <aside className="panel security-panel">
          <div className="panel-heading"><div><h2>Security posture</h2><p>Account checks</p></div></div>
          <ul className="check-list">
            <li><CheckCircle2 /><span><strong>Rotating session</strong><small>Refresh cookie protected</small></span></li>
            <li className={user?.verified ? "" : "pending"}><CheckCircle2 /><span><strong>Email verification</strong><small>{user?.verified ? "Identity confirmed" : "Action required"}</small></span></li>
            <li><CheckCircle2 /><span><strong>API authorization</strong><small>Role and owner policies active</small></span></li>
          </ul>
          <Link className="button button-secondary full-width" to="/settings/security">Review account security</Link>
        </aside>
      </div>
    </>
  );
}
