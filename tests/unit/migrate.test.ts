import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MigrateProjectError,
  MigrateUsageError,
  formatMigrationReport,
  migrationHelp,
  parseMigrateArguments,
  runMigrate,
} from "../../src/commands/migrate/index.js";

const tempRoots: string[] = [];

async function makeFixtureProject(): Promise<string> {
  const rootDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-migrate-")),
  );
  tempRoots.push(rootDir);
  return rootDir;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((rootDir) => fs.remove(rootDir)),
  );
});

describe("migrate argument parsing", () => {
  it("parses provider, directory, and --json", () => {
    expect(
      parseMigrateArguments(["supabase", "./my-app", "--json"]),
    ).toEqual({
      provider: "supabase",
      directory: "./my-app",
      json: true,
    });
  });

  it("parses the help flag", () => {
    expect(parseMigrateArguments(["--help"])).toEqual({ help: true });
    expect(migrationHelp()).toContain("migrate <provider> [directory] [--json]");
  });

  it("rejects a missing provider with a usage error", () => {
    expect(() => parseMigrateArguments([])).toThrow(MigrateUsageError);
    expect(() => parseMigrateArguments([])).toThrow(
      /Specify a migration provider/,
    );
  });

  it("rejects unknown options with a usage error", () => {
    expect(() => parseMigrateArguments(["supabase", "--wat"])).toThrow(
      MigrateUsageError,
    );
  });

  it("rejects unknown providers at run time", async () => {
    await expect(
      runMigrate({ provider: "nextauth", directory: "." }),
    ).rejects.toThrow(/Unknown provider "nextauth"/);
  });
});

