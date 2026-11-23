import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { diagnoseGithubWorkflowRun, inspectGithubProject, listGithubWorkflowRuns } from "../src/github.js";
import { createZip } from "../src/zip.js";
import type { FetchLike } from "../src/integrations.js";

const token = "github_pat_1234567890123456789012345678901234567890";

describe("GitHub Actions diagnostics", () => {
  it("flags credential-like file content without returning the credential", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "a8-github-scan-"));
    const tokenValue = `ghp_${"A".repeat(36)}`;
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src", "config.ts"), `export const token = "${tokenValue}";`);
      const result = await inspectGithubProject(root);
      expect(result.sensitiveContent).toEqual([{ path: "src/config.ts", patterns: ["GitHub token"] }]);
      expect(JSON.stringify(result)).not.toContain(tokenValue);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lists recent run summaries without exposing the token", async () => {
    const fetch: FetchLike = async () => new Response(JSON.stringify({
      workflow_runs: [{
        id: 42,
        name: "CI",
        display_title: "Build frontend",
        head_branch: "main",
        status: "completed",
        conclusion: "failure",
        event: "push",
        created_at: "2026-11-20T10:00:00Z",
        html_url: "https://github.com/acme/site/actions/runs/42",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
    const result = await listGithubWorkflowRuns({ token, repository: "acme/site", fetch });
    expect(result.repository).toBe("acme/site");
    expect(result.runs[0]).toMatchObject({ id: 42, conclusion: "failure", branch: "main" });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("downloads failed job logs, redacts credentials, and explains a missing script", async () => {
    const logs = createZip([{ name: "run/build.txt", data: Buffer.from([
      "> npm run test",
      "npm ERR! Missing script: \"test\"",
      `token=${token}`,
    ].join("\n")) }]);
    const fetch: FetchLike = async (input) => {
      const url = String(input);
      if (url.endsWith("/actions/runs/42")) {
        return new Response(JSON.stringify({
          id: 42,
          name: "CI",
          display_title: "Build frontend",
          head_branch: "main",
          status: "completed",
          conclusion: "failure",
          event: "push",
          html_url: "https://github.com/acme/site/actions/runs/42",
        }), { status: 200 });
      }
      if (url.includes("/actions/runs/42/jobs")) {
        return new Response(JSON.stringify({ jobs: [{
          id: 90,
          name: "build",
          conclusion: "failure",
          html_url: "https://github.com/acme/site/actions/runs/42/job/90",
        }] }), { status: 200 });
      }
      if (url.endsWith("/actions/jobs/90/logs")) return new Response(logs, { status: 200 });
      return new Response(JSON.stringify({ message: "unexpected route" }), { status: 404 });
    };

    const result = await diagnoseGithubWorkflowRun({ token, repository: "acme/site", runId: 42, fetch });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.diagnosis.title).toBe("A requested package script is missing");
    expect(result.jobs[0]!.evidence.join("\n")).toContain("Missing script");
    expect(result.jobs[0]!.logExcerpt).not.toContain(token);
    expect(result.jobs[0]!.logExcerpt).toContain("[redacted]");
  });
});
