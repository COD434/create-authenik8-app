import fs from "fs-extra";
import path from "node:path";

/**
 * Read-only migration readiness reports (roadmap item 14, first slice).
 *
 * `migrate <provider> [directory]` scans an existing project for evidence of a
 * third-party auth provider and maps every detected call site to the concrete
 * Authenik8 surface that replaces it. The command never writes to the target
 * directory, never reads `.env` values, and never prints file contents — only
 * stable `file:line` locations with stable pattern IDs.
 */

export class MigrateUsageError extends Error {}

export class MigrateProjectError extends Error {}

export const MIGRATION_PROVIDERS = ["supabase", "clerk", "auth0"] as const;

export type MigrationProvider = (typeof MIGRATION_PROVIDERS)[number];

type EvidenceTier = "strong" | "soft";

type EvidencePattern = {
  id: string;
  tier: EvidenceTier;
  summary: string;
  regex: RegExp;
};

export type MappingEntry = {
  from: string;
  to: string;
  notes?: string;
};

const MAX_FILES_SCANNED = 2000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_FINDINGS = 200;
const MAX_FINDINGS_PER_FILE = 50;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".vite",
  ".cache",
  ".parcel-cache",
  "test-results",
  "playwright-report",
]);

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "svelte",
  "vue",
  "astro",
  "sql",
]);

