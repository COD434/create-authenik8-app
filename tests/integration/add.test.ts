import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import { formatAddDiff } from "../../src/commands/add/diff.js";
import { runAdd } from "../../src/commands/add/index.js";
import { AddRecipeError } from "../../src/commands/add/plan.js";
import { AddResourceError } from "../../src/commands/add/resource.js";
import { githubCiWorkflowPath } from "../../src/commands/add/ci.js";
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
        fields: "amount:number,dueAt:date?,paid:boolean,note:string,status:enum(DRAFT,ACTIVE)",
        withTests: true,
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

      const contracts = await fs.readFile(
        path.join(project.targetDir, "packages/contracts/src/index.ts"),
        "utf8",
      );
      expect(contracts).toContain("export const invoiceCreateSchema = z.strictObject({");
      expect(contracts).toContain("export const invoiceStatusSchema = z.enum([\"DRAFT\", \"ACTIVE\"]);");
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

      const rerun = await runAdd({ ...baseOptions, dryRun: false });
      expect(rerun.status).toBe("unchanged");
    } finally {
      await project.cleanup();
    }
  });
});
