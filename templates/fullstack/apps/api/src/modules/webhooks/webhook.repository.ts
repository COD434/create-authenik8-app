import type { Prisma, Webhook, WebhookDelivery } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

type DeliveryResult = {
  status: "DELIVERED" | "PENDING" | "FAILED";
  respondedAt?: Date;
  lastStatus?: number | null;
  lastError?: string | null;
  attempts?: number;
  nextAttemptAt?: Date;
};

export type DueDelivery = WebhookDelivery & { webhook: Webhook };

export const webhookRepository = {
  list(where: Prisma.WebhookWhereInput): Promise<Webhook[]> {
    return prisma.webhook.findMany({ where, orderBy: { createdAt: "desc" } });
  },
  findById(id: string): Promise<Webhook | null> {
    return prisma.webhook.findUnique({ where: { id } });
  },
  countByUser(userId: string): Promise<number> {
    return prisma.webhook.count({ where: { userId } });
  },
  create(data: Prisma.WebhookUncheckedCreateInput): Promise<Webhook> {
    return prisma.webhook.create({ data });
  },
  update(id: string, data: Prisma.WebhookUncheckedUpdateInput): Promise<Webhook> {
    return prisma.webhook.update({ where: { id }, data });
  },
  remove(id: string): Promise<Webhook> {
    return prisma.webhook.delete({ where: { id } });
  },
  findActiveSubscribers(event: string): Promise<Array<{ id: string }>> {
    return prisma.webhook.findMany({
      where: { active: true, events: { has: event } },
      select: { id: true },
    });
  },
  createDeliveries(data: Prisma.WebhookDeliveryUncheckedCreateInput[]): Promise<number> {
    return prisma.webhookDelivery.createMany({ data }).then((result) => result.count);
  },
  findDueDeliveries(now: Date, maxAttempts: number, limit: number): Promise<DueDelivery[]> {
    return prisma.webhookDelivery.findMany({
      where: {
        status: "PENDING",
        attempts: { lt: maxAttempts },
        nextAttemptAt: { lte: now },
      },
      take: limit,
      orderBy: { nextAttemptAt: "asc" },
      include: { webhook: true },
    });
  },
  recordDelivery(id: string, result: DeliveryResult): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.update({ where: { id }, data: result });
  },
  paginateDeliveries(
    webhookId: string,
    page: number,
    pageSize: number,
    statuses?: WebhookDelivery["status"][],
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    // One shared where clause so the page slice and the total always count
    // the same filtered set, fenced to the authorized webhook.
    const where: Prisma.WebhookDeliveryWhereInput = {
      webhookId,
      ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
    };
    return prisma
      .$transaction([
        prisma.webhookDelivery.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.webhookDelivery.count({ where }),
      ])
      .then(([deliveries, total]) => ({ deliveries, total }));
  },
};