const SUPABASE_PATTERNS: readonly EvidencePattern[] = [
  {
    id: "supabase-package-import",
    tier: "strong",
    summary: "Supabase client package import",
    regex: /["']@supabase\/[a-z0-9-]+["']/,
  },
  {
    id: "supabase-env-reference",
    tier: "strong",
    summary: "Supabase environment variable referenced in code",
    regex: /\bSUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET)\b/,
  },
  {
    id: "supabase-create-client",
    tier: "soft",
    summary: "Supabase-style client construction",
    regex: /\bcreate(Browser|Server)?Client\s*\(/,
  },
  {
    id: "supabase-auth-call",
    tier: "soft",
    summary: "supabase.auth.* call site",
    regex: /\bsupabase\.auth\.\w+/,
  },
  {
    id: "supabase-table-query",
    tier: "soft",
    summary: "RLS-style table query",
    regex: /\.from\(\s*["'`]/,
  },
  {
    id: "supabase-rpc-call",
    tier: "soft",
    summary: "Supabase RPC invocation",
    regex: /\.rpc\(\s*["'`]/,
  },
  {
    id: "supabase-rls-sql",
    tier: "soft",
    summary: "Postgres row-level-security policy (migration SQL)",
    regex: /\bENABLE ROW LEVEL SECURITY\b/i,
  },
];

const CLERK_PATTERNS: readonly EvidencePattern[] = [
  {
    id: "clerk-package-import",
    tier: "strong",
    summary: "Clerk package import",
    regex: /["']@clerk\/[a-z0-9-]+["']/,
  },
  {
    id: "clerk-env-reference",
    tier: "strong",
    summary: "Clerk environment variable referenced in code",
    regex: /\bCLERK_[A-Z_]+\b/,
  },
  {
    id: "clerk-component",
    tier: "soft",
    summary: "Clerk React component",
    regex: /<(ClerkProvider|SignIn|SignUp|UserButton|SignedIn|SignedOut|SignInButton|UserProfile)\b/,
  },
  {
    id: "clerk-hook",
    tier: "soft",
    summary: "Clerk React hook",
    regex: /\buse(Clerk|SignIn|SignUp|SessionList|Organization|OrganizationList|User)\b\s*\(/,
  },
  {
    id: "clerk-middleware",
    tier: "soft",
    summary: "Clerk middleware",
    regex: /\bclerkMiddleware\b|\bauthMiddleware\b/,
  },
  {
    id: "clerk-server-helper",
    tier: "soft",
    summary: "Clerk server helper",
    regex: /\bclerkClient\b|\bgetAuth\(|\brequireAuth\(/,
  },
];

const AUTH0_PATTERNS: readonly EvidencePattern[] = [
  {
    id: "auth0-package-import",
    tier: "strong",
    summary: "Auth0 package import",
    regex: /["']@auth0\/[a-z0-9-]+["']/,
  },
  {
    id: "auth0-env-reference",
    tier: "strong",
    summary: "Auth0 environment variable referenced in code",
    regex: /\bAUTH0_[A-Z_]+\b/,
  },
  {
    id: "auth0-react",
    tier: "soft",
    summary: "Auth0 React integration",
    regex: /\buseAuth0\b|\bwithAuthenticationRequired\b|\bAuth0Provider\b/,
  },
  {
    id: "auth0-next-handler",
    tier: "soft",
    summary: "Auth0 Next.js route handler",
    regex: /\bhandle(Auth|Login|Logout|Callback|Profile)\b|\bwithApiAuthRequired\b/,
  },
  {
    id: "auth0-sdk-token",
    tier: "soft",
    summary: "Auth0 SDK token/management usage",
    regex: /\bManagementClient\b|\bAuthenticationClient\b|\bgetAccessTokenSilently\b/,
  },
];

const PROVIDER_EVIDENCE: Record<MigrationProvider, readonly EvidencePattern[]> = {
  supabase: SUPABASE_PATTERNS,
  clerk: CLERK_PATTERNS,
  auth0: AUTH0_PATTERNS,
};

const BOUNDARY_REMINDERS: readonly string[] = [
  "Never persist access tokens in localStorage, sessionStorage, or IndexedDB; the typed client keeps them in memory.",
  "Refresh tokens are sealed HttpOnly cookies managed by the API; never expose them to JavaScript.",
  "Never receive backend secrets through VITE_* variables or client-visible configuration.",
  "Frontend route guards are convenience, not authorization; roles and policies are enforced in API middleware.",
];

const SUPABASE_MAPPINGS: readonly MappingEntry[] = [
  {
    from: "supabase.auth.signUp",
    to: "POST /api/auth/register, then POST /api/auth/verify-email",
    notes:
      "Authenik8 sends verification mail through the generated API's mailer; the client is @authenik8/api-client.",
  },
  {
    from: "supabase.auth.signInWithPassword",
    to: "POST /api/auth/login",
    notes:
      "Login establishes a server-side Redis session, not a client-only token.",
  },
  {
    from: "supabase.auth.signInWithOtp / signInWithOAuth",
    to: "GET /api/auth/oauth/:provider (start), GET /api/auth/oauth/:provider/callback (completion)",
    notes:
      "OAuth state and callbacks are owned by the Authenik8 API; exchange any out-of-band code only through POST /api/auth/oauth/exchange.",
  },
  {
    from: "supabase.auth.getUser / getSession",
    to: "GET /api/auth/me (authenticate middleware) with token bootstrap from POST /api/auth/refresh",
    notes:
      "Access tokens stay in memory; the sealed refresh cookie rotates server-side on POST /api/auth/refresh.",
  },
  {
    from: "supabase.auth.signOut",
    to: "POST /api/auth/logout",
    notes: "Logout revokes the server session, not just local state.",
  },
  {
    from: "supabase.auth.onAuthStateChange",
    to: "@authenik8/api-client token lifecycle (shared refresh + retry, cross-tab coordination)",
    notes:
      "Replace client-side session listeners with the typed client; SSR route guards must become API-side session and role checks.",
  },
  {
    from: "supabase.auth.resetPasswordForEmail",
    to: "POST /api/auth/forgot-password, then POST /api/auth/reset-password",
  },
  {
    from: "supabase.auth.updateUser",
    to: "PATCH /api/account/profile, PUT /api/account/password",
    notes: "Password changes revoke existing sessions server-side.",
  },
  {
    from: "supabase.auth.admin.* (service-role server code)",
    to: "POST /api/admin/* (users, audit)",
    notes: "Administrative authorization is enforced by role middleware.",
  },
  {
    from: ".from(\"table\") row queries guarded by RLS policies",
    to: "Your own Express module with a policy middleware",
    notes:
      "Scaffold one with the resource recipe: npx create-authenik8-app add resource <Name> --fields \"<spec>\", then move the table into Prisma migrations.",
  },
  {
    from: "createClient(...) client construction",
    to: "createAuthenik8Client({ baseUrl }) from @authenik8/api-client",
    notes:
      "All provider traffic then flows over the generated Authenik8 REST API; no direct database client ships to the browser.",
  },
  {
    from: ".rpc(\"fn\") call",
    to: "Your own Express endpoint (optionally an operation on a scaffolded resource module)",
    notes:
      "Postgres functions become endpoints you own; authorization is enforced by middleware instead of database grants.",
  },
];

const CLERK_MAPPINGS: readonly MappingEntry[] = [
  {
    from: "<ClerkProvider> / <SignIn> / <SignUp>",
    to: "Your own sign-in page calling POST /api/auth/login and POST /api/auth/register through @authenik8/api-client",
    notes: "Authenik8 exposes HTTP endpoints; you own the form UI.",
  },
  {
    from: "auth() / currentUser() (server components)",
    to: "GET /api/auth/me (authenticate middleware)",
  },
  {
    from: "useUser() / useAuth() / useSession()",
    to: "Typed client user/session groups",
    notes:
      "Client state is in-memory access tokens plus the sealed refresh cookie.",
  },
  {
    from: "getToken() / JWT templates",
    to: "POST /api/auth/refresh",
    notes: "Rotation is stateful and locked per session; replay revokes the family.",
  },
  {
    from: "Clerk Backend SDK (users.createUser, sessions.revoke)",
    to: "POST /api/admin/users, DELETE /api/account/sessions",
  },
  {
    from: "Clerk webhooks (user.created, session.ended)",
    to: "GET /api/admin/users and GET /api/admin/audit",
    notes: "No webhook delivery surface; read audit state through the admin API.",
  },
];

const AUTH0_MAPPINGS: readonly MappingEntry[] = [
  {
    from: "useAuth0().loginWithRedirect / Auth0 universal login",
    to: "POST /api/auth/login (local) or GET /api/auth/oauth/:provider (federated Google/GitHub)",
  },
  {
    from: "getAccessTokenSilently()",
    to: "POST /api/auth/refresh through @authenik8/api-client",
    notes: "One shared refresh across tabs; one retry of the interrupted request.",
  },
  {
    from: "Auth0-issued JWT verification (jwks fetch)",
    to: "Engine access tokens verified against GET /.well-known/jwks.json of your own API",
    notes: "Tokens stay bounded to the Redis-backed session; revocation is immediate.",
  },
  {
    from: "handleAuth() in app/api/auth/[auth0]/route.ts",
    to: "Removed; the Authenik8 API owns OAuth start and callbacks",
  },
  {
    from: "Auth0 Management API",
    to: "GET /api/admin/users, GET /api/admin/audit",
  },
  {
    from: "Auth0 logout",
    to: "POST /api/auth/logout",
  },
];

const PROVIDER_MAPPINGS: Record<MigrationProvider, readonly MappingEntry[]> = {
  supabase: SUPABASE_MAPPINGS,
  clerk: CLERK_MAPPINGS,
  auth0: AUTH0_MAPPINGS,
};

type RemapRule = {
  mappingFrom: string;
  when?: RegExp;
};

const SUPABASE_REMAPS: Record<string, readonly RemapRule[]> = {
  "supabase-auth-call": [
    { mappingFrom: "supabase.auth.signUp", when: /\bsupabase\.auth\.signUp\b/ },
    {
      mappingFrom: "supabase.auth.signInWithPassword",
      when: /\bsupabase\.auth\.signInWithPassword\b/,
    },
    {
      mappingFrom: "supabase.auth.signInWithOtp / signInWithOAuth",
      when: /\bsupabase\.auth\.signInWith(?:Otp|OAuth)\b/,
    },
    {
      mappingFrom: "supabase.auth.getUser / getSession",
      when: /\bsupabase\.auth\.(?:getUser|getSession)\b/,
    },
    { mappingFrom: "supabase.auth.signOut", when: /\bsupabase\.auth\.signOut\b/ },
    {
      mappingFrom: "supabase.auth.onAuthStateChange",
      when: /\bsupabase\.auth\.onAuthStateChange\b/,
    },
    {
      mappingFrom: "supabase.auth.resetPasswordForEmail",
      when: /\bsupabase\.auth\.resetPasswordForEmail\b/,
    },
    { mappingFrom: "supabase.auth.updateUser", when: /\bsupabase\.auth\.updateUser\b/ },
    {
      mappingFrom: "supabase.auth.admin.* (service-role server code)",
      when: /\bsupabase\.auth\.admin\b/,
    },
  ],
  "supabase-create-client": [
    { mappingFrom: "createClient(...) client construction" },
  ],
  "supabase-table-query": [
    { mappingFrom: ".from(\"table\") row queries guarded by RLS policies" },
  ],
  "supabase-rpc-call": [{ mappingFrom: ".rpc(\"fn\") call" }],
  "supabase-rls-sql": [
    { mappingFrom: ".from(\"table\") row queries guarded by RLS policies" },
  ],
};

const CLERK_REMAPS: Record<string, readonly RemapRule[]> = {
  "clerk-component": [{ mappingFrom: "<ClerkProvider> / <SignIn> / <SignUp>" }],
  "clerk-hook": [{ mappingFrom: "useUser() / useAuth() / useSession()" }],
  "clerk-server-helper": [
    {
      mappingFrom: "Clerk Backend SDK (users.createUser, sessions.revoke)",
      when: /\bclerkClient\b/,
    },
    { mappingFrom: "auth() / currentUser() (server components)" },
  ],
};

const AUTH0_REMAPS: Record<string, readonly RemapRule[]> = {
  "auth0-react": [
    { mappingFrom: "useAuth0().loginWithRedirect / Auth0 universal login" },
  ],
  "auth0-next-handler": [
    { mappingFrom: "handleAuth() in app/api/auth/[auth0]/route.ts" },
  ],
  "auth0-sdk-token": [
    { mappingFrom: "getAccessTokenSilently()", when: /\bgetAccessTokenSilently\b/ },
    { mappingFrom: "Auth0 Management API" },
  ],
};

const PROVIDER_REMAPS: Record<
  MigrationProvider,
  Record<string, readonly RemapRule[]>
> = {
  supabase: SUPABASE_REMAPS,
  clerk: CLERK_REMAPS,
  auth0: AUTH0_REMAPS,
};

const PROVIDER_NEXT_STEPS: Record<MigrationProvider, readonly string[]> = {
  supabase: [
    "Generate the Authenik8 app (npx create-authenik8-app@latest <directory> --preset fullstack) next to this project.",
    "Mirror the Supabase tables into apps/api/prisma/schema.prisma and write migrations yourself; do not import RLS policies as-is.",
    "Scaffold owned business modules with: npx create-authenik8-app add resource <Name> --fields \"<spec>\".",
    "Configure OAuth providers at generation time (--oauth google --oauth github) instead of Supabase Auth.",
    "Delete the Supabase client wrappers once the mapped call sites move behind the typed @authenik8/api-client.",
  ],
  clerk: [
    "Generate the Authenik8 app (npx create-authenik8-app@latest <directory> --preset fullstack) and point @authenik8/api-client at its /api base URL.",
    "Replace Clerk provider components with your own login/register pages over POST /api/auth/login and POST /api/auth/register.",
    "Move any server-side auth() reads behind GET /api/auth/me with the authenticate middleware.",
    "Keep CLERK_* and Authenik8 server variables out of client-visible configuration during the transition.",
  ],
  auth0: [
    "Generate the Authenik8 app (npx create-authenik8-app@latest <directory> --preset fullstack) and replace app/api/auth/[auth0]/route.ts with calls to the Authenik8 API.",
    "Reimplement any Auth0 Actions/Rules logic as Express middleware you control.",
    "Validate application-side tokens against your own API's /.well-known/jwks.json.",
    "Configure federated providers through OAuth flags at generation time rather than Auth0 connections.",
  ],
};

const PROVIDER_NOT_COVERED: Record<MigrationProvider, readonly string[]> = {
  supabase: [
    "Supabase Storage (no equivalent surface today; plan your own storage layer).",
    "Supabase Realtime subscriptions (no equivalent surface today).",
    "Edge Functions runtime (implement equivalent handlers as Express endpoints).",
  ],
  clerk: [
    "Hosted/prebuilt sign-in UI components (Authenik8 ships REST endpoints and a typed client; the form UI is yours).",
  ],
  auth0: [
    "Auth0 Actions/Rules runtime (implement equivalent logic as Express middleware).",
  ],
};

export type MigrationFinding = {
  file: string;
  line: number;
  id: string;
  tier: EvidenceTier;
  summary: string;
  remapTo?: string;
  remapNotes?: string;
};

function remapForFinding(
  provider: MigrationProvider,
  patternId: string,
  matchedLine: string,
): MappingEntry | undefined {
  const rules = PROVIDER_REMAPS[provider][patternId];
  if (!rules) return undefined;
  const rule = rules.find((candidate) =>
    candidate.when ? candidate.when.test(matchedLine) : true,
  );
  if (!rule) return undefined;
  return PROVIDER_MAPPINGS[provider]!.find(
    (entry) => entry.from === rule.mappingFrom,
  );
}

export type MigrationReport = {
  provider: MigrationProvider;
  directory: string;
  filesScanned: number;
  filesScannedTruncated: boolean;
  filesSkippedOversize: number;
  findingsTotal: number;
  findings: MigrationFinding[];
  findingsTruncated: boolean;
  remappedSites: number;
  strongEvidenceCount: number;
  softEvidenceCount: number;
  readiness: "detected" | "likely" | "not-detected";
  mappings: readonly MappingEntry[];
  notCovered: readonly string[];
  nextSteps: readonly string[];
  boundaryReminders: readonly string[];
};

export type MigrateOptions = {
  readonly help?: boolean;
  readonly json?: boolean;
  readonly provider?: string;
  readonly directory?: string;
};

export function parseMigrateArguments(argv: readonly string[]): MigrateOptions {
  const options: { help?: boolean; json?: boolean; positional: string[] } = {
    positional: [],
  };

  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--json") options.json = true;
    else if (argument.startsWith("--")) {
      throw new MigrateUsageError(`Unknown migrate option: ${argument}`);
    } else options.positional.push(argument);
  }

  if (options.help) return { help: true };

  const [provider, directory] = options.positional;
  if (!provider) {
    throw new MigrateUsageError(
      `Specify a migration provider: ${MIGRATION_PROVIDERS.join(", ")}.`,
    );
  }

  return {
    provider,
    json: options.json === true,
    ...(directory !== undefined ? { directory } : {}),
  };
}

export function migrationHelp(): string {
  return [
    "Usage: create-authenik8-app migrate <provider> [directory] [--json]",
    "",
    "Providers:",
    `  ${MIGRATION_PROVIDERS.join(", ")}`,
    "",
    "Scans an existing project for third-party auth usage and maps every",
    "detected call site to its Authenik8 replacement (endpoints, typed client,",
    "admin surfaces). Read-only: nothing in the target directory is modified.",
    "",
    "Examples:",
    "  npx create-authenik8-app migrate supabase ./my-supa-app",
    "  npx create-authenik8-app migrate clerk . --json",
  ].join("\n");
}

function isProviderCandidate(value: string): value is MigrationProvider {
  return (MIGRATION_PROVIDERS as readonly string[]).includes(value);
}

function isSkippedFileName(name: string): boolean {
  return (
    name.startsWith(".env")
    || name.endsWith(".min.js")
    || name.endsWith(".d.ts")
  );
}

function evidenceFileExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return name.slice(dot + 1).toLowerCase();
}

type ScanAccumulator = {
  findings: MigrationFinding[];
  seen: Set<string>;
  filesScanned: number;
  filesSkippedOversize: number;
  filesScannedTruncated: boolean;
};

async function scanDirectory(
  scanRootDir: string,
  currentDir: string,
  provider: MigrationProvider,
  accumulator: ScanAccumulator,
): Promise<void> {
  const patterns = PROVIDER_EVIDENCE[provider]!;
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await scanDirectory(scanRootDir, absolute, provider, accumulator);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isSkippedFileName(entry.name)) continue;

    const extension = evidenceFileExtension(entry.name);
    if (!extension || !CODE_EXTENSIONS.has(extension)) continue;

    const stats = await fs.stat(absolute);
    if (stats.size > MAX_FILE_BYTES) {
      accumulator.filesSkippedOversize += 1;
      continue;
    }

    if (accumulator.filesScanned >= MAX_FILES_SCANNED) {
      accumulator.filesScannedTruncated = true;
      return;
    }
    accumulator.filesScanned += 1;

    let matchesThisFile = 0;
    const content = await fs.readFile(absolute, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (matchesThisFile >= MAX_FINDINGS_PER_FILE) break;
      const line = lines[index] ?? "";
      for (const pattern of patterns) {
        if (!pattern.regex.test(line)) continue;
        const key = `${absolute}\u0000${index + 1}\u0000${pattern.id}`;
        if (accumulator.seen.has(key)) continue;
        accumulator.seen.add(key);
        const remap = remapForFinding(provider, pattern.id, line);
        accumulator.findings.push({
          file: path
            .relative(scanRootDir, absolute)
            .split(path.sep)
            .join("/"),
          line: index + 1,
          id: pattern.id,
          tier: pattern.tier,
          summary: pattern.summary,
          ...(remap
            ? {
                remapTo: remap.to,
                ...(remap.notes !== undefined
                  ? { remapNotes: remap.notes }
                  : {}),
              }
            : {}),
        });
        matchesThisFile += 1;
      }
    }
  }
}

export async function runMigrate(options: MigrateOptions): Promise<MigrationReport> {
  const providerValue = options.provider ?? "";
  if (!isProviderCandidate(providerValue)) {
    throw new MigrateUsageError(
      `Unknown provider "${providerValue}". Supported providers: ${MIGRATION_PROVIDERS.join(", ")}.`,
    );
  }

  const rootDir = path.resolve(options.directory ?? ".");
  if (!(await fs.pathExists(rootDir))) {
    throw new MigrateProjectError(`Directory does not exist: ${rootDir}`);
  }
  const stats = await fs.stat(rootDir);
  if (!stats.isDirectory()) {
    throw new MigrateProjectError(`Not a directory: ${rootDir}`);
  }

  const accumulator: ScanAccumulator = {
    findings: [],
    seen: new Set(),
    filesScanned: 0,
    filesSkippedOversize: 0,
    filesScannedTruncated: false,
  };
  await scanDirectory(rootDir, rootDir, providerValue, accumulator);

  accumulator.findings.sort((left, right) =>
    left.file.localeCompare(right.file)
    || left.line - right.line
    || left.id.localeCompare(right.id),
  );

  let strongEvidenceCount = 0;
  let softEvidenceCount = 0;
  for (const finding of accumulator.findings) {
    if (finding.tier === "strong") strongEvidenceCount += 1;
    else softEvidenceCount += 1;
  }

  const readiness: MigrationReport["readiness"] =
    strongEvidenceCount > 0
      ? "detected"
      : softEvidenceCount > 0
        ? "likely"
        : "not-detected";

  const remappedSites = accumulator.findings.filter(
    (finding) => finding.remapTo !== undefined,
  ).length;

  return {
    provider: providerValue,
    directory: rootDir,
    filesScanned: accumulator.filesScanned,
    filesScannedTruncated: accumulator.filesScannedTruncated,
    filesSkippedOversize: accumulator.filesSkippedOversize,
    findingsTotal: accumulator.findings.length,
    findings: accumulator.findings.slice(0, MAX_FINDINGS),
    findingsTruncated: accumulator.findings.length > MAX_FINDINGS,
    remappedSites,
    strongEvidenceCount,
    softEvidenceCount,
    readiness,
    mappings: PROVIDER_MAPPINGS[providerValue]!,
    notCovered: PROVIDER_NOT_COVERED[providerValue]!,
    nextSteps: PROVIDER_NEXT_STEPS[providerValue]!,
    boundaryReminders: BOUNDARY_REMINDERS,
  };
}

export function formatMigrationReport(
  report: MigrationReport,
  json: boolean,
): string {
  if (json) return `${JSON.stringify(report, null, 2)}\n`;

  const output: string[] = [];
  output.push(`Migration readiness report — ${report.provider} → Authenik8`);
  output.push("");
  output.push(`Directory: ${report.directory}`);
  const scannedSummary = report.filesScannedTruncated
    ? `${report.filesScanned}+ code files scanned (scan truncated at ${MAX_FILES_SCANNED})`
    : `${report.filesScanned} code files scanned`;
  output.push(scannedSummary);
  if (report.filesSkippedOversize > 0) {
    output.push(
      `${report.filesSkippedOversize} file(s) skipped as unusually large.`,
    );
  }
  output.push("");
  output.push(
    `Detected usage: ${report.readiness}`
    + ` (${report.strongEvidenceCount} strong, ${report.softEvidenceCount} advisory)`,
  );
  output.push("");

  if (report.findingsTotal === 0) {
    output.push(
      `No ${report.provider} usage found in scanned code files. If usage lives in exotic formats, spot-check manually.`,
    );
    output.push("");
  } else {
    output.push(`Evidence (${report.findingsTotal} matched line(s)):`);
    const shown = report.findings.slice(0, 30);
    for (const finding of shown) {
      output.push(`  ${finding.file}:${finding.line}  [${finding.tier}] ${finding.summary}`);
      if (finding.remapTo) output.push(`    → ${finding.remapTo}`);
      if (finding.remapNotes) output.push(`      ${finding.remapNotes}`);
    }
    const hidden = report.findingsTotal - shown.length;
    if (hidden > 0) output.push(`  (+ ${hidden} more matched line(s))`);
    output.push(
      `Direct replacement proposed for ${report.remappedSites} of ${report.findingsTotal} matched line(s); the rest map through the tables below.`,
    );
    output.push("");
  }

  output.push(`Mapping (${report.provider} → Authenik8):`);
  for (const mapping of report.mappings) {
    output.push(`  ${mapping.from}`);
    output.push(`    → ${mapping.to}`);
    if (mapping.notes) output.push(`    ${mapping.notes}`);
  }
  output.push("");

  if (report.notCovered.length > 0) {
    output.push("Not covered today:");
    for (const entry of report.notCovered) output.push(`  - ${entry}`);
    output.push("");
  }

  output.push("Next steps:");
  for (const step of report.nextSteps) output.push(`  - ${step}`);
  output.push("");

  output.push("Session and secret boundaries:");
  for (const reminder of report.boundaryReminders) {
    output.push(`  - ${reminder}`);
  }
  output.push("");
  output.push(
    "This command is read-only: nothing in the target directory was modified.",
  );
  return output.join("\n");
}
