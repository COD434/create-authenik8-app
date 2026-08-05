import type {
  IdentityUser,
  OAuthIdentityAdapter,
} from "authenik8-core";
import type { OAuthAccount, User } from "@prisma/client";
import { prisma } from "../config/prisma.js";

type UserWithOAuthAccounts = User & {
  oauthAccounts: OAuthAccount[];
};

const includeOAuthAccounts = {
  oauthAccounts: true,
} as const;

function toIdentityUser(user: UserWithOAuthAccounts | null | undefined): IdentityUser | null {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role.toLowerCase(),
    providers: user.oauthAccounts.map((account) => ({
      provider: account.provider,
      providerId: account.providerAccountId,
    })),
  };
}

async function findUserById(userId: string): Promise<IdentityUser | null> {
  return toIdentityUser(await prisma.user.findUnique({
    where: { id: userId },
    include: includeOAuthAccounts,
  }));
}

async function findUserByEmail(email: string): Promise<IdentityUser | null> {
  return toIdentityUser(await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: includeOAuthAccounts,
  }));
}

async function findUserByProvider(provider: string, providerId: string): Promise<IdentityUser | null> {
  const account = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: providerId,
      },
    },
    include: {
      user: {
        include: includeOAuthAccounts,
      },
    },
  });
  return toIdentityUser(account?.user);
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
          name: "New user",
          emailVerifiedAt: new Date(),
          oauthAccounts: {
            create: {
              provider: data.provider,
              providerAccountId: data.providerId,
              providerEmail: email,
            },
          },
        },
        include: includeOAuthAccounts,
      });
      return {
        status: "created",
        user: toIdentityUser(user) as IdentityUser,
      };
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
    const existing = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: providerId,
        },
      },
    });
    if (existing && existing.userId !== userId) {
      throw new Error("Provider is already linked to another user");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    await prisma.oAuthAccount.upsert({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
      create: {
        userId,
        provider,
        providerAccountId: providerId,
        providerEmail: user.email,
      },
      update: {
        providerAccountId: providerId,
        providerEmail: user.email,
      },
    });
  },
} satisfies OAuthIdentityAdapter;
