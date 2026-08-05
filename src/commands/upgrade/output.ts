import type {
  UpgradeAcknowledgement,
  UpgradeAction,
  UpgradePlan,
} from "./types.js";

const actionSymbol: Record<UpgradeAction["kind"], string> = {
  required: "!",
  recommended: "-",
  blocked: "×",
};

export function upgradeHelp(): string {
  return `
AUTHENIK8 UPGRADE
Create a read-only, version-aware upgrade plan for a generated project

Usage:
  create-authenik8-app upgrade [directory] [options]

Options:
  --json             Print a stable machine-readable plan
  --check            Exit non-zero when an upgrade is pending or blocked
  --acknowledge      Update only verified generator and engine manifest versions
  -h, --help         Show this help message

Examples:
  npx create-authenik8-app upgrade
  npx create-authenik8-app upgrade ./my-app --json
  npx create-authenik8-app upgrade --check --json
  npx create-authenik8-app upgrade --acknowledge
`;
}

export function formatUpgradePlan(plan: UpgradePlan, json: boolean): string {
  if (json) return `${JSON.stringify(plan, null, 2)}\n`;
  const lines = [
    "",
    "Authenik8 upgrade plan",
    `${plan.preset} · ${plan.rootDir}`,
    "",
    `Generator  ${plan.versions.generator.project} → ${plan.versions.generator.target}`,
    `Engine     ${plan.versions.engine.manifest} → ${plan.versions.engine.target}`,
    `Status     ${plan.status}`,
    "",
  ];
  if (plan.actions.length === 0) {
    lines.push("No upgrade actions are required.", "");
    return lines.join("\n");
  }
  for (const action of plan.actions) {
    lines.push(`${actionSymbol[action.kind]} ${action.title}`, `  ${action.detail}`);
    if (action.command) lines.push(`  Run: ${action.command}`);
    if (action.references?.length) lines.push(`  Review: ${action.references.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function formatUpgradeAcknowledgement(
  result: UpgradeAcknowledgement,
  json: boolean,
): string {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  return [
    "",
    "Authenik8 upgrade acknowledgement",
    `${result.status} · ${result.rootDir}`,
    "",
    `Generator  ${result.previous.generator} → ${result.current.generator}`,
    `Engine     ${result.previous.engine} → ${result.current.engine}`,
    "",
    result.status === "acknowledged"
      ? "authenik8.json release metadata was updated atomically."
      : "authenik8.json already records the verified release.",
    "",
  ].join("\n");
}
