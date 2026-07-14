import { env } from "./env.js";
import { logger } from "./logger.js";

async function sendEmail(to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is required for production email delivery");
    logger.info({ to, subject }, "Development email generated");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}`);
}

export function sendVerificationEmail(to: string, token: string) {
  const url = new URL("/verify-email", env.WEB_ORIGIN);
  url.searchParams.set("token", token);
  return sendEmail(to, "Verify your email", `<p>Confirm your Authenik8 account:</p><p><a href="${url}">Verify email</a></p>`);
}

export function sendPasswordResetEmail(to: string, token: string) {
  const url = new URL("/reset-password", env.WEB_ORIGIN);
  url.searchParams.set("token", token);
  return sendEmail(to, "Reset your password", `<p>A password reset was requested:</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes.</p>`);
}
