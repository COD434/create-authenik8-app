import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, RefreshCw, Users } from "lucide-react";
import { Badge, Button, EmptyState, Spinner } from "@authenik8/ui";
import { adminApi } from "@authenik8/api-client";
import type { Role, UserStatus } from "@authenik8/contracts";
import { ErrorNotice, PageHeader } from "../../components/Page";

export function UsersPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["admin-users"], queryFn: () => adminApi.users() });
  const update = useMutation({ mutationFn: ({ id, role, status }: { id: string; role?: Role; status?: UserStatus }) => adminApi.updateUser(id, { role, status }), onSuccess: () => client.invalidateQueries({ queryKey: ["admin-users"] }) });
  const revoke = useMutation({ mutationFn: adminApi.revokeSessions });
  return (
    <>
      <PageHeader title="Users" description="Roles, account status, and session control." action={<Button variant="secondary" onClick={() => query.refetch()}><RefreshCw size={17} /> Refresh</Button>} />
      {(query.error || update.error || revoke.error) && <ErrorNotice error={query.error ?? update.error ?? revoke.error} />}
      <section className="panel">
        {query.isPending ? <div className="panel-loading"><Spinner /></div> : query.data!.items.length === 0 ? <EmptyState icon={<Users />} title="No users">Registered users will appear here.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Verified</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {query.data!.items.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small className="table-subtitle">{user.email}</small></td><td><select className="table-select" value={user.role} onChange={(event) => update.mutate({ id: user.id, role: event.target.value as Role })}><option value="USER">User</option><option value="ADMIN">Admin</option></select></td><td><select className="table-select" value={user.status} onChange={(event) => update.mutate({ id: user.id, status: event.target.value as UserStatus })}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></td><td><Badge tone={user.verified ? "success" : "warning"}>{user.verified ? "Verified" : "Pending"}</Badge></td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td><Button className="icon-button" variant="ghost" onClick={() => revoke.mutate(user.id)} aria-label={`Revoke sessions for ${user.name}`} title="Revoke all sessions"><MoreHorizontal size={18} /></Button></td></tr>)}
        </tbody></table></div>}
      </section>
    </>
  );
}
