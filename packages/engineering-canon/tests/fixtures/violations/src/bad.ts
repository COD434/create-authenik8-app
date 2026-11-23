const apiKey = "sk-abcdefghijklmnopqrstuvwx";

export function read(value: any): number {
  try {
    return Number(value);
  } catch {
  }
}

export function storeToken(): void {
  localStorage.setItem("authToken", "secret");
}

export function render(input: string): void {
  document.body.innerHTML = input;
}

export function lookup(id: string): string {
  return db.query(`SELECT * FROM users WHERE id = ${id}`);
}

export function hash(password: string): string {
  return crypto.createHash("sha1").update(password).digest("hex");
}

export function verify(token: string, key: string): void {
  jwt.verify(token, key, { algorithms: ["none"] });
}

export function cors(res: { setHeader: (name: string, value: string) => void }): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

export function randomToken(): string {
  return `${Math.random().toString(36)}token`;
}
