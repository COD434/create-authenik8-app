import type { PlannedFileChange } from "./types.js";

type DiffOperation = { type: "equal" | "add" | "delete"; line: string };

function lines(source: string): string[] {
  const normalized = source.replace(/\r\n/g, "\n");
  const withoutFinalNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return withoutFinalNewline ? withoutFinalNewline.split("\n") : [];
}

function lineOperations(before: string, after: string): DiffOperation[] {
  const left = lines(before);
  const right = lines(after);
  if (left.length * right.length > 1_000_000) {
    return [
      ...left.map((line): DiffOperation => ({ type: "delete", line })),
      ...right.map((line): DiffOperation => ({ type: "add", line })),
    ];
  }

  const matrix = Array.from({ length: left.length + 1 }, () =>
    new Uint32Array(right.length + 1)
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex]![rightIndex] = left[leftIndex] === right[rightIndex]
        ? matrix[leftIndex + 1]![rightIndex + 1]! + 1
        : Math.max(matrix[leftIndex + 1]![rightIndex]!, matrix[leftIndex]![rightIndex + 1]!);
    }
  }

  const operations: DiffOperation[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      operations.push({ type: "equal", line: left[leftIndex]! });
      leftIndex += 1;
      rightIndex += 1;
    } else if (matrix[leftIndex + 1]![rightIndex]! >= matrix[leftIndex]![rightIndex + 1]!) {
      operations.push({ type: "delete", line: left[leftIndex]! });
      leftIndex += 1;
    } else {
      operations.push({ type: "add", line: right[rightIndex]! });
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) operations.push({ type: "delete", line: left[leftIndex++]! });
  while (rightIndex < right.length) operations.push({ type: "add", line: right[rightIndex++]! });
  return operations;
}

function redactEnvironmentLine(line: string): string {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (!match) return line;
  const name = match[1]?.trim() ?? "";
  if (/(?:SECRET|PASSWORD|TOKEN|PRIVATE|SIGNING_JWKS|CLIENT_ID)$/i.test(name)) {
    return `${name}=<redacted>`;
  }
  return line;
}

function hunkRanges(operations: readonly DiffOperation[], contextLines: number): Array<[number, number]> {
  const changed = operations
    .map((operation, index) => operation.type === "equal" ? -1 : index)
    .filter((index) => index >= 0);
  if (changed.length === 0) return [];

  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const start = Math.max(0, index - contextLines);
    const end = Math.min(operations.length, index + contextLines + 1);
    const previous = ranges.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else ranges.push([start, end]);
  }
  return ranges;
}

function positionsBefore(operations: readonly DiffOperation[]): Array<{ old: number; next: number }> {
  const result: Array<{ old: number; next: number }> = [];
  let old = 1;
  let next = 1;
  for (const operation of operations) {
    result.push({ old, next });
    if (operation.type !== "add") old += 1;
    if (operation.type !== "delete") next += 1;
  }
  result.push({ old, next });
  return result;
}

export function formatFileDiff(change: PlannedFileChange): string {
  const operations = lineOperations(change.before ?? "", change.after);
  const contextLines = change.sensitive ? 0 : 3;
  const ranges = hunkRanges(operations, contextLines);
  const positions = positionsBefore(operations);
  const suffix = change.sensitive ? " (sensitive values redacted)" : "";
  const beforeLabel = change.before === null ? "/dev/null" : `a/${change.relativePath}${suffix}`;
  const output = [`--- ${beforeLabel}`, `+++ b/${change.relativePath}${suffix}`];

  for (const [start, end] of ranges) {
    const oldCount = operations.slice(start, end).filter((item) => item.type !== "add").length;
    const newCount = operations.slice(start, end).filter((item) => item.type !== "delete").length;
    const position = positions[start] ?? { old: 1, next: 1 };
    const oldStart = change.before === null ? 0 : position.old;
    output.push(`@@ -${oldStart},${oldCount} +${position.next},${newCount} @@`);
    for (const operation of operations.slice(start, end)) {
      const prefix = operation.type === "add" ? "+" : operation.type === "delete" ? "-" : " ";
      const value = change.sensitive ? redactEnvironmentLine(operation.line) : operation.line;
      output.push(`${prefix}${value}`);
    }
  }
  return output.join("\n");
}

export function formatAddDiff(changes: readonly PlannedFileChange[]): string {
  return changes.map(formatFileDiff).join("\n\n");
}
