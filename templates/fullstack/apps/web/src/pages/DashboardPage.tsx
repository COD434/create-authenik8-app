<<<<<<< HEAD
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  MonitorSmartphone,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, Spinner } from "@authenik8/ui";
import { accountApi, healthApi, projectApi } from "@authenik8/api-client";
import { ErrorNotice } from "../components/Page";
=======
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, CheckCircle2, FolderKanban, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, EmptyState, Spinner } from "@authenik8/ui";
import { accountApi, healthApi, projectApi } from "@authenik8/api-client";
import { PageHeader, ErrorNotice } from "../components/Page";
>>>>>>> main
import { useAuth } from "../auth/AuthProvider";

export function DashboardPage() {
  const { user } = useAuth();
<<<<<<< HEAD
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectApi.list });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: accountApi.sessions });
  const health = useQuery({ queryKey: ["health"], queryFn: healthApi.status, refetchInterval: 60_000 });
  const firstName = user?.name.trim().split(/\s+/)[0] || "there";
  const projectCount = projects.data?.projects.length;
  const sessionCount = sessions.data?.sessions.length;
  const healthLabel = health.isPending
    ? "Checking"
    : health.isError
      ? "Unavailable"
      : health.data?.status ?? "Unknown";

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <StatusDot
              variant={health.isError ? "error" : health.isPending ? "warning" : "success"}
              label={`API status: ${healthLabel}`}
              isPulsing={health.isPending}
            />
            <span>Protected workspace</span>
          </div>
          <h1>Good to see you, {firstName}</h1>
          <p>Your projects, active identity sessions, and account security in one place.</p>
        </div>
        <div className="hero-actions">
          <Button
            label="Security settings"
            variant="secondary"
            onClick={() => navigate("/settings/security")}
          />
          <Button
            label="New project"
            variant="primary"
            icon={<Plus size={17} />}
            onClick={() => navigate("/projects/new")}
          />
        </div>
      </header>

      <div className="stat-grid">
        <MetricCard
          icon={<FolderKanban size={20} />}
          tone="cyan"
          label="Projects"
          value={projectCount ?? "-"}
          detail={projectCount === 1 ? "Owned resource" : "Owned resources"}
        />
        <MetricCard
          icon={<MonitorSmartphone size={20} />}
          tone="violet"
          label="Active sessions"
          value={sessionCount ?? "-"}
          detail="Across your devices"
        />
        <MetricCard
          icon={<ShieldCheck size={20} />}
          tone="green"
          label="Email security"
          value={user?.verified ? "Verified" : "Pending"}
          detail={user?.verified ? "Identity confirmed" : "Action required"}
        />
        <MetricCard
          icon={<Activity size={20} />}
          tone="amber"
          label="API status"
          value={healthLabel}
          detail="Checked every minute"
        />
      </div>

      <div className="dashboard-grid">
        <Card padding={0} className="dashboard-panel">
          <div className="panel-heading">
            <div><h2>Recent projects</h2><p>Your latest workspace activity</p></div>
            <Link className="text-link" to="/projects">View all <ArrowRight size={15} /></Link>
          </div>
          {projects.isPending ? (
            <div className="panel-loading"><Spinner /></div>
          ) : projects.error ? (
            <div className="panel-error"><ErrorNotice error={projects.error} /></div>
          ) : projects.data!.projects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban />}
              title="No projects yet"
              action={<Link className="button button-primary" to="/projects/new">Create project</Link>}
            >
              Create the first owned resource in this workspace.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Recently updated projects</caption>
                <thead><tr><th>Name</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {projects.data!.projects.slice(0, 5).map((project) => (
                    <tr key={project.id}>
                      <td><Link className="table-link" to={`/projects/${project.id}`}>{project.name}</Link></td>
                      <td><Badge variant={projectStatusVariant(project.status)} label={formatLabel(project.status)} /></td>
                      <td>{new Date(project.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding={0} className="dashboard-panel security-panel">
          <div className="panel-heading">
            <div><h2>Security posture</h2><p>Live account checks</p></div>
            <Badge variant={user?.verified ? "success" : "warning"} label={user?.verified ? "Protected" : "Review"} />
          </div>
=======
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
>>>>>>> main
          <ul className="check-list">
            <li><CheckCircle2 /><span><strong>Rotating session</strong><small>Refresh cookie protected</small></span></li>
            <li className={user?.verified ? "" : "pending"}><CheckCircle2 /><span><strong>Email verification</strong><small>{user?.verified ? "Identity confirmed" : "Action required"}</small></span></li>
            <li><CheckCircle2 /><span><strong>API authorization</strong><small>Role and owner policies active</small></span></li>
          </ul>
<<<<<<< HEAD
          <div className="security-action">
            <Button
              label="Review account security"
              variant="secondary"
              width="100%"
              onClick={() => navigate("/settings/security")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: ReactNode;
  tone: "cyan" | "violet" | "green" | "amber";
  label: string;
  value: string | number;
  detail: string;
}

function MetricCard({ icon, tone, label, value, detail }: MetricCardProps) {
  return (
    <Card padding={0} className="stat-card">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </Card>
  );
}

function projectStatusVariant(status: string): "success" | "neutral" | "warning" {
  if (status === "ACTIVE") return "success";
  if (status === "ARCHIVED") return "neutral";
  return "warning";
}

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
=======
          <Link className="button button-secondary full-width" to="/settings/security">Review account security</Link>
        </aside>
      </div>
    </>
  );
}
>>>>>>> main