describe("migrate scanning", () => {
  it("reports supabase evidence with exact locations and skips env, node_modules, and lock artifacts", async () => {
    const rootDir = await makeFixtureProject();
    await fs.mkdir(path.join(rootDir, "src", "lib"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "node_modules", "lib"), {
      recursive: true,
    });
    await fs.mkdir(path.join(rootDir, "supabase", "migrations"), {
      recursive: true,
    });

    await fs.writeFile(
      path.join(rootDir, "src", "lib", "sb.ts"),
      [
        `import { createClient } from "@supabase/supabase-js";`,
        "",
        `const supabase = createClient(process.env.SUPABASE_URL!, "anon");`,
        "",
        "export async function signIn(email: string, password: string) {",
        "  return supabase.auth.signInWithPassword({ email, password });",
        "}",
        "",
        "export async function orders() {",
        '  return supabase.from("orders").select();',
        "}",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(rootDir, ".env"),
      "SUPABASE_URL=https://example.supabase.co\nSUPABASE_ANON_KEY=secret\n",
    );
    await fs.writeFile(
      path.join(rootDir, "node_modules", "lib", "index.js"),
      "supabase.auth.getSession();",
    );
    await fs.writeFile(
      path.join(rootDir, "supabase", "migrations", "0001_init.sql"),
      "ALTER TABLE orders ENABLE ROW LEVEL SECURITY;",
    );

    const report = await runMigrate({ provider: "supabase", directory: rootDir });

    expect(report.provider).toBe("supabase");
    expect(report.readiness).toBe("detected");
    expect(report.filesScanned).toBe(2);
    expect(report.filesSkippedOversize).toBe(0);
    expect(report.findingsTotal).toBe(6);
    expect(report.strongEvidenceCount).toBe(2);
    expect(report.softEvidenceCount).toBe(4);
    expect(
      report.findings.map((finding) => [
        finding.file,
        finding.line,
        finding.id,
      ]),
    ).toEqual([
      ["src/lib/sb.ts", 1, "supabase-package-import"],
      ["src/lib/sb.ts", 3, "supabase-create-client"],
      ["src/lib/sb.ts", 3, "supabase-env-reference"],
      ["src/lib/sb.ts", 6, "supabase-auth-call"],
      ["src/lib/sb.ts", 10, "supabase-table-query"],
      ["supabase/migrations/0001_init.sql", 1, "supabase-rls-sql"],
    ]);
    expect(
      report.findings.some((finding) => finding.file === ".env"),
    ).toBe(false);
    expect(report.mappings.length).toBeGreaterThan(5);
    expect(report.mappings.some((m) => m.to.includes("/api/auth/login"))).toBe(
      true,
    );
    expect(report.notCovered.length).toBe(3);

    const byKey = (file: string, line: number, id: string) =>
      report.findings.find(
        (finding) =>
          finding.file === file && finding.line === line && finding.id === id,
      );
    expect(byKey("src/lib/sb.ts", 1, "supabase-package-import")?.remapTo).toBe(
      undefined,
    );
    expect(
      byKey("src/lib/sb.ts", 3, "supabase-env-reference")?.remapTo,
    ).toBe(undefined);
    expect(
      byKey("src/lib/sb.ts", 3, "supabase-create-client")?.remapTo,
    ).toContain("createAuthenik8Client");
    expect(byKey("src/lib/sb.ts", 6, "supabase-auth-call")?.remapTo).toBe(
      "POST /api/auth/login",
    );
    expect(
      byKey("src/lib/sb.ts", 10, "supabase-table-query")?.remapTo,
    ).toContain("Express module");
    expect(
      byKey("supabase/migrations/0001_init.sql", 1, "supabase-rls-sql")
        ?.remapTo,
    ).toContain("Express module");
    expect(report.remappedSites).toBe(4);
  });

  it("proposes per-line replacements that discriminate sibling auth call sites", async () => {
    const rootDir = await makeFixtureProject();
    await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, "src", "calls.ts"),
      [
        "await supabase.auth.signInWithPassword({ email, password });",
        "await supabase.auth.signOut();",
        "const factors = await supabase.auth.mfa.listFactors();",
        'const totals = await supabase.rpc("calculate_totals");',
      ].join("\n"),
    );

    const report = await runMigrate({ provider: "supabase", directory: rootDir });

    const authFindings = report.findings.filter(
      (finding) => finding.id === "supabase-auth-call",
    );
    expect(authFindings.map((finding) => finding.remapTo)).toEqual([
      "POST /api/auth/login",
      "POST /api/auth/logout",
      undefined,
    ]);
    const rpcFinding = report.findings.find(
      (finding) => finding.id === "supabase-rpc-call",
    );
    expect(rpcFinding?.remapTo).toContain("Express endpoint");
    expect(report.remappedSites).toBe(3);

    const text = formatMigrationReport(report, false);
    expect(text).toMatch(/calls\.ts:1[^\n]*\n\s+→ POST \/api\/auth\/login/);
    expect(text).toContain(
      "Direct replacement proposed for 3 of 4 matched line(s)",
    );
  });

  it("maps clerk and auth0 evidence to concrete Authenik8 endpoints", async () => {
    const clerkDir = await makeFixtureProject();
    await fs.mkdir(path.join(clerkDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(clerkDir, "src", "page.tsx"),
      [
        `import { UserButton } from "@clerk/nextjs";`,
        `const { user } = useUser();`,
        `<UserButton afterSignOutUrl="/" />`,
        `const admin = await clerkClient({ secretKey: process.env.CLERK_SECRET_KEY });`,
        `const authState = getAuth(req);`,
      ].join("\n"),
    );
    const clerk = await runMigrate({ provider: "clerk", directory: clerkDir });
    expect(clerk.readiness).toBe("detected");
    expect(clerk.findings.some((f) => f.id === "clerk-hook")).toBe(true);
    expect(clerk.mappings.some((m) => m.to.includes("/api/admin/users"))).toBe(
      true,
    );
    expect(clerk.notCovered.join(" ")).toContain("Hosted/prebuilt sign-in UI");

    const clerkHook = clerk.findings.find((f) => f.id === "clerk-hook");
    expect(clerkHook?.remapTo).toContain("Typed client user/session groups");
    const clerkComponent = clerk.findings.find((f) => f.id === "clerk-component");
    expect(clerkComponent?.remapTo).toContain("Your own sign-in page");
    const clerkHelpers = clerk.findings.filter(
      (f) => f.id === "clerk-server-helper",
    );
    expect(clerkHelpers.map((f) => f.remapTo)).toEqual([
      "POST /api/admin/users, DELETE /api/account/sessions",
      "GET /api/auth/me (authenticate middleware)",
    ]);
    const clerkEnv = clerk.findings.find((f) => f.id === "clerk-env-reference");
    expect(clerkEnv?.remapTo).toBe(undefined);

    const auth0Dir = await makeFixtureProject();
    await fs.mkdir(path.join(auth0Dir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(auth0Dir, "src", "mw.ts"),
      [
        `import { withApiAuthRequired } from "@auth0/nextjs-auth0";`,
        `export default withApiAuthRequired(handler);`,
        "",
        `const domain = process.env.AUTH0_DOMAIN;`,
        `const token = await getAccessTokenSilently();`,
        `const management = new ManagementClient({ domain, clientId });`,
      ].join("\n"),
    );
    const auth0 = await runMigrate({ provider: "auth0", directory: auth0Dir });
    expect(auth0.readiness).toBe("detected");
    expect(auth0.findings.some((f) => f.id === "auth0-next-handler")).toBe(
      true,
    );
    expect(auth0.mappings.some((m) => m.to.includes("/.well-known/jwks.json"))).toBe(true);

    const auth0Tokens = auth0.findings.filter(
      (f) => f.id === "auth0-sdk-token",
    );
    expect(auth0Tokens.map((f) => f.remapTo)).toEqual([
      "POST /api/auth/refresh through @authenik8/api-client",
      "GET /api/admin/users, GET /api/admin/audit",
    ]);
    const auth0Handler = auth0.findings.find(
      (f) => f.id === "auth0-next-handler",
    );
    expect(auth0Handler?.remapTo).toContain("the Authenik8 API owns OAuth start");
  });

  it("classifies soft-only evidence as likely", async () => {
    const rootDir = await makeFixtureProject();
    await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, "src", "ui.tsx"),
      ["export const avatar = <UserButton />;"].join("\n"),
    );
    const report = await runMigrate({ provider: "clerk", directory: rootDir });
    expect(report.readiness).toBe("likely");
    expect(report.strongEvidenceCount).toBe(0);
    expect(report.findingsTotal).toBe(1);
    expect(report.nextSteps.length).toBeGreaterThan(0);
  });

  it("reports not-detected for empty and provider-free directories", async () => {
    const emptyDir = await makeFixtureProject();
    const empty = await runMigrate({
      provider: "supabase",
      directory: emptyDir,
    });
    expect(empty.readiness).toBe("not-detected");
    expect(empty.filesScanned).toBe(0);
    expect(empty.findingsTotal).toBe(0);
  });

  it("caps matches per file and skips oversized files", async () => {
    const rootDir = await makeFixtureProject();
    await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, "src", "many.ts"),
      Array.from(
        { length: 60 },
        (_, index) => `await supabase.from("t${index}").select();`,
      ).join("\n"),
    );
    await fs.writeFile(
      path.join(rootDir, "src", "huge.ts"),
      `supabase.from("x").select();\n${"#".repeat(1_100_000)}\n`,
    );

    const report = await runMigrate({ provider: "supabase", directory: rootDir });
    expect(report.filesSkippedOversize).toBe(1);
    expect(
      report.findings.filter((finding) => finding.file === "src/many.ts"),
    ).toHaveLength(50);
  });
});

