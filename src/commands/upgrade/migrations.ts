import { parseSemanticVersion } from "../../lib/semver.js";
import type { UpgradeAction } from "./types.js";

/** Security-significant engine boundaries that require an explicit human review. */
export function coreMigrationActions(from: string, to: string): UpgradeAction[] {
  const source = parseSemanticVersion(from);
  const target = parseSemanticVersion(to);
  if (!source || !target) return [];

  const actions: UpgradeAction[] = [];
  if (source.major < 2 && target.major >= 2) {
    actions.push({
      id: "engine.es256-v2",
      kind: "required",
      title: "Migrate the identity engine to the v2 security contract",
      detail: [
        "Replace legacy shared-secret JWT configuration with a persisted ES256 P-256 key ring, active kid, issuer, and audience.",
        "Also audit asynchronous token verification, purpose-bound claims, Redis-backed OAuth state, and agent identity boundaries before changing the dependency.",
      ].join(" "),
      references: ["authenik8-core CHANGELOG.md: 2.0.0", "THREAT_MODEL.md", "AGENT_IDENTITY.md"],
    });
  }

  const sourceBeforeHardening =
    source.major < 2 ||
    (source.major === 2 && source.minor === 0 && source.patch < 4);
  const targetIncludesHardening =
    target.major > 2 ||
    (target.major === 2 && (target.minor > 0 || target.patch >= 4));
  if (sourceBeforeHardening && targetIncludesHardening) {
    actions.push({
      id: "engine.hardening-v2.0.4",
      kind: "required",
      title: "Review the hardened v2 integration contract",
      detail: [
        "Replace blanket proxy trust with explicit trustedProxyCidrs.",
        "Update custom OAuth identity adapters with findUserById() and tagged createUser() outcomes, and ensure custom OAuth state stores consume state atomically with take().",
        "Plan for existing Redis sessions to be invalidated by the namespaced key layout, and replace any package deep imports with the reviewed root API.",
      ].join(" "),
      references: ["authenik8-core CHANGELOG.md: Upgrade notes", "docs/authenik8-core.md", "THREAT_MODEL.md"],
    });
  }

  return actions;
}
