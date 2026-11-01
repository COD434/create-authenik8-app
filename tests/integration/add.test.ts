import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import { formatAddDiff } from "../../src/commands/add/diff.js";
import { runAdd } from "../../src/commands/add/index.js";
import { AddRecipeError } from "../../src/commands/add/plan.js";
import { AddResourceError } from "../../src/commands/add/resource.js";
import { githubCiWorkflowPath } from "../../src/commands/add/ci.js";
import { handleRequest } from "../../src/commands/mcp/index.js";
import { runDoctor } from "../../src/commands/doctor/index.js";
import {
  generateProjectFixture,
  installGeneratedAppStubs,
  runGeneratedServerSmoke,
} from "../helpers/generator.js";

async function sources(rootDir: string, relativePaths: readonly string[]): Promise<string[]> {
  return Promise.all(relativePaths.map((relativePath) =>
    fs.readFile(path.join(rootDir, relativePath), "utf8")
  ));
}

describe("built-in add recipes", () => {
  it("previews, applies, verifies, diagnoses, and then no-ops an Express provider", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    const managed = [
      ".env",
      ".env.example",
      "authenik8.json",
      "src/auth/auth.ts",
      "src/auth/controllers/oauth.controller.ts",
      "src/auth/routes/oauth.routes.ts",
    ];
    try {
      const linkIntentPath = path.join(
        project.targetDir,
        "src/auth/oauth-link-intent.ts",
      );
      await fs.appendFile(linkIntentPath, "// application-specific ticket policy\n");
      const linkIntentBefore = await fs.readFile(linkIntentPath, "utf8");
      const before = await sources(project.targetDir, managed);
      const preview = await runAdd({
        recipeName: "oauth-github",
        directory: project.targetDir,
        dryRun: true,
        list: false,
        help: false,
      });
      expect(preview.status).toBe("preview");
      expect(await sources(project.targetDir, managed)).toEqual(before);
      const diff = formatAddDiff(preview.changes);
      expect(diff).toContain('router.get("/github/callback"');
      expect(diff).toContain("GITHUB_CLIENT_SECRET=<redacted>");
      expect(diff).not.toContain('"d":');

      const applied = await runAdd({
        recipeName: "github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(applied.status).toBe("applied");
      expect(await fs.readFile(path.join(project.targetDir, "src/auth/routes/oauth.routes.ts"), "utf8"))
        .toContain('router.get("/github/link"');
      expect(await fs.readFile(linkIntentPath, "utf8")).toBe(linkIntentBefore);
      expect((await fs.readJson(path.join(project.targetDir, "authenik8.json"))).features.oauthProviders)
        .toEqual(["google", "github"]);

      const smoke = await runGeneratedServerSmoke(project.targetDir, "src/server.ts");
      expect(smoke).toMatchObject({ code: 0, stderr: "" });
      await fs.remove(path.join(project.targetDir, "node_modules/authenik8-core"));
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );
      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "A8-PROJECT-002")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "A8-OAUTH-003")?.status).toBe("warn");

      const repeated = await runAdd({
        recipeName: "oauth-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(repeated.status).toBe("unchanged");
    } finally {
      await project.cleanup();
    }
  });

  it("creates a missing OAuth support file without managing later local policy edits", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    const linkIntentPath = path.join(
      project.targetDir,
      "src/auth/oauth-link-intent.ts",
    );

    try {
      await fs.remove(linkIntentPath);
      const result = await runAdd({
        recipeName: "oauth-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });

      expect(result.status).toBe("applied");
      expect(await fs.readFile(linkIntentPath, "utf8"))
        .toContain("export async function consumeOAuthLinkIntent");
    } finally {
      await project.cleanup();
    }
  });

  it("wires a fullstack provider registry without rewriting backend auth code", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      oauthProviders: ["github"],
    });
    try {
      const backendPath = path.join(project.targetDir, "apps/api/src/auth/authenik8.ts");
      const backendBefore = await fs.readFile(backendPath, "utf8");
      const result = await runAdd({
        recipeName: "oauth-google",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });

      expect(result.status).toBe("applied");
      expect(await fs.readFile(backendPath, "utf8")).toBe(backendBefore);
      expect(await fs.readFile(
        path.join(project.targetDir, "apps/web/src/auth/providers.ts"),
        "utf8",
      )).toContain('["google","github"]');
      expect(await fs.readFile(path.join(project.targetDir, ".env"), "utf8"))
        .toContain("GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback");

      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );
      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "A8-OAUTH-002")?.status).toBe("warn");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses to overwrite locally modified generated auth code", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      const authPath = path.join(project.targetDir, "src/auth/auth.ts");
      await fs.appendFile(authPath, "// local policy\n");
      const manifestBefore = await fs.readFile(path.join(project.targetDir, "authenik8.json"), "utf8");

      await expect(runAdd({
        recipeName: "oauth-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      })).rejects.toBeInstanceOf(AddRecipeError);
      expect(await fs.readFile(path.join(project.targetDir, "authenik8.json"), "utf8"))
        .toBe(manifestBefore);
      expect(await fs.readFile(authPath, "utf8")).toContain("// local policy");
    } finally {
      await project.cleanup();
    }
  });

  it("previews, creates, verifies, and protects the GitHub CI recipe", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    const workflowPath = path.join(project.targetDir, githubCiWorkflowPath);
    try {
      await expect(runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: true,
        list: false,
        help: false,
      })).rejects.toThrow("requires a committed npm lockfile");
      expect(await fs.pathExists(workflowPath)).toBe(false);

      await fs.writeJson(path.join(project.targetDir, "package-lock.json"), {
        name: "generated-app",
        lockfileVersion: 3,
        packages: {},
      });
      const preview = await runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: true,
        list: false,
        help: false,
      });
      expect(preview.status).toBe("preview");
      expect(preview.changes).toMatchObject([{
        relativePath: githubCiWorkflowPath,
        before: null,
      }]);
      expect(formatAddDiff(preview.changes)).toContain("--- /dev/null");
      expect(await fs.pathExists(workflowPath)).toBe(false);

      const applied = await runAdd({
        recipeName: "github-ci",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(applied.status).toBe("applied");
      const workflow = await fs.readFile(workflowPath, "utf8");
      expect(workflow).toContain("doctor --ci --offline --strict");
      expect(workflow).toContain("upgrade --check --json");
      expect(workflow).toContain("npm ci --no-audit --no-fund");
      expect([...workflow.matchAll(/uses: [^@]+@([0-9a-f]+)/g)].map((match) => match[1]))
        .toEqual([expect.stringMatching(/^[0-9a-f]{40}$/), expect.stringMatching(/^[0-9a-f]{40}$/)]);

      const repeated = await runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(repeated.status).toBe("unchanged");

      await fs.writeFile(
        workflowPath,
        workflow
          .replace("authenik8-ci-schema: 2", "authenik8-ci-schema: 1")
          .replace(
            "doctor --ci --offline --strict",
            "doctor --json --skip-services",
          ),
      );
      const upgraded = await runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(upgraded.status).toBe("applied");
      expect(await fs.readFile(workflowPath, "utf8"))
        .toContain("authenik8-ci-schema: 2");

      await fs.appendFile(workflowPath, "# local policy\n");
      await expect(runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      })).rejects.toBeInstanceOf(AddRecipeError);
      expect(await fs.readFile(workflowPath, "utf8")).toContain("# local policy");
    } finally {
      await project.cleanup();
    }
  });
});

