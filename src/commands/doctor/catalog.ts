export type DiagnosticDefinition = {
  id: string;
  legacyId: string;
  title: string;
  summary: string;
  impact: string;
  remediation: string;
  verify: string;
  prerequisites?: readonly string[];
};

const definitions = [
  {
    id: "A8-RUNTIME-001",
    legacyId: "runtime.node",
    title: "Node.js runtime",
    summary: "Checks that the active Node.js release is supported by the generated project and identity engine.",
    impact: "Unsupported runtimes can fail during installation, cryptographic operations, or application startup.",
    remediation: "Use Node.js 20.19+, 22.12+, or 24+.",
    verify: "node --version && npx create-authenik8-app@latest doctor --check A8-RUNTIME-001",
  },
  {
    id: "A8-PROJECT-001",
    legacyId: "project.files",
    title: "Project structure",
    summary: "Checks that security-significant generated files are still present.",
    impact: "Missing entrypoints, threat models, or schema files can leave the generated boundary incomplete.",
    remediation: "Restore missing files from source control or regenerate the project before changing authentication code.",
    verify: "npx create-authenik8-app@latest doctor --check A8-PROJECT-001",
  },
  {
    id: "A8-PROJECT-002",
    legacyId: "project.manifest",
    title: "Project manifest",
    summary: "Compares authenik8.json with the detected application architecture.",
    impact: "Manifest drift makes version-aware diagnostics and upgrades unreliable.",
    remediation: "Review intentional architecture changes and update authenik8.json in the same audited change.",
    verify: "npx create-authenik8-app@latest doctor --check A8-PROJECT-002",
    prerequisites: ["A8-PROJECT-001"],
  },
  {
    id: "A8-PROJECT-003",
    legacyId: "project.scripts",
    title: "Project scripts",
    summary: "Checks the generated development, build, and migration command surface.",
    impact: "Missing scripts can bypass required generation or migration steps.",
    remediation: "Restore the generated package.json scripts from source control.",
    verify: "npx create-authenik8-app@latest doctor --check A8-PROJECT-003",
    prerequisites: ["A8-PROJECT-001"],
  },
  {
    id: "A8-CORE-001",
    legacyId: "dependency.core",
    title: "Identity engine dependency",
    summary: "Checks the declared and installed authenik8-core release.",
    impact: "A missing or drifted engine means generated code is running against an unreviewed contract.",
    remediation: "Restore the lockfile installation and use an exact authenik8-core version.",
    verify: "npx create-authenik8-app@latest doctor --check A8-CORE-001",
    prerequisites: ["A8-PROJECT-001"],
  },
  {
    id: "A8-ENV-001",
    legacyId: "security.env",
    title: "Secret-file safety",
    summary: "Checks that .env is ignored, untracked, and that examples do not contain private signing material.",
    impact: "Committed environment files can expose signing keys, refresh secrets, and provider credentials.",
    remediation: "Ignore .env, remove tracked secret files, and rotate anything that may have been exposed.",
    verify: "git status --short && npx create-authenik8-app@latest doctor --check A8-ENV-001",
    prerequisites: ["A8-PROJECT-001"],
  },
  {
    id: "A8-ENV-002",
    legacyId: "environment.syntax",
    title: "Environment syntax",
    summary: "Checks that the selected environment source can be parsed without exposing its values.",
    impact: "Invalid dotenv syntax prevents deterministic startup and can silently omit security settings.",
    remediation: "Fix the dotenv syntax without printing or committing secret values.",
    verify: "npx create-authenik8-app@latest doctor --check A8-ENV-002",
    prerequisites: ["A8-PROJECT-001"],
  },
  {
    id: "A8-ENV-003",
    legacyId: "security.env.permissions",
    title: "Environment permissions",
    summary: "Checks that a generated private environment file is not readable by group or other users.",
    impact: "Overly broad local permissions can expose private JWK and refresh-token material.",
    remediation: "Restrict .env to the owning user with mode 0600.",
    verify: "npx create-authenik8-app@latest doctor --check A8-ENV-003",
    prerequisites: ["A8-ENV-001"],
  },
  {
    id: "A8-JWK-006",
    legacyId: "auth.signing",
    title: "Signing key ring",
    summary: "Validates the ES256 P-256 key ring, key identifiers, and active private key.",
    impact: "Invalid or ephemeral signing keys make tokens unverifiable or invalidate sessions after restart.",
    remediation: "Restore the persisted private key ring or perform a deliberate documented rotation.",
    verify: "npx create-authenik8-app@latest doctor --check A8-JWK-006",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-JWT-001",
    legacyId: "auth.claims",
    title: "Token claims",
    summary: "Checks the configured token issuer and audience.",
    impact: "Missing or unstable claims weaken service boundaries and cause verification failures.",
    remediation: "Set stable AUTHENIK8_ISSUER and AUTHENIK8_AUDIENCE values.",
    verify: "npx create-authenik8-app@latest doctor --check A8-JWT-001",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-REFRESH-001",
    legacyId: "auth.refresh",
    title: "Refresh-token secret",
    summary: "Checks that refresh-token signing material meets the engine minimum.",
    impact: "Weak or missing refresh-token material prevents secure rotation.",
    remediation: "Generate a high-entropy secret of at least 32 bytes and keep it outside source control.",
    verify: "npx create-authenik8-app@latest doctor --check A8-REFRESH-001",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-AGENT-001",
    legacyId: "auth.agents",
    title: "Agent identity",
    summary: "Validates the optional agent registry and exact scope syntax.",
    impact: "Malformed or overly broad machine grants can create an unsafe service-identity boundary.",
    remediation: "Use {} to disable agents or map validated identifiers to least-privilege resource:action scopes.",
    verify: "npx create-authenik8-app@latest doctor --check A8-AGENT-001",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-RUNTIME-002",
    legacyId: "environment.port",
    title: "Application port",
    summary: "Checks that PORT is a valid TCP port.",
    impact: "Invalid port configuration prevents deterministic startup.",
    remediation: "Set PORT to an available integer from 1 to 65535.",
    verify: "npx create-authenik8-app@latest doctor --check A8-RUNTIME-002",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-HTTP-001",
    legacyId: "environment.origin",
    title: "Web origin",
    summary: "Checks the browser origin used by the fullstack CORS and cookie boundary.",
    impact: "An invalid or overly broad origin can break sign-in or expose authenticated requests.",
    remediation: "Set WEB_ORIGIN to the one exact HTTP(S) browser origin.",
    verify: "npx create-authenik8-app@latest doctor --check A8-HTTP-001",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-REDIS-001",
    legacyId: "environment.redis",
    title: "Redis configuration",
    summary: "Validates the selected in-process or external Redis configuration.",
    impact: "Invalid Redis configuration disables refresh rotation, revocation, OAuth state, and rate limiting.",
    remediation: "Use memory:// only for local development, or configure a valid private redis:// or rediss:// endpoint.",
    verify: "npx create-authenik8-app@latest doctor --check A8-REDIS-001",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-REDIS-002",
    legacyId: "service.redis",
    title: "Redis capabilities",
    summary: "Checks the configured Redis service or isolated in-process implementation.",
    impact: "A reachable server without the required atomic operations cannot enforce the token lifecycle.",
    remediation: "Restore the configured Redis service and verify atomic string, expiry, lock, and deletion operations.",
    verify: "npx create-authenik8-app@latest doctor --deep --check A8-REDIS-002",
    prerequisites: ["A8-REDIS-001"],
  },
  {
    id: "A8-CORE-002",
    legacyId: "service.core",
    title: "Identity engine runtime",
    summary: "Exercises the installed engine's issue, verify, rotate, replay, concurrency, revocation, and JWKS behavior.",
    impact: "A runtime contract failure means the generated application cannot safely rely on its authentication engine.",
    remediation: "Restore the exact supported authenik8-core installation and rerun deep diagnostics.",
    verify: "npx create-authenik8-app@latest doctor --deep --check A8-CORE-002",
    prerequisites: ["A8-CORE-001", "A8-JWK-006", "A8-REDIS-002"],
  },
  {
    id: "A8-DB-003",
    legacyId: "environment.database",
    title: "Database configuration",
    summary: "Checks that DATABASE_URL matches the generated Prisma provider.",
    impact: "A mismatched database URL prevents identity and application persistence.",
    remediation: "Use a file: URL for SQLite or a postgresql:// URL for PostgreSQL.",
    verify: "npx create-authenik8-app@latest doctor --check A8-DB-003",
    prerequisites: ["A8-ENV-002", "A8-PROJECT-001"],
  },
  {
    id: "A8-OAUTH-001",
    legacyId: "oauth.routes",
    title: "OAuth routes",
    summary: "Checks that an OAuth preset still exposes at least one supported provider.",
    impact: "An OAuth preset without provider routes cannot complete sign-in.",
    remediation: "Restore or add a generated Google or GitHub provider.",
    verify: "npx create-authenik8-app@latest doctor --check A8-OAUTH-001",
    prerequisites: ["A8-PROJECT-001"],
  },
  {
    id: "A8-OAUTH-002",
    legacyId: "oauth.google",
    title: "Google OAuth",
    summary: "Checks Google credentials and the exact generated callback shape.",
    impact: "Placeholder credentials or callback drift prevent OAuth state from completing safely.",
    remediation: "Configure Google credentials and the exact generated redirect URI in both environments.",
    verify: "npx create-authenik8-app@latest doctor --check A8-OAUTH-002",
    prerequisites: ["A8-OAUTH-001", "A8-ENV-002"],
  },
  {
    id: "A8-OAUTH-003",
    legacyId: "oauth.github",
    title: "GitHub OAuth",
    summary: "Checks GitHub credentials and the exact generated callback shape.",
    impact: "Placeholder credentials or callback drift prevent OAuth state from completing safely.",
    remediation: "Configure GitHub credentials and the exact generated redirect URI in both environments.",
    verify: "npx create-authenik8-app@latest doctor --check A8-OAUTH-003",
    prerequisites: ["A8-OAUTH-001", "A8-ENV-002"],
  },
  {
    id: "A8-PROD-001",
    legacyId: "production.runtime",
    title: "Production runtime",
    summary: "Rejects development runtime assumptions in a production diagnostic.",
    impact: "Development configuration can enable local-only services or weaker cookie behavior.",
    remediation: "Set NODE_ENV=production and use the generated production start path.",
    verify: "npx create-authenik8-app@latest doctor --production --check A8-PROD-001",
    prerequisites: ["A8-ENV-002"],
  },
  {
    id: "A8-PROD-002",
    legacyId: "production.redis",
    title: "Production Redis",
    summary: "Requires a non-local external Redis service for production.",
    impact: "In-process or loopback Redis loses distributed revocation and state on restart.",
    remediation: "Configure a private production redis:// or rediss:// endpoint.",
    verify: "npx create-authenik8-app@latest doctor --production --check A8-PROD-002",
    prerequisites: ["A8-REDIS-001"],
  },
  {
    id: "A8-PROD-003",
    legacyId: "production.http",
    title: "Production origins",
    summary: "Requires HTTPS issuer, browser origin, and OAuth callback URLs without wildcards or local hosts.",
    impact: "Insecure or broad production origins expose tokens and authenticated browser requests.",
    remediation: "Use exact HTTPS deployment origins and callback URLs.",
    verify: "npx create-authenik8-app@latest doctor --production --check A8-PROD-003",
    prerequisites: ["A8-JWT-001"],
  },
  {
    id: "A8-PROD-004",
    legacyId: "production.cookies",
    title: "Production cookies",
    summary: "Requires secure refresh cookies in the fullstack production preset.",
    impact: "Refresh cookies sent over plaintext transport can be intercepted.",
    remediation: "Set COOKIE_SECURE=true and terminate only trusted HTTPS traffic.",
    verify: "npx create-authenik8-app@latest doctor --production --check A8-PROD-004",
    prerequisites: ["A8-HTTP-001"],
  },
  {
    id: "A8-PROD-005",
    legacyId: "production.database",
    title: "Production database",
    summary: "Rejects embedded or loopback PostgreSQL in fullstack production diagnostics.",
    impact: "The development database process is not a production availability or backup boundary.",
    remediation: "Use an externally managed PostgreSQL endpoint and set AUTHENIK8_LOCAL_DATABASE=external.",
    verify: "npx create-authenik8-app@latest doctor --production --check A8-PROD-005",
    prerequisites: ["A8-DB-003"],
  },
] as const satisfies readonly DiagnosticDefinition[];

const byLegacyId = new Map<string, DiagnosticDefinition>(definitions.map((definition) => [
  definition.legacyId,
  definition,
]));
const byId = new Map<string, DiagnosticDefinition>(definitions.map((definition) => [
  definition.id,
  definition,
]));

export const diagnosticDefinitions: readonly DiagnosticDefinition[] = definitions;

export function stableDiagnosticId(legacyId: string): string {
  return byLegacyId.get(legacyId)?.id ?? legacyId;
}

export function diagnosticDefinition(id: string): DiagnosticDefinition | undefined {
  return byId.get(id.toUpperCase());
}

export function diagnosticSelection(id: string): Set<string> {
  const selected = new Set<string>();
  const visit = (currentId: string) => {
    if (selected.has(currentId)) return;
    const definition = diagnosticDefinition(currentId);
    if (!definition) return;
    for (const prerequisite of definition.prerequisites ?? []) visit(prerequisite);
    selected.add(currentId);
  };
  visit(id.toUpperCase());
  return selected;
}
