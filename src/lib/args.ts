import { z } from "zod";
import { firstZodIssue, packageManagerSchema } from "./schemas.js";
import type { PackageManager } from "./types.js";

const cliArgumentsSchema = z.strictObject({
  projectName: z.string().optional(),
  help: z.boolean(),
  version: z.boolean(),
  resume: z.boolean(),
  skipInstall: z.boolean(),
  productionReady: z.boolean(),
  packageManager: packageManagerSchema.optional(),
});

export type CliArguments = z.infer<typeof cliArgumentsSchema>;

const positionalArgumentsSchema = z.array(z.string()).max(1, {
  error: (issue) => {
    const values = Array.isArray(issue.input) ? issue.input : [];
    return `Unexpected argument "${String(values[1] ?? "")}". Only one project name is allowed.`;
  },
});

function parsePackageManager(value: string | undefined): PackageManager {
  const result = packageManagerSchema.safeParse(value);
  if (!result.success) throw new Error(firstZodIssue(result.error));
  return result.data;
}

export function parseCliArguments(argv: string[]): CliArguments {
  const parsed: CliArguments = {
    help: false,
    version: false,
    resume: false,
    skipInstall: false,
    productionReady: false,
  };
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;

    if (argument === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      parsed.version = true;
      continue;
    }
    if (argument === "--resume") {
      parsed.resume = true;
      continue;
    }
    if (argument === "--no-install" || argument === "--noInstall") {
      parsed.skipInstall = true;
      continue;
    }
    if (argument === "--production-ready") {
      parsed.productionReady = true;
      continue;
    }
    if (argument === "--package-manager") {
      const value = argv[index + 1];
      parsed.packageManager = parsePackageManager(value?.startsWith("-") ? undefined : value);
      index += 1;
      continue;
    }
    if (argument.startsWith("--package-manager=")) {
      parsed.packageManager = parsePackageManager(argument.slice("--package-manager=".length));
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option "${argument}". Run with --help for usage.`);
    }

    positionals.push(argument);
  }

  const positionalResult = positionalArgumentsSchema.safeParse(positionals);
  if (!positionalResult.success) {
    throw new Error(firstZodIssue(positionalResult.error));
  }

  if (positionalResult.data[0]) parsed.projectName = positionalResult.data[0];
  return cliArgumentsSchema.parse(parsed);
}
