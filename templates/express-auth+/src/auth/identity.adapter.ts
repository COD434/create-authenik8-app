import type {
  IdentityUser,
  OAuthIdentityAdapter,
} from "authenik8-core";
import type { IdentityProvider, User } from "@prisma/client";
import { prisma } from "../prisma/client";

type UserWithIdentityProviders = User & {
  identityProviders: IdentityProvider[];
};

function toIdentityUser(user: UserWithIdentityProviders | null | undefined): IdentityUser | null {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: typeof user.role === "string" ? user.role.toLowerCase() : undefined,
    providers: user.identityProviders.map((identity) => ({
      provider: identity.provider,
      providerId: identity.providerId,
    })),
  };
}

const includeProviders = { identityProviders: true };

async function findUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: includeProviders,
  });
  return toIdentityUser(user);
}

async function findUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: includeProviders,
  });
  return toIdentityUser(user);
}

async function findUserByProvider(provider: string, providerId: string) {
  const identity = await prisma.identityProvider.findUnique({
    where: { provider_providerId: { provider, providerId } },
    include: { user: { include: includeProviders } },
  });
  return toIdentityUser(identity?.user);
}

export const identityAdapter = {
  findUserById,
  findUserByEmail,
  findUserByProvider,

  async createUser(data) {
    const email = data.email.trim().toLowerCase();
    try {
      const user = await prisma.user.create({
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
      return { status: "created", user: toIdentityUser(user) as IdentityUser };
    } catch (error) {
      const providerOwner = await findUserByProvider(data.provider, data.providerId);
      if (providerOwner) {
        return { status: "existing-provider", user: providerOwner };
      }
      const emailOwner = await findUserByEmail(email);
      if (emailOwner) {
        return { status: "existing-email", user: emailOwner };
      }
      throw error;
    }
  },

  async linkProvider(userId: string, provider: string, providerId: string) {
    const existing = await prisma.identityProvider.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });

    if (existing && existing.userId !== userId) {
      throw new Error("Provider is already linked to another user");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    await prisma.identityProvider.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, providerId },
      update: { providerId },
    });
  },
} satisfies OAuthIdentityAdapter;
