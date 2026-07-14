import { createHash, randomBytes } from "node:crypto";

export const randomToken = () => randomBytes(32).toString("hex");
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