describe("migrate output and errors", () => {
  it("renders a parseable JSON report and a human report", async () => {
    const rootDir = await makeFixtureProject();
    await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, "src", "sb.ts"),
      `import { createClient } from "@supabase/supabase-js";\n`,
    );
    const report = await runMigrate({ provider: "supabase", directory: rootDir });

    const json = JSON.parse(formatMigrationReport(report, true)) as {
      provider: string;
      readiness: string;
      findingsTotal: number;
      remappedSites: number;
      boundaryReminders: string[];
    };
    expect(json.provider).toBe("supabase");
    expect(json.readiness).toBe("detected");
    expect(json.findingsTotal).toBe(1);
    expect(json.remappedSites).toBe(0);
    expect(json.boundaryReminders.length).toBe(4);

    const text = formatMigrationReport(report, false);
    expect(text.startsWith("Migration readiness report — supabase")).toBe(true);
    expect(text).toContain("read-only: nothing in the target directory was modified");
    expect(text).toContain("POST /api/auth/login");
  });

  it("fails cleanly for missing directories and file paths", async () => {
    const missing = path.join(os.tmpdir(), "authenik8-migrate-missing");
    await expect(
      runMigrate({ provider: "supabase", directory: missing }),
    ).rejects.toThrow(MigrateProjectError);

    const filePath = await makeFixtureProject();
    await fs.writeFile(path.join(filePath, "package.json"), "{}\n");
    await expect(
      runMigrate({
        provider: "supabase",
        directory: path.join(filePath, "package.json"),
      }),
    ).rejects.toThrow(/Not a directory/);
  });
});
