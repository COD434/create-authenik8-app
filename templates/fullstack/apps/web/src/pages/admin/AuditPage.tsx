import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { Button, EmptyState, Spinner } from "@authenik8/ui";
import { adminApi } from "@authenik8/api-client";
import { ErrorNotice, PageHeader } from "../../components/Page";

export function AuditPage() {
  const query = useQuery({ queryKey: ["audit"], queryFn: adminApi.audit });
  return (
    <>
      <PageHeader title="Audit trail" description="Recent privileged workspace actions." action={<Button variant="secondary" onClick={() => query.refetch()}><RefreshCw size={17} /> Refresh</Button>} />
      <section className="panel">
        {query.isPending ? <div className="panel-loading"><Spinner /></div> : query.error ? <ErrorNotice error={query.error} /> : query.data!.events.length === 0 ? <EmptyState icon={<Activity />} title="No audit events">Administrative changes will appear here.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Time</th></tr></thead><tbody>
          {query.data!.events.map((event) => <tr key={event.id}><td><code>{event.action}</code></td><td>{event.actorEmail ?? "System"}</td><td>{event.targetType}{event.targetId ? ` / ${event.targetId.slice(0, 8)}` : ""}</td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}
        </tbody></table></div>}
      </section>
    </>
  );
}