describe("resource scaffolding recipe", () => {
  it("refuses non-fullstack projects, applies the full scaffold, and no-ops on re-run", async () => {
    const expressProject = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      await expect(runAdd({
        recipeName: "resource",
        resourceName: "Invoice",
        fields: "amount:number",
        directory: expressProject.targetDir,
        dryRun: false,
        list: false,
        help: false,
      })).rejects.toBeInstanceOf(AddResourceError);
    } finally {
      await expressProject.cleanup();
    }

    const project = await generateProjectFixture({ template: "fullstack" });
    try {
      const baseOptions = {
        recipeName: "resource",
        resourceName: "Invoice",
        fields: "amount:number,dueAt:date?,paid:boolean,note:string,status:enum(DRAFT,ACTIVE),verified:boolean?,priority:enum(LOW,HIGH)?",
        withTests: true,
        withCrudUi: true,
        directory: project.targetDir,
        list: false,
        help: false,
      } as const;

      const preview = await runAdd({ ...baseOptions, dryRun: true });
      expect(preview.status).toBe("preview");
      expect(preview.changes.map((change) => change.relativePath)).toEqual(expect.arrayContaining([
        "apps/api/prisma/schema.prisma",
        "apps/api/src/app.ts",
        "packages/contracts/src/index.ts",
        "apps/api/src/openapi.ts",
        "packages/api-client/src/index.ts",
        "apps/api/src/modules/invoices/invoice.policy.ts",
        "apps/api/src/modules/invoices/invoice.repository.ts",
        "apps/api/src/modules/invoices/invoice.service.ts",
        "apps/api/src/modules/invoices/invoice.controller.ts",
        "apps/api/src/modules/invoices/invoice.routes.ts",
        "apps/api/tests/invoice.policy.test.ts",
        "apps/web/src/features/invoices/InvoicePages.tsx",
        "apps/web/src/App.tsx",
        "apps/web/src/components/AppShell.tsx",
      ]));
      expect(preview.changes.every((change) => change.sensitive !== true)).toBe(true);

      const applied = await runAdd({ ...baseOptions, dryRun: false });
      expect(applied.status).toBe("applied");

      const routes = await fs.readFile(
        path.join(project.targetDir, "apps/api/src/modules/invoices/invoice.routes.ts"),
        "utf8",
      );
      expect(routes).toContain('invoiceRoutes.use(authenticate);');
      expect(routes).toContain('invoiceRoutes.delete("/:id", requireAllowedOrigin, requireCsrf, deleteInvoiceController);');

      const service = await fs.readFile(
        path.join(project.targetDir, "apps/api/src/modules/invoices/invoice.service.ts"),
        "utf8",
      );
      expect(service).toContain("throw new AppError(404, \"INVOICE_NOT_FOUND\", \"Invoice not found\");");
      expect(service).toContain("invoiceCreateSchema.parse(body);");
      expect(service).toContain("canWriteInvoice(actor, invoice)");

      const schema = await fs.readFile(
        path.join(project.targetDir, "apps/api/prisma/schema.prisma"),
        "utf8",
      );
      expect(schema).toContain("model Invoice {");
      expect(schema).toContain("enum InvoiceStatus {");
      expect(schema).toContain("  DRAFT\n  ACTIVE");
      expect(schema).toMatch(/projects[ \t]+Project\[\][\r\n]+[ \t]*invoices[ \t]+Invoice\[\]/);
      expect(schema).toContain("  dueAt     DateTime?");
      expect(schema).toContain("  note      String");
      expect(schema).toContain("  status    InvoiceStatus");
      expect(schema).toContain("  verified  Boolean?");
      expect(schema).toContain("  priority  InvoicePriority?");
      expect(schema).toContain("enum InvoicePriority {");

      const contracts = await fs.readFile(
        path.join(project.targetDir, "packages/contracts/src/index.ts"),
        "utf8",
      );
      expect(contracts).toContain("export const invoiceCreateSchema = z.strictObject({");
      expect(contracts).toContain("export const invoiceStatusSchema = z.enum([\"DRAFT\", \"ACTIVE\"]);");
      expect(contracts).toContain("export const invoicePrioritySchema = z.enum([\"LOW\", \"HIGH\"]);");
      expect(contracts).toContain("verified: z.boolean().nullish(),");
      expect(contracts).toContain("priority: invoicePrioritySchema.nullish(),");
      expect(contracts).toContain("  dueAt: z.coerce.date().nullish(),");
      expect(contracts).toContain("  amount: z.coerce.number().finite(),");
      expect(contracts).toContain("  status: invoiceStatusSchema,");
      expect(contracts).toContain("export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;");
      expect(contracts).toContain("export type Invoice = {");

      const openApi = await fs.readFile(
        path.join(project.targetDir, "apps/api/src/openapi.ts"),
        "utf8",
      );
      expect(openApi).toContain('"/api/invoices": {');
      expect(openApi).toContain('"/api/invoices/{id}": {');
      expect(openApi).toContain("  invoiceCreateSchema,");
      expect(openApi).toContain('tags: ["invoices"],');
      expect(openApi).toContain("InvoiceUpdateInput: inputSchemaWithExample(invoiceUpdateSchema, {");
      expect(openApi).toContain('{ type: "string", enum: ["DRAFT", "ACTIVE"] }');
      expect(openApi).toContain("status: \"DRAFT\",");

      const client = await fs.readFile(
        path.join(project.targetDir, "packages/api-client/src/index.ts"),
        "utf8",
      );
      expect(client).toContain("const invoices = {");
      expect(client).toContain("export const invoiceApi = defaultClient.invoices;");
      expect(client).toContain("  Invoice,");

      const app = await fs.readFile(
        path.join(project.targetDir, "apps/api/src/app.ts"),
        "utf8",
      );
      expect(app).toContain('import { invoiceRoutes } from "./modules/invoices/invoice.routes.js";');
      expect(app).toContain('app.use("/api/invoices", invoiceRoutes);');

      const policyTest = await fs.readFile(
        path.join(project.targetDir, "apps/api/tests/invoice.policy.test.ts"),
        "utf8",
      );
      expect(policyTest).toContain('import { canReadInvoice, canWriteInvoice, invoiceListScope } from "../src/modules/invoices/invoice.policy.js";');
      expect(policyTest).toContain('describe("Invoice ownership policy"');
      expect(policyTest).toContain("expect(invoiceListScope(admin)).toEqual({});");

      const pages = await fs.readFile(
        path.join(project.targetDir, "apps/web/src/features/invoices/InvoicePages.tsx"),
        "utf8",
      );
      expect(pages).toContain('import { invoiceApi } from "../../lib/authenik8";');
      expect(pages).toContain('import type { InvoiceStatus, InvoicePriority } from "@authenik8/contracts";');
      expect(pages).toContain('import { Badge, Button, EmptyState, Input, Spinner } from "@authenik8/ui";');
      expect(pages).toContain("export function InvoicesPage() {");
      expect(pages).toContain("export function InvoiceFormPage() {");
      expect(pages).toContain("export function InvoiceDetailPage() {");
      expect(pages).toContain('to="/invoices/new"');
      expect(pages).toContain('<option value="DRAFT">Draft</option><option value="ACTIVE">Active</option>');
      expect(pages).toContain("<option value=\"\">Not set</option><option value=\"LOW\">Low</option><option value=\"HIGH\">High</option>");
      expect(pages).toContain("<option value=\"\">Not set</option><option value=\"true\">Yes</option><option value=\"false\">No</option>");
      expect(pages).toContain("<input id=\"paid\" type=\"checkbox\" checked={form.paid} onChange={(event) => setForm({ ...form, paid: event.target.checked })} />");
      expect(pages).toContain("value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as InvoiceStatus })}");
      expect(pages).toContain("value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as InvoicePriority })}");
      expect(pages).toContain('type="number" step="any"');
      expect(pages).toContain('type="date"');
      expect(pages).toContain("amount: Number(form.amount),");
      expect(pages).toContain("dueAt: form.dueAt === \"\" ? undefined : new Date(form.dueAt),");
      expect(pages).toContain("paid: form.paid,");
      expect(pages).toContain("note: form.note,");
      expect(pages).toContain("verified: form.verified === \"\" ? undefined : form.verified === \"true\",");
      expect(pages).toContain("priority: form.priority === \"\" ? undefined : (form.priority as InvoicePriority),");
      expect(pages).toContain("amount: String(amount),");
      expect(pages).toContain("dueAt: dueAt?.slice(0, 10) ?? \"\",");
      expect(pages).toContain("verified: verified === null || verified === undefined ? \"\" : String(verified),");
      expect(pages).toContain("priority: priority ?? \"\",");
      expect(pages).toContain("mutationFn: () => edit ? invoiceApi.update(id!, payload) : invoiceApi.create(payload),");
      expect(pages).toContain('const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });');

      const webApp = await fs.readFile(
        path.join(project.targetDir, "apps/web/src/App.tsx"),
        "utf8",
      );
      expect(webApp).toContain('import { InvoicesPage, InvoiceDetailPage, InvoiceFormPage } from "./features/invoices/InvoicePages";');
      expect(webApp).toContain('<Route path="invoices" element={<InvoicesPage />} />');
      expect(webApp).toContain('<Route path="invoices/new" element={<InvoiceFormPage />} />');
      expect(webApp).toContain('<Route path="invoices/:id" element={<InvoiceDetailPage />} />');
      expect(webApp).toContain('<Route path="invoices/:id/edit" element={<InvoiceFormPage />} />');

      const shell = await fs.readFile(
        path.join(project.targetDir, "apps/web/src/components/AppShell.tsx"),
        "utf8",
      );
      expect(shell).toContain("  Table,");
      expect(shell).toContain('  { to: "/invoices", label: "Invoices", icon: Table },');
      expect(shell).toContain('  if (pathname.startsWith("/invoices")) return "Invoices";');

      const rerun = await runAdd({ ...baseOptions, dryRun: false });
      expect(rerun.status).toBe("unchanged");

      const mcpPlanResponse = await handleRequest({
        jsonrpc: "2.0",
        id: "mcp-1",
        method: "tools/call",
        params: {
          name: "authenik8_plan_resource_scaffold",
          arguments: {
            directory: project.targetDir,
            name: "Memo",
            fields: "title:string,body:string?",
            withTests: true,
            withCrudUi: true,
          },
        },
      }) as { content: Array<{ text: string }> };
      const mcpPlan = JSON.parse(mcpPlanResponse.content[0]!.text) as {
        planningOnly: boolean;
        applied: boolean;
        preset: string;
        changeCount: number;
        changes: Array<{ relativePath: string; operation: string }>;
        followUp: string[];
      };
      expect(mcpPlan.planningOnly).toBe(true);
      expect(mcpPlan.applied).toBe(false);
      expect(mcpPlan.preset).toBe("fullstack");
      expect(mcpPlan.changeCount).toBe(14);
      const memoPaths = [
        "apps/api/src/modules/memos/memo.policy.ts",
        "apps/api/tests/memo.policy.test.ts",
        "apps/web/src/features/memos/MemoPages.tsx",
        "apps/web/src/App.tsx",
        "apps/web/src/components/AppShell.tsx",
      ];
      for (const memoPath of memoPaths) {
        expect(mcpPlan.changes.some((change) => change.relativePath === memoPath)).toBe(true);
      }
      expect(mcpPlan.changes.filter((change) => change.operation === "create")).toHaveLength(7);
      expect(mcpPlan.followUp).toContain("npm run openapi:generate");
      for (const memoPath of [
        path.join(project.targetDir, "apps/api/src/modules/memos/memo.policy.ts"),
        path.join(project.targetDir, "apps/web/src/features/memos/MemoPages.tsx"),
      ]) {
        expect(fs.existsSync(memoPath)).toBe(false);
      }

      const mcpNoopResponse = await handleRequest({
        jsonrpc: "2.0",
        id: "mcp-2",
        method: "tools/call",
        params: {
          name: "authenik8_plan_resource_scaffold",
          arguments: {
            directory: project.targetDir,
            name: "Invoice",
            fields: "amount:number,dueAt:date?,paid:boolean,note:string,status:enum(DRAFT,ACTIVE),verified:boolean?,priority:enum(LOW,HIGH)?",
            withTests: true,
            withCrudUi: true,
          },
        },
      }) as { content: Array<{ text: string }> };
      const mcpNoop = JSON.parse(mcpNoopResponse.content[0]!.text) as { changeCount: number };
      expect(mcpNoop.changeCount).toBe(0);
    } finally {
      await project.cleanup();
    }
  });
});
