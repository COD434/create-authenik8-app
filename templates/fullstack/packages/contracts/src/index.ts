import { z } from "zod";

const normalizedSingleLine = (minimum: number, maximum: number) => z.string()
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/g, " "))
  .pipe(z.string().min(minimum).max(maximum))
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Remove unsupported control characters");

const normalizedDescription = z.string()
  .transform((value) => value.normalize("NFKC").replace(/\r\n?/g, "\n").trim())
  .pipe(z.string().max(2000))
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported control characters");

export const roleSchema = z.enum(["USER", "ADMIN"]);
export const userStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
export const projectStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export const oauthProviderSchema = z.enum(["google", "github"]);
export const identifierSchema = z.string().trim().uuid("A valid identifier is required");
export const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
export const csrfTokenSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/, "A valid CSRF token is required");

const emailSchema = z.string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

const passwordSchema = z.string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Password contains unsupported control characters");

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const registerSchema = z.strictObject({
  name: normalizedSingleLine(2, 80),
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.strictObject({ email: emailSchema });

export const resetPasswordSchema = z.strictObject({
  token: z.string().trim().min(32).max(256),
  password: passwordSchema,
});

export const verificationSchema = z.strictObject({ token: z.string().trim().min(32).max(256) });
export const oauthExchangeSchema = z.strictObject({ code: z.string().trim().min(32).max(256) });
export const oauthLinkQuerySchema = z.strictObject({ ticket: z.string().trim().min(32).max(256) });

export const profileSchema = z.strictObject({
  name: normalizedSingleLine(2, 80),
});

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const projectCreateSchema = z.strictObject({
  name: normalizedSingleLine(2, 120),
  description: normalizedDescription.default(""),
  status: projectStatusSchema.default("DRAFT"),
});

export const projectUpdateSchema = projectCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field",
);

export const adminUserUpdateSchema = z.strictObject({
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined, "Provide a role or status");

export type Role = z.infer<typeof roleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;
export type CsrfToken = z.infer<typeof csrfTokenSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  verified: boolean;
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};

export type LinkedProvider = {
  provider: OAuthProvider;
  providerEmail: string;
  linkedAt: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  actorEmail: string | null;
  targetType: string;
  targetId: string | null;
  createdAt: string;
};

export type AuthResponse = { accessToken: string; user: User };
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string[]> };
  requestId?: string;
};
