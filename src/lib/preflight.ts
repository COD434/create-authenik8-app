function parseNodeVersion(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  return [major, minor, patch];
}

export function supportsFullstackPreset(version = process.versions.node): boolean {
  const [major, minor] = parseNodeVersion(version);
  if (major === 20) return minor >= 19;
  if (major === 22) return minor >= 12;
  return major >= 24;
}

export function assertPresetRequirements(
  _authMode: string | undefined,
  _usePrisma = false,
  version = process.versions.node,
): void {
  if (supportsFullstackPreset(version)) return;

  throw new Error(
    `Authenik8 requires Node.js 20.19+, 22.12+, or 24+. Current version: ${version}.`,
  );
}
