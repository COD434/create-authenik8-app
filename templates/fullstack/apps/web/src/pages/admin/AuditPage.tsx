import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { Button, EmptyState, Spinner } from "@authenik8/ui";
import { adminApi } from "@authenik8/api-client";
import { ErrorNotice, PageHeader } from "../../components/Page";

export function AuditPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["audit", page], queryFn: () => adminApi.audit(page) });
  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;
  return (
    <>
      <PageHeader title="Audit trail" description="Recent privileged workspace actions." action={<Button variant="secondary" onClick={() => query.refetch()}><RefreshCw size={17} /> Refresh</Button>} />
      <section className="panel">
        {query.isPending ? <div className="panel-loading"><Spinner /></div> : query.error ? <ErrorNotice error={query.error} /> : query.data!.items.length === 0 ? <EmptyState icon={<Activity />} title="No audit events">Administrative changes will appear here.</EmptyState> : <>
          <div className="table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Time</th></tr></thead><tbody>
            {query.data!.items.map((event) => <tr key={event.id}><td><code>{event.action}</code></td><td>{event.actorEmail ?? "System"}</td><td>{event.targetType}{event.targetId ? ` / ${event.targetId.slice(0, 8)}` : ""}</td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}
          </tbody></table></div>
          {totalPages > 1 && <nav className="pagination" aria-label="Audit event pages"><span>Page {page} of {totalPages}</span><div className="action-row"><Button variant="secondary" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><Button variant="secondary" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></nav>}
        </>}
      </section>
    </>
  );
}
