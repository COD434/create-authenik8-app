import { z } from "zod";

export const exactHttpOriginSchema = z.string()
  .url()
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      context.addIssue({ code: "custom", message: "must use http or https" });
    }
    if (url.username || url.password) {
      context.addIssue({ code: "custom", message: "must not include credentials" });
    }
    if (!["", "/"].includes(url.pathname) || url.search || url.hash) {
      context.addIssue({
        code: "custom",
        message: "must be an exact origin without a path, query string, or fragment",
      });
    }
  })
  .transform((value) => new URL(value).origin);
