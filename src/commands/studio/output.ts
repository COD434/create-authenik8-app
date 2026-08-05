import type { StudioOptions } from "./types.js";

export function studioHelp(): string {
  return `
AUTHENIK8 STUDIO
Open a local, read-only security dashboard for a generated project

Usage:
  create-authenik8-app studio [directory] [options]

Options:
  --port <number>    Loopback port to use (default: 5558)
  --no-open          Start Studio without opening a browser
  -h, --help         Show this help message

Examples:
  npx create-authenik8-app@latest studio
  npx create-authenik8-app@latest studio ./my-app --port 5559
  npx create-authenik8-app@latest studio --no-open
`;
}

export function formatStudioStarted(
  url: string,
  options: StudioOptions,
): string {
  return [
    "",
    "Authenik8 Studio",
    `${options.directory}`,
    "",
    `Local dashboard: ${url}`,
    "Snapshot: point-in-time, offline, and read-only; no .env secrets or live services are read.",
    "Refresh: stop and rerun Studio after project changes.",
    "Press Ctrl+C to stop Studio.",
    "",
  ].join("\n");
}
