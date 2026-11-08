import { asyncHandler } from "../../utils/http.js";
import { identifierSchema } from "@authenik8/contracts";
import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  updateWebhook,
} from "./webhook.service.js";

const actor = (user: NonNullable<Express.Request["user"]>) => ({ userId: user.userId, role: user.role });

export const listWebhooksController = asyncHandler(async (req, res) => {
  res.json({ webhooks: await listWebhooks(actor(req.user!)) });
});
export const getWebhookController = asyncHandler(async (req, res) => {
  res.json({ webhook: await getWebhook(actor(req.user!), identifierSchema.parse(req.params.id)) });
});
export const createWebhookController = asyncHandler(async (req, res) => {
  // The signing secret is delivered exactly once, in this response.
  res.status(201).json(await createWebhook(actor(req.user!), req.body));
});
export const updateWebhookController = asyncHandler(async (req, res) => {
  res.json({ webhook: await updateWebhook(actor(req.user!), identifierSchema.parse(req.params.id), req.body) });
});
export const deleteWebhookController = asyncHandler(async (req, res) => {
  await deleteWebhook(actor(req.user!), identifierSchema.parse(req.params.id));
  res.status(204).send();
});
