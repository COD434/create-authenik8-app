import type { User } from "@prisma/client";

export function presentUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    verified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
