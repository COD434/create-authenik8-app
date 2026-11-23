import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { envMap } from "./env.js";
import { normalizeSupabaseUrl, parseDatabaseUrl, supabaseKeyInfo, type SupabaseKeyKind } from "./supabase.js";

// ---------- project profile ----------

export type ProjectKind = "static" | "fullstack" | "server" | "empty";

export type ProjectProfile = {
  kind: ProjectKind;
  rootIndex: boolean;
};

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export async function projectProfile(sandboxRoot: string): Promise<ProjectProfile> {
  const rootIndex = await isFile(path.join(sandboxRoot, "index.html"));
  if (await isDirectory(path.join(sandboxRoot, "apps", "api"))) {
    return { kind: "fullstack", rootIndex };
  }
  if (rootIndex) return { kind: "static", rootIndex: true };
  if (await isFile(path.join(sandboxRoot, "package.json"))) {
    return { kind: "server", rootIndex: false };
  }
  return { kind: "empty", rootIndex: false };
}

export type IntegrationStatus = {
  supabase: {
    configured: boolean;
    url: string | null;
    keyKind: SupabaseKeyKind | null;
    databaseConfigured: boolean;
    databaseHost: string | null;
    databaseName: string | null;
    externalDatabase: boolean;
  };
  project: ProjectProfile;
};

export async function readIntegrationStatus(sandboxRoot: string): Promise<IntegrationStatus> {
  const raw = await readFile(path.join(sandboxRoot, ".env"), "utf8").catch(() => "");
  const env = envMap(raw);
  const configuredUrl = env.get("SUPABASE_URL") ?? "";
  let url: string | null = null;
  if (configuredUrl !== "") {
    try {
      url = normalizeSupabaseUrl(configuredUrl);
    } catch {
      url = null;
    }
  }
  const configuredKey = env.get("SUPABASE_ANON_KEY") ?? "";
  const keyInfo = configuredKey === "" ? null : supabaseKeyInfo(configuredKey);
  const keyKind = keyInfo !== null && (keyInfo.kind === "publishable" || keyInfo.kind === "anon")
    ? keyInfo.kind
    : null;
  let databaseHost: string | null = null;
  let databaseName: string | null = null;
  const configuredDatabase = env.get("DATABASE_URL") ?? "";
  if (configuredDatabase !== "") {
    try {
      const database = parseDatabaseUrl(configuredDatabase);
      databaseHost = database.host;
      databaseName = database.database;
    } catch {
      databaseHost = null;
      databaseName = null;
    }
  }
  return {
    supabase: {
      configured: url !== null && keyKind !== null,
      url,
      keyKind,
      databaseConfigured: databaseHost !== null,
      databaseHost,
      databaseName,
      externalDatabase: (env.get("AUTHENIK8_LOCAL_DATABASE") ?? "").toLowerCase() === "external",
    },
    project: await projectProfile(sandboxRoot),
  };
}
