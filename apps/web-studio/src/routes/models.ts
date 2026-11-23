import type { ModelInfo } from "@authenik8/models";

import { apiKeyFrom, sendJson } from "../http.js";
import { FALLBACK_MODEL, type RouteContext } from "../studio-types.js";

/**
 * Free, tool-capable model discovery. Keyless browsing is supported because
 * OpenRouter's catalog is public data; the key is only required to send.
 */
export async function handleModelRoutes(ctx: RouteContext): Promise<boolean> {
  const { deps, req, res, url } = ctx;
  if (url.pathname !== "/api/models" || req.method !== "GET") return false;

  const key = apiKeyFrom(req);
  // Zero-key browsing: OpenRouter's catalog is public data, so the list
  // loads with no key at all. The key is only ever required to SEND —
  // a developer must be able to come in, look at the models, and start
  // building before any registration.
  let all: ModelInfo[];
  if (key !== null) {
    try {
      all = await deps.gatewayFor(key).listModels();
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : "Model discovery failed" });
      return true;
    }
  } else if (deps.publicModels === undefined) {
    sendJson(res, 502, { error: "Keyless model browsing is not available in this deployment; add an OpenRouter key." });
    return true;
  } else {
    try {
      all = await deps.publicModels();
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : "Model discovery failed" });
      return true;
    }
  }
  const models = all.filter((model) => model.isFree && model.supportsTools);
  // Predictable default: the app-traffic-accepting auto-router first.
  const ranked = [
    ...models.filter((model) => model.id === FALLBACK_MODEL),
    ...models.filter((model) => model.id !== FALLBACK_MODEL),
  ];
  sendJson(res, 200, {
    models: ranked.map((model) => ({ id: model.id, name: model.name, contextLength: model.contextLength })),
  });
  return true;
}
