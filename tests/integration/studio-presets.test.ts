import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { describe, expect, it } from "vitest";

import { createStudioSnapshot } from "../../src/commands/studio/snapshot.js";
import { Dashboard } from "../../studio-src/App.js";
import {
  generateProjectFixture,
  type GenerateProjectOptions,
} from "../helpers/generator.js";

type PresetCase = {
  name: string;
  options: GenerateProjectOptions;
  capabilities: string[];
};

const presetCases: PresetCase[] = [
  {
    name: "base",
    options: { template: "base", usePrisma: false },
    capabilities: ["preset", "sessions"],
  },
  {
    name: "auth",
    options: { template: "auth", database: "sqlite" },
    capabilities: ["preset", "sessions", "prisma"],
  },
  {
    name: "auth-oauth",
    options: {
      template: "auth-oauth",
      database: "postgresql",
      oauthProviders: ["google", "github"],
    },
    capabilities: [
      "preset",
      "sessions",
      "prisma",
      "oauth-google",
      "oauth-github",
    ],
  },
  {
    name: "fullstack",
    options: {
      template: "fullstack",
      database: "postgresql",
      oauthProviders: ["google", "github"],
    },
    capabilities: [
      "preset",
      "sessions",
      "prisma",
      "oauth-google",
      "oauth-github",
    ],
  },
];

describe("Studio preset compatibility", () => {
  it.each(presetCases)(
    "builds and renders the same safe snapshot contract for $name",
    async ({ name, options, capabilities }) => {
      const project = await generateProjectFixture(options);

      try {
        const snapshot = await createStudioSnapshot(project.targetDir);
        expect(snapshot.project.preset).toBe(name);
        expect(snapshot.scan.mode).toBe("offline");
        expect(snapshot.productionReadiness.status).toBe("not-assessed");
        expect(snapshot.capabilities.map((capability) => capability.id)).toEqual(
          capabilities,
        );
        expect(snapshot.nextAction.label).not.toHaveLength(0);

        const serialized = JSON.stringify(snapshot);
        expect(serialized).not.toMatch(
          /AUTHENIK8_SIGNING_JWKS|DATABASE_URL|REDIS_URL|CLIENT_SECRET/,
        );

        const markup = renderToStaticMarkup(
          createElement(
            Theme,
            { theme: neutralTheme, mode: "dark" },
            createElement(Dashboard, { snapshot }),
          ),
        );
        expect(markup).toContain(project.state.projectName);
        expect(markup).toContain("Production readiness");
        expect(markup).toContain("What Studio can see");
      } finally {
        await project.cleanup();
      }
    },
  );
});
