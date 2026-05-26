import type { PackageManager } from "../steps/installDeps.js";

export function getBestHashLib(_pm: PackageManager): "bcryptjs" {
  return "bcryptjs";
}

export function generateHashModule(_hashLib: "bcryptjs"): string {
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
