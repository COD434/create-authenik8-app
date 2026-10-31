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
  --explain          Explain the plan in prose without changing anything
  --acknowledge      Update only verified generator and engine manifest versions
  -h, --help         Show this help message

Examples:
  npx create-authenik8-app upgrade
  npx create-authenik8-app upgrade ./my-app --json
  npx create-authenik8-app upgrade --check --json
  npx create-authenik8-app upgrade --explain
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

export function formatUpgradeExplanation(plan: UpgradePlan): string {
  const generator = plan.versions.generator;
  const engine = plan.versions.engine;
  const lines: string[] = [
    "",
    "Authenik8 upgrade explanation",
    `${plan.preset} · ${plan.rootDir}`,
    "",
    `Who generated the project      create-authenik8-app ${generator.project}`,
    `What this CLI plans against    create-authenik8-app ${generator.target}`,
    `Manifest engine                authenik8-core ${engine.manifest}`,
    `Declared engine dependency     authenik8-core ${engine.declared}`,
    engine.installed
      ? `Installed engine               authenik8-core ${engine.installed}`
      : "Installed engine               not installed (dependency graph missing)",
    `Target engine contract         authenik8-core ${engine.target}`,
    `Status                         ${plan.status}`,
    "",
  ];
  if (plan.status === "current") {
    lines.push(
      "Every recorded version already matches this CLI's template contract, so",
      "no migration is planned and acknowledgement is unnecessary. Re-plan with",
      "a newer create-authenik8-app release when you adopt one.",
      "",
    );
    return lines.join("\n");
  }
  if (plan.status === "blocked") {
    lines.push(
      "A blocker below must be resolved before a safe upgrade path can be planned.",
      "Generator upgrades are never applied as source rewrites; every action is",
      "reviewed and run explicitly.",
      "",
      "Ordered actions",
      "",
    );
  } else {
    lines.push(
      "Complete the ordered actions below, then update authenik8.json as the",
      "final audited change.",
      "",
      "Generator upgrades are never applied as source rewrites; every action is",
      "reviewed and run explicitly.",
      "",
      "Ordered actions",
      "",
    );
  }
  plan.actions.forEach((action, index) => {
    lines.push(`${index + 1}. ${actionSymbol[action.kind]} ${action.kind}: ${action.title}`);
    lines.push(`     ${action.detail}`);
    if (action.command) lines.push(`     Run: ${action.command}`);
    if (action.references?.length) {
      lines.push(`     Review: ${action.references.join(", ")}`);
    }
  });
  lines.push(
    "",
    "authenik8.json is updated last (--acknowledge) and only after the deep",
    "Doctor run and the installed identity engine agree with the plan.",
    "",
  );
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
