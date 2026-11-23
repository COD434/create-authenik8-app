export type User = {
  readonly id: string;
  readonly name: string;
};

export function displayName(user: User): string {
  return user.name.trim();
}
