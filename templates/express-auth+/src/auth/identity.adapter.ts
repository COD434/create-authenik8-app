import { prisma } from "../prisma/client";

type ProviderIdentity = {
  provider: string;
  providerId: string;
};

type IdentityUser = {
  id: string;
  email: string;
  role?: string;
  providers: ProviderIdentity[];
};

const db = prisma as any;

function toIdentityUser(user: any): IdentityUser | null {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: typeof user.role === "string" ? user.role.toLowerCase() : undefined,
    providers: (user.identityProviders ?? []).map((identity: ProviderIdentity) => ({
      provider: identity.provider,
      providerId: identity.providerId,
    })),
  };
}

const includeProviders = { identityProviders: true };

export const identityAdapter = {
  async findUserByEmail(email: string) {
    const user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: includeProviders,
    });
    return toIdentityUser(user);
  },

  async findUserByProvider(provider: string, providerId: string) {
    const identity = await db.identityProvider.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: { include: includeProviders } },
    });
    return toIdentityUser(identity?.user);
  },

  async createUser(data: { email: string; provider: string; providerId: string }) {
    const email = data.email.trim().toLowerCase();
    const existing = await this.findUserByEmail(email);
    if (existing) return existing;

    const user = await db.user.create({
      data: {
        email,
        password: null,
        verified: true,
        identityProviders: {
          create: { provider: data.provider, providerId: data.providerId },
        },
      },
      include: includeProviders,
    });

    return toIdentityUser(user) as IdentityUser;
  },

  async linkProvider(userId: string, provider: string, providerId: string) {
    const existing = await db.identityProvider.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });

    if (existing && existing.userId !== userId) {
      throw new Error("Provider is already linked to another user");
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    await db.identityProvider.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, providerId },
      update: { providerId },
    });
  },
};
