import { describe, expect, it } from "vitest";

import { productionReadmeCommands } from "../../src/lib/packageManagerCommands.js";
import { renderPackageManagerReadme } from "../../src/steps/configureReadme.js";

const source = `# Generated project

\`\`\`bash
npm install
npm run docker:up
npm run db:migrate
npx prisma migrate deploy
npx create-authenik8-app@latest doctor
\`\`\`
`;

describe("generated README commands", () => {
  it("leaves npm guidance unchanged", () => {
    expect(renderPackageManagerReadme(source, "npm")).toBe(source);
  });

  it("renders pnpm commands consistently", () => {
    const rendered = renderPackageManagerReadme(source, "pnpm");

    expect(rendered).toContain("pnpm install");
    expect(rendered).toContain("pnpm run docker:up");
    expect(rendered).toContain("pnpm run db:migrate");
    expect(rendered).toContain("pnpm exec prisma migrate deploy");
    expect(rendered).toContain("pnpm dlx create-authenik8-app@latest doctor");
    expect(rendered).not.toMatch(/\bnpm (?:install|run)\b|\bnpx\b/);
  });

  it("renders Bun commands consistently", () => {
    const rendered = renderPackageManagerReadme(source, "bun");

    expect(rendered).toContain("bun install");
    expect(rendered).toContain("bun run docker:up");
    expect(rendered).toContain("bunx prisma migrate deploy");
    expect(rendered).toContain("bunx create-authenik8-app@latest doctor");
    expect(rendered).not.toMatch(/\bnpm (?:install|run)\b|\bnpx\b/);
  });

  it("uses the selected manager in the production appendix", () => {
    expect(productionReadmeCommands("pnpm")).toEqual({
      start: "pnpm run pm2:start",
      logs: "pnpm run pm2:logs",
      stop: "pnpm run pm2:stop",
    });
  });
});
