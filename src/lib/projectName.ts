import { firstZodIssue, projectNameSchema } from "./schemas.js";

export function projectNameError(projectName: string): string | undefined {
  const result = projectNameSchema.safeParse(projectName);
  return result.success ? undefined : firstZodIssue(result.error);
}
