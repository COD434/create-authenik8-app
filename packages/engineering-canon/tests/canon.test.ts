import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CANON_BUILD_PROMPT, CANON_REVIEW_PROMPT } from "../src/prompt.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, "..");
const canonRoot = path.join(packageRoot, "canon");
const skillsRoot = path.join(packageRoot, "skills");
const agentsRoot = path.join(packageRoot, "..", "..", ".opencode", "agents");

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(directory, name));
}

type ParsedRule = {
  id: string;
  title: string;
  block: string;
  file: string;
};

function parseRules(): ParsedRule[] {
  const parsed: ParsedRule[] = [];
  for (const file of markdownFiles(path.join(canonRoot, "rules"))) {
    const source = read(file);
    const blocks = source.split(/^### /m).slice(1);
    for (const block of blocks) {
      const [heading = "", ...rest] = block.split("\n");
      const match = /^(A8-[A-Z]+-\d{2})\s+(.+)$/.exec(heading.trim());
      if (match === null) continue;
      parsed.push({
        id: match[1] ?? "",
        title: match[2] ?? "",
        block: rest.join("\n"),
        file,
      });
    }
  }
  return parsed;
}

const rules = parseRules();

describe("canon rules", () => {
  it("has a meaningful number of rules across every domain", () => {
    expect(rules.length).toBeGreaterThanOrEqual(80);
    const prefixes = new Set(rules.map((rule) => rule.id.split("-")[1]));
    expect([...prefixes].sort()).toEqual([
      "ALG",
      "ARCH",
      "CHG",
      "DATA",
      "DEL",
      "FND",
      "READ",
      "REL",
      "SEC",
      "TS",
    ]);
  });

  it("uses unique IDs and complete fields", () => {
    const ids = new Set<string>();
    for (const rule of rules) {
      expect(ids.has(rule.id), `duplicate ${rule.id}`).toBe(false);
      ids.add(rule.id);
      for (const field of ["**Rule.**", "**In practice.**", "**Smell.**", "**Source.**"]) {
        expect(rule.block, `${rule.id} in ${rule.file} lacks ${field}`).toContain(field);
      }
      expect(rule.title.length).toBeGreaterThan(3);
    }
  });

  it("lists every rule in the canon index", () => {
    const index = read(path.join(canonRoot, "CANON.md"));
    for (const rule of rules) {
      expect(index, `${rule.id} is missing from CANON.md`).toContain(rule.id);
    }
  });

  it("cites a source for every rule", () => {
    for (const rule of rules) {
      const sourceLine = rule.block.split("\n").find((line) => line.startsWith("**Source.**"));
      expect(sourceLine, `${rule.id} has no source line`).toBeDefined();
      expect(sourceLine?.length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("skills", () => {
  const skillDirectories = readdirSync(skillsRoot).filter((name) =>
    statSync(path.join(skillsRoot, name)).isDirectory(),
  );

  it("ships every advertised skill with a description", () => {
    expect(skillDirectories.length).toBeGreaterThanOrEqual(9);
    for (const directory of skillDirectories) {
      const file = path.join(skillsRoot, directory, "SKILL.md");
      const source = read(file);
      expect(source.startsWith("---\n"), `${directory} has no frontmatter`).toBe(true);
      expect(source).toMatch(/^name: .+$/m);
      expect(source).toMatch(/^description: .+$/m);
      expect(source).toContain("## Workflow");
    }
  });

  it("uses only ASCII punctuation in user-facing prose", () => {
    const files = [
      ...markdownFiles(path.join(canonRoot, "rules")),
      path.join(canonRoot, "CANON.md"),
      ...skillDirectories.map((directory) => path.join(skillsRoot, directory, "SKILL.md")),
    ];
    for (const file of files) {
      const source = read(file);
      expect(source.includes("\u2014"), `${file} contains an em dash`).toBe(false);
    }
  });
});

describe("review agents", () => {
  const agentFiles = readdirSync(agentsRoot).filter((name) => name.endsWith(".md"));

  it("defines read-only subagents with no legacy tool field", () => {
    expect(agentFiles.length).toBeGreaterThanOrEqual(6);
    for (const name of agentFiles) {
      const source = read(path.join(agentsRoot, name));
      expect(source).toMatch(/^mode: subagent$/m);
      expect(source).toMatch(/^description: .+$/m);
      expect(source).toContain("permissions:");
      expect(source).toContain("read-only");
      expect(source).not.toMatch(/^tools:/m);
      expect(source).not.toMatch(/^permission:/m);
    }
  });

  it("references only skills that exist", () => {
    for (const name of agentFiles) {
      const source = read(path.join(agentsRoot, name));
      for (const match of source.matchAll(/action: skill\n\s+resource: "([^"]+)"/g)) {
        const skill = match[1] ?? "";
        expect(statSync(path.join(skillsRoot, skill)).isDirectory(), `${name} -> ${skill}`).toBe(
          true,
        );
      }
    }
  });
});

describe("prompt fragments", () => {
  it("carries the build non-negotiables", () => {
    expect(CANON_BUILD_PROMPT).toContain("deep modules");
    expect(CANON_BUILD_PROMPT).toContain("no any");
    expect(CANON_BUILD_PROMPT).toContain("Authorize every object and action");
    expect(CANON_BUILD_PROMPT).toContain("never swallow");
  });

  it("carries the review order and evidence rule", () => {
    expect(CANON_REVIEW_PROMPT).toContain("severity");
    expect(CANON_REVIEW_PROMPT).toContain("file and line");
    expect(CANON_REVIEW_PROMPT).toContain("smallest safe fix");
    expect(CANON_REVIEW_PROMPT).toContain("did not verify");
  });
});
