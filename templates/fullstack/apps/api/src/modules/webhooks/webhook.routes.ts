import { Router, type Request } from "express";
import { identifierSchema } from "@authenik8/contracts";
import { authenticate } from "../../middleware/authenticate.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import { webhookRepository } from "./webhook.repository.js";
import { requireWebhookAccess } from "./webhook.policy.js";
import {
  createWebhookController,
  deleteWebhookController,
  getWebhookController,
  listWebhookDeliveriesController,
  listWebhooksController,
  updateWebhookController,
} from "./webhook.controller.js";

export const webhookRoutes = Router();
// authenik8-core's global Redis-backed limiter runs before this router.
// codeql[js/missing-rate-limiting]
webhookRoutes.use(authenticate);

const loadWebhook = (req: Request) =>
  webhookRepository.findById(identifierSchema.parse(req.params.id));

webhookRoutes.get("/", listWebhooksController);
webhookRoutes.post("/", requireAllowedOrigin, requireCsrf, createWebhookController);
// Declarative resource policy (A8 policy DSL): the compiled middleware
// enforces ownership before the controller; the service re-checks.
webhookRoutes.get("/:id", requireWebhookAccess("read", loadWebhook), getWebhookController);
webhookRoutes.get(
  "/:id/deliveries",
  requireWebhookAccess("read", loadWebhook),
  listWebhookDeliveriesController,
);
webhookRoutes.patch(
  "/:id",
  requireAllowedOrigin,
  requireCsrf,
  requireWebhookAccess("write", loadWebhook),
  updateWebhookController,
);
webhookRoutes.delete(
  "/:id",
  requireAllowedOrigin,
  requireCsrf,
  requireWebhookAccess("write", loadWebhook),
  deleteWebhookController,
);
