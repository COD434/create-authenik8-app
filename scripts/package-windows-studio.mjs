import { cp, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(root, "dist", "windows-studio");
const app = path.join(stage, "app");
const modules = path.join(app, "node_modules");
const runtime = path.join(stage, "runtime");

if (process.platform !== "win32") {
  throw new Error("The Windows Studio package must be staged on a Windows runner.");
}

await rm(stage, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
await mkdir(path.join(app, "packages", "create-authenik8-studio"), { recursive: true });
await mkdir(path.join(modules, "@authenik8"), { recursive: true });

const copyPackage = async (name, source, includePublic = false) => {
  const destination = path.join(modules, "@authenik8", name);
  await mkdir(destination, { recursive: true });
  await copyFile(path.join(source, "package.json"), path.join(destination, "package.json"));
  await cp(path.join(source, "dist"), path.join(destination, "dist"), { recursive: true });
  if (includePublic) await cp(path.join(source, "public"), path.join(destination, "public"), { recursive: true });
};

for (const [name, source] of [
  ["agent-adapter", "packages/agent-adapter"],
  ["design", "packages/design"],
  ["engineering-canon", "packages/engineering-canon"],
  ["models", "packages/models"],
  ["web-studio", "apps/web-studio"],
]) {
  await copyPackage(name, path.join(root, source), name === "web-studio");
}

// The server resolves this path relative to its packaged dist directory.
const marketing = path.join(modules, "@authenik8", "marketing");
await cp(path.join(root, "apps", "marketing", "dist"), marketing, { recursive: true });
await cp(path.join(root, "node_modules", "zod"), path.join(modules, "zod"), { recursive: true });

const launcherPackage = path.join(root, "packages", "create-authenik8-studio");
await copyFile(path.join(launcherPackage, "bin.mjs"), path.join(app, "packages", "create-authenik8-studio", "bin.mjs"));
await copyFile(path.join(launcherPackage, "package.json"), path.join(app, "packages", "create-authenik8-studio", "package.json"));
await copyFile(path.join(root, "apps", "desktop", "windows", "launcher.vbs"), path.join(stage, "launcher.vbs"));
await copyFile(path.join(root, "apps", "desktop", "windows", "stop-studio.vbs"), path.join(stage, "stop-studio.vbs"));
await writeFile(path.join(stage, "README.txt"), [
  "Authenik8 Studio for Windows (portable)",
  "",
  "Requirements: Windows 10 or later, 64-bit.",
  "",
  "Double-click launcher.vbs to start Studio. It opens in your browser at http://127.0.0.1:4870/studio.",
  "Double-click stop-studio.vbs to stop the local Studio server.",
  "",
  "Your projects are stored in Documents\\Authenik8 Studio\\workspace.",
  "Keep the extracted folder in place while using Studio.",
  "",
].join("\r\n"), "utf8");

// Node's colocated npm CLI is required to run imported projects from Studio.
const nodeDir = path.dirname(process.execPath);
await copyFile(process.execPath, path.join(runtime, "node.exe"));
await cp(path.join(nodeDir, "node_modules", "npm"), path.join(runtime, "node_modules", "npm"), { recursive: true });
for (const shim of ["npm.cmd", "npx.cmd"]) {
  await copyFile(path.join(nodeDir, shim), path.join(runtime, shim)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

console.log(`Staged Windows Studio at ${path.relative(root, stage)}`);
