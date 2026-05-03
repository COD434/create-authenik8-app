import os from "os";
import type { PackageManager } from "../steps/installDeps.js";
import { execSync } from "child_process";

const platform = os.platform();

const isTermux =
  process.env.PREFIX?.includes("com.termux") || process.env.TERMUX === "true";

export function getBestHashLib(pm:PackageManager): string {
if (pm !== "npm") return "bcryptjs";
  if (isTermux) return "bcryptjs";
  if (platform === "win32") return "bcryptjs";
  if (platform === "darwin") return "argon2";
  if (platform === "linux") return "argon2";
  try {
      execSync("node-gyp --version", { stdio: "ignore" });
      return "argon2";
    } catch {
      return "bcryptjs";
    }
  return "bcryptjs";
}

export function generateHashModule(hashLib: "argon2" | "bcryptjs"): string {
  if (hashLib === "argon2") {
    return `
import argon2 from "argon2";

export const hashPassword = (password: string) => {
return argon2.hash(password);
};

export const comparePassword = (password: string, hash: string) => {
return argon2.verify(hash, password);
};
`;
  }

  return `
import bcrypt from "bcryptjs";

export const hashPassword = (password: string) => {
return bcrypt.hash(password, 10);
};

export const comparePassword = (password: string, hash: string) => {
return bcrypt.compare(password, hash);
};
`;
}
