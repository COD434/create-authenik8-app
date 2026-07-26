export type SemanticVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
};

export type VersionOrder = "older" | "equal" | "newer" | "invalid";

export function parseSemanticVersion(value: string): SemanticVersion | undefined {
  const match = value.trim().match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] ? { prerelease: match[4] } : {}),
  };
}

export function compareSemanticVersions(leftValue: string, rightValue: string): VersionOrder {
  const left = parseSemanticVersion(leftValue);
  const right = parseSemanticVersion(rightValue);
  if (!left || !right) return "invalid";

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] < right[key]) return "older";
    if (left[key] > right[key]) return "newer";
  }
  if (left.prerelease === right.prerelease) return "equal";
  if (!left.prerelease) return "newer";
  if (!right.prerelease) return "older";

  const leftParts = left.prerelease.split(".");
  const rightParts = right.prerelease.split(".");
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return "older";
    if (rightPart === undefined) return "newer";
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) < Number(rightPart) ? "older" : "newer";
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? "older" : "newer";
    return leftPart < rightPart ? "older" : "newer";
  }
  return "equal";
}
