import { BundleLoadError, loadDesignSystem, TOKENS_FILENAME, type DesignSystemBundle } from "./bundle.js";
import { contrastRatio, contrastThreshold, type TextKind } from "./contrast.js";
import { resolveColorRef, tokenHexValues, type DesignTokens } from "./tokens.js";

/**
 * Doctor-style consistency checks with stable IDs (A8-DS-###). Each finding
 * is structured: stable id, pass/fail/warn status, message, and remediation
 * guidance for failures. `exitCodeFor` maps findings to the doctor exit-code
 * policy: 0 when nothing failed, 1 when any check failed (warnings pass).
 *
 * Checks:
 * - A8-DS-001  tokens.json parses against the design tokens schema
 * - A8-DS-002  required token groups are present and non-empty
 * - A8-DS-003  declared WCAG AA contrast pairs meet their thresholds
 * - A8-DS-004  hex colors referenced in DESIGN.md exist in tokens.json
 */

export type FindingStatus = "pass" | "fail" | "warn";

export type DesignFinding = {
  id: string;
  title: string;
  status: FindingStatus;
  message: string;
  remediation?: string;
};

export type DesignCheckResult = {
  ok: boolean;
  directory: string;
  findings: DesignFinding[];
};

export const DESIGN_CHECK_IDS = {
  schema: "A8-DS-001",
  requiredGroups: "A8-DS-002",
  contrastAA: "A8-DS-003",
  designMdSync: "A8-DS-004",
} as const;

export function exitCodeFor(findings: Array<DesignFinding>): 0 | 1 {
  return findings.some((finding) => finding.status === "fail") ? 1 : 0;
}

function checkRequiredGroups(tokens: DesignTokens): DesignFinding {
  const missing: string[] = [];
  if (Object.keys(tokens.color.groups).length === 0) missing.push("color.groups");
  if (tokens.color.contrastPairs.length === 0) missing.push("color.contrastPairs");
  if (Object.keys(tokens.typography.scale).length === 0) missing.push("typography.scale");
  if (Object.keys(tokens.spacing.scale).length === 0) missing.push("spacing.scale");

  if (missing.length === 0) {
    return {
      id: DESIGN_CHECK_IDS.requiredGroups,
      title: "Required token groups",
      status: "pass",
      message: "color groups, contrast pairs, typography scale, and spacing scale are present",
    };
  }
  return {
    id: DESIGN_CHECK_IDS.requiredGroups,
    title: "Required token groups",
    status: "fail",
    message: `Missing required token groups: ${missing.join(", ")}`,
    remediation: `Add the missing groups to tokens.json: ${missing.join(", ")}`,
  };
}

function checkContrastPairs(tokens: DesignTokens): DesignFinding {
  const failures: string[] = [];
  for (const [index, pair] of tokens.color.contrastPairs.entries()) {
    const foreground = resolveColorRef(tokens, pair.foreground);
    const background = resolveColorRef(tokens, pair.background);
    if (foreground === null || background === null) {
      const badRef = foreground === null ? pair.foreground : pair.background;
      failures.push(
        `pair ${index}: reference "${badRef}" does not resolve to a token`,
      );
      continue;
    }
    const kind: TextKind = pair.kind;
    const ratio = contrastRatio(foreground, background);
    const threshold = contrastThreshold(kind);
    if (ratio < threshold) {
      failures.push(
        `pair ${index}: ${pair.foreground} on ${pair.background} is ${ratio.toFixed(2)}:1, below the WCAG AA ${threshold}:1 threshold for ${kind} text`,
      );
    }
  }

  if (failures.length === 0) {
    return {
      id: DESIGN_CHECK_IDS.contrastAA,
      title: "WCAG AA contrast pairs",
      status: "pass",
      message: `All ${tokens.color.contrastPairs.length} contrast pairs meet their WCAG 2.1 AA thresholds`,
    };
  }
  return {
    id: DESIGN_CHECK_IDS.contrastAA,
    title: "WCAG AA contrast pairs",
    status: "fail",
    message: failures.join("; "),
    remediation:
      "Raise the contrast of the failing foreground/background pairs to meet WCAG 2.1 AA (4.5:1 body, 3:1 large) and record the pair in color.contrastPairs",
  };
}

function checkDesignMdSync(bundle: DesignSystemBundle): DesignFinding {
  if (bundle.designMd === null) {
    return {
      id: DESIGN_CHECK_IDS.designMdSync,
      title: "DESIGN.md ↔ tokens sync",
      status: "warn",
      message: `No ${"DESIGN.md"} in the bundle; sync check skipped`,
      remediation: "Add DESIGN.md documenting the brand (palette, typography, voice) so agents can read it",
    };
  }

  const referenced = new Set<string>(
    (bundle.designMd.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => hex.toUpperCase()),
  );
  const defined = tokenHexValues(bundle.tokens);
  const undefined_ = [...referenced].filter((hex) => !defined.has(hex));

  if (undefined_.length === 0) {
    return {
      id: DESIGN_CHECK_IDS.designMdSync,
      title: "DESIGN.md ↔ tokens sync",
      status: "pass",
      message: `All ${referenced.size} hex colors referenced in DESIGN.md exist in tokens.json`,
    };
  }
  return {
    id: DESIGN_CHECK_IDS.designMdSync,
    title: "DESIGN.md ↔ tokens sync",
    status: "fail",
    message: `DESIGN.md references colors missing from tokens.json: ${undefined_.join(", ")}`,
    remediation: "Add the missing colors to tokens.json (or fix the hex codes in DESIGN.md) so the brand spec and tokens agree",
  };
}

export async function runDesignChecks(directory: string): Promise<DesignCheckResult> {
  let bundle: DesignSystemBundle;
  try {
    bundle = await loadDesignSystem(directory);
  } catch (error) {
    const message = error instanceof BundleLoadError
      ? error.message
      : `Bundle could not be loaded: ${error instanceof Error ? error.message : String(error)}`;
    const findings: Array<DesignFinding> = [{
      id: DESIGN_CHECK_IDS.schema,
      title: "Design tokens schema",
      status: "fail",
      message,
      remediation: `Create a valid ${"tokens.json"} (schema version 1) in the design-system directory`,
    }];
    return { ok: false, directory, findings };
  }

  const schemaFinding: DesignFinding = {
    id: DESIGN_CHECK_IDS.schema,
    title: "Design tokens schema",
    status: "pass",
    message: `${TOKENS_FILENAME} parsed against the design tokens schema (version ${bundle.tokens.schemaVersion})`,
  };

  const findings: Array<DesignFinding> = [
    schemaFinding,
    checkRequiredGroups(bundle.tokens),
    checkContrastPairs(bundle.tokens),
    checkDesignMdSync(bundle),
  ];

  return {
    ok: exitCodeFor(findings) === 0,
    directory: bundle.directory,
    findings,
  };
}

/** Compact text rendering for CLI/agent consumption. */
export function formatFindings(result: DesignCheckResult): string {
  const lines: Array<string> = [];
  for (const finding of result.findings) {
    const mark = finding.status === "pass" ? "✓" : finding.status === "warn" ? "!" : "✗";
    lines.push(`${mark} ${finding.id} ${finding.title}: ${finding.message}`);
    if (finding.remediation && finding.status === "fail") {
      lines.push(`  fix: ${finding.remediation}`);
    }
  }
  lines.push(result.ok ? "design checks passed" : "design checks failed");
  return lines.join("\n");
}
