export type RootCommand =
  | { name: "create"; args: string[] }
  | { name: "doctor"; args: string[] }
  | { name: "add"; args: string[] }
  | { name: "upgrade"; args: string[] };

export function resolveRootCommand(args: readonly string[]): RootCommand {
  const [command, ...rest] = args;

  if (command === "doctor") {
    return { name: "doctor", args: rest };
  }

  if (command === "add") {
    return { name: "add", args: rest };
  }

  if (command === "upgrade") {
    return { name: "upgrade", args: rest };
  }

  if (command === "create") {
    return { name: "create", args: rest };
  }

  return { name: "create", args: [...args] };
}
