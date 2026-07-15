import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit3, FolderKanban, Plus, Save, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, EmptyState, Input, Spinner } from "@authenik8/ui";
import { projectApi } from "@authenik8/api-client";
import type { ProjectStatus } from "@authenik8/contracts";
import { ErrorNotice, Field, PageHeader } from "../../components/Page";

export function ProjectsPage() {
  const query = useQuery({ queryKey: ["projects"], queryFn: projectApi.list });
  return (
    <>
      <PageHeader title="Projects" description="Owned work in this workspace." action={<Link className="button button-primary" to="/projects/new"><Plus size={17} /> New project</Link>} />
      <section className="panel">
        {query.isPending ? <div className="panel-loading"><Spinner /></div> : query.error ? <ErrorNotice error={query.error} /> : query.data!.projects.length === 0 ? (
          <EmptyState icon={<FolderKanban />} title="No projects found" action={<Link className="button button-primary" to="/projects/new">Create project</Link>}>Projects you create will appear here.</EmptyState>
        ) : <div className="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Created</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {query.data!.projects.map((project) => <tr key={project.id}><td><Link className="table-link" to={`/projects/${project.id}`}>{project.name}</Link><small className="table-subtitle">{project.description || "No description"}</small></td><td><Badge tone={project.status === "ACTIVE" ? "success" : project.status === "ARCHIVED" ? "neutral" : "warning"}>{project.status}</Badge></td><td>{formatDate(project.createdAt)}</td><td>{formatDate(project.updatedAt)}</td><td><Link className="icon-link" to={`/projects/${project.id}/edit`} aria-label={`Edit ${project.name}`} title="Edit project"><Edit3 size={17} /></Link></td></tr>)}
        </tbody></table></div>}
      </section>
    </>
  );
}

export function ProjectFormPage() {
  const { id } = useParams();
  const edit = Boolean(id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const project = useQuery({ queryKey: ["project", id], queryFn: () => projectApi.get(id!), enabled: edit });
  const [form, setForm] = useState<{ name: string; description: string; status: ProjectStatus }>({ name: "", description: "", status: "DRAFT" });
  useEffect(() => { if (project.data) setForm(project.data.project); }, [project.data]);
  const mutation = useMutation({
    mutationFn: () => edit ? projectApi.update(id!, form) : projectApi.create(form),
    onSuccess: async ({ project: saved }) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${saved.id}`);
    },
  });
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  if (edit && project.isPending) return <div className="screen-loader"><Spinner /></div>;
  return (
    <>
      <PageHeader title={edit ? "Edit project" : "Create project"} description="Define the project details and lifecycle state." />
      <form className="form-panel" onSubmit={submit}>
        {mutation.error && <ErrorNotice error={mutation.error} />}
        <Field label="Project name" htmlFor="project-name"><Input id="project-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required /></Field>
        <Field label="Description" htmlFor="description"><textarea id="description" className="input textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={2000} rows={6} /></Field>
        <Field label="Status" htmlFor="status"><select id="status" className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProjectStatus })}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></Field>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save size={17} /> {mutation.isPending ? "Saving..." : "Save project"}</Button></div>
      </form>
    </>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["project", id], queryFn: () => projectApi.get(id!) });
  const remove = useMutation({ mutationFn: () => projectApi.remove(id!), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["projects"] }); navigate("/projects"); } });
  if (query.isPending) return <div className="screen-loader"><Spinner /></div>;
  if (query.error) return <ErrorNotice error={query.error} />;
  const project = query.data!.project;
  return (
    <>
      <Link className="back-link" to="/projects"><ArrowLeft size={15} /> Projects</Link>
      <PageHeader title={project.name} description={`Created ${formatDate(project.createdAt)}`} action={<div className="action-row"><Link className="button button-secondary" to={`/projects/${project.id}/edit`}><Edit3 size={17} /> Edit</Link><Button variant="danger" onClick={() => { if (window.confirm("Delete this project permanently?")) remove.mutate(); }}><Trash2 size={17} /> Delete</Button></div>} />
      {remove.error && <ErrorNotice error={remove.error} />}
      <section className="detail-grid">
        <div className="detail-main"><p className="detail-label">Description</p><p>{project.description || "No description has been added."}</p></div>
        <dl className="detail-meta"><div><dt>Status</dt><dd><Badge tone={project.status === "ACTIVE" ? "success" : "neutral"}>{project.status}</Badge></dd></div><div><dt>Last updated</dt><dd>{formatDate(project.updatedAt)}</dd></div><div><dt>Owner ID</dt><dd><code>{project.ownerId}</code></dd></div></dl>
      </section>
    </>
  );
}

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
