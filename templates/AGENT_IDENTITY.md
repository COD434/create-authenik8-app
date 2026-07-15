# Agent and service identity

Authenik8 separates human access tokens from AI agents, workers, bots, and
machine-to-machine callers. Agent tokens use a distinct token type, exact
`resource:action` scopes, an actor chain, and Redis-backed sessions.

## Enable a development registry

Agent identity is disabled when `AUTHENIK8_AGENTS` is empty or `{}`. For local
development, map each agent ID to its maximum grant:

```dotenv
AUTHENIK8_AGENTS='{"build-worker":["tasks:read","tasks:write"]}'
```

The generated configuration validates the IDs and scopes before startup. For
production, replace this static environment registry with a database-backed
`resolveAgent` callback so deactivation and scope removal take effect without a
deployment.

## Issue an M2M token from a trusted exchange

`issueToken` is a privileged SDK operation, not an authentication endpoint.
Call it only after authenticating the workload using a mechanism appropriate to
your infrastructure, such as mTLS, a cloud workload identity, or a signed client
assertion. Do not expose it as an unauthenticated HTTP route.

```ts
const agent = auth.agent;
if (!agent) throw new Error("Agent identity is not configured");

const token = await agent.issueToken({
  agentId: "build-worker",
  scopes: ["tasks:read"],
  label: "production queue worker",
  ip: request.ip,
});
```

Requested scopes must be an exact subset of the registry grant. Tokens are
short-lived and stored under a separate `agent-sessions:<agentId>` namespace.
Human middleware rejects them.

## Protect an agent route

```ts
import type { AgentAuthenticatedRequest } from "authenik8-core";

router.post(
  "/internal/tasks",
  auth.agent!.requireScopes("tasks:write"),
  (req, res) => {
    const actor = (req as AgentAuthenticatedRequest).agent;
    res.json({ accepted: true, actor: actor.agentId });
  },
);
```

Every required scope must be present. Scope matching is exact; wildcard scope
expansion is intentionally not inferred.

## Delegate a human action to an agent

Delegation is disabled unless the application supplies `authorizeDelegation`.
The callback should check the user, tenant, requested operation, consent, and
any application permission model.

```ts
const auth = await createAuthenik8({
  // jwt, Redis, and refresh configuration omitted
  agent: {
    resolveAgent: async (agentId) => agentRepository.findActive(agentId),
    authorizeDelegation: async ({ user, agent, requestedScopes }) =>
      user.role === "admin" &&
      agent.agentId === "build-worker" &&
      requestedScopes.every((scope) => scope === "tasks:read"),
  },
});

const delegated = await auth.agent!.issueDelegatedToken({
  agentId: "build-worker",
  userAccessToken,
  scopes: ["tasks:read"],
});
```

The token identifies the user as the subject and the agent as the acting party.
Its `actorChain` records both actors. Revoking the originating human session
immediately invalidates the delegated token.

## Revoke agent access

```ts
await auth.agent!.revokeSession("build-worker", sessionId); // one workload session
await auth.agent!.revokeAgent("build-worker");              // all sessions + issuance block
await auth.agent!.activateAgent("build-worker");            // clear the core revocation block
```

The external registry must still report the agent as active. Removing an agent
or reducing its scopes in that registry also invalidates existing tokens during
verification.

## Security boundaries

- Agent tokens are bearer credentials; protect them in memory and transport.
- Never place agent tokens in browser storage, URLs, logs, or source control.
- Keep token lifetimes short and re-authenticate the workload to obtain another.
- Public JWKS verification proves the signature but cannot by itself observe
  Redis revocation. Security-sensitive APIs should use the session-aware SDK
  middleware or a trusted introspection boundary.
- A delegated token never outlives the authority of its originating human
  session.
