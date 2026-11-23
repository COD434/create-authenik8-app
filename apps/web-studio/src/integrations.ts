// Public integration API, re-exported from domain modules. Each concern lives
// in src/integrations/* so no single file owns the whole integration surface.
export { IntegrationError } from "./integrations/errors.js";
export type { FetchLike } from "./integrations/errors.js";

export type {
  SupabaseKeyKind,
  SupabaseKeyInfo,
  SupabaseTarget,
  DatabaseTarget,
} from "./integrations/supabase.js";
export {
  normalizeSupabaseUrl,
  supabaseKeyInfo,
  verifySupabase,
  parseDatabaseUrl,
} from "./integrations/supabase.js";

export type { EnvMergeResult, EnvWriteResult } from "./integrations/env.js";
export { mergeEnv, writeProjectEnv, envMap } from "./integrations/env.js";

export type { ProjectKind, ProjectProfile, IntegrationStatus } from "./integrations/profile.js";
export { projectProfile, readIntegrationStatus } from "./integrations/profile.js";

export type { StaticDeployFiles, VercelDeployResult, NetlifyDeployResult } from "./integrations/deploy.js";
export { collectStaticDeployFiles, deployStaticToVercel, deployStaticToNetlify } from "./integrations/deploy.js";
