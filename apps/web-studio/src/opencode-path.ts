import { statSync } from "node:fs";
import path from "node:path";

/**
 * Resolve a directly spawnable opencode executable, or null when nothing
 * verifiable exists. The agent runtime spawns with no shell, so npm's `.cmd`
 * shims never resolve on Windows — the underlying binary the shim wraps is
 * what must be handed to spawn (observed: `%APPDATA%\npm\opencode.cmd` is
 * just a pointer to `@opencode/cli/bin/opencode.exe`). OPENCODE_PATH is the
 * explicit override and is honored like any candidate: only when it exists.
 */
export function resolveOpenCodePath(
  env: NodeJS.ProcessEnv,
  home: string,
  platform: NodeJS.Platform,
): string | null {
  const candidates: string[] = [];
  const push = (candidate: string | undefined): void => {
    if (candidate !== undefined && candidate.length > 0) candidates.push(candidate);
  };

  push(env.OPENCODE_PATH);
  if (platform === "win32") {
    // npm global install layout: ...\npm\node_modules\@opencode\cli\bin\opencode.exe
    const appData = env.APPDATA ?? path.join(home, "AppData", "Roaming");
    push(path.join(appData, "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe"));
    // official installer layout: %USERPROFILE%\.opencode\bin\opencode.exe
    push(path.join(home, ".opencode", "bin", "opencode.exe"));
  } else {
    push(path.join(home, ".opencode", "bin", "opencode"));
  }

  for (const candidate of candidates) {
    try {
      statSync(candidate);
      return candidate;
    } catch (error) {
      void error; // not present: try the next known layout
    }
  }
  // Nothing verifiable: fall back to the bare command. A PATH-based spawn
  // works without a shell on POSIX; on Windows it fails closed with the
  // runtime_missing guidance now shown in the agent modal.
  return null;
}
