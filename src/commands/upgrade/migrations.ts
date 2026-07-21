import { parseSemanticVersion } from "../../lib/semver.js";
import type { UpgradeAction } from "./types.js";

/** Security-significant engine boundaries that require an explicit human review. */
export function coreMigrationActions(from: string, to: string): UpgradeAction[] {
  const source = parseSemanticVersion(from);
  const target = parseSemanticVersion(to);
  if (!source || !target) return [];

  if (source.major < 2 && target.major >= 2) {
    return [{
      id: "engine.es256-v2",
      kind: "required",
      title: "Migrate the identity engine to the v2 security contract",
      detail: [
        "Replace legacy shared-secret JWT configuration with a persisted ES256 P-256 key ring, active kid, issuer, and audience.",
        "Also audit asynchronous token verification, purpose-bound claims, Redis-backed OAuth state, and agent identity boundaries before changing the dependency.",
      ].join(" "),
      references: ["authenik8-core CHANGELOG.md: 2.0.0", "THREAT_MODEL.md", "AGENT_IDENTITY.md"],
    }];
  }
  return [];
}
