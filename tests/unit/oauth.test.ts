import { describe, expect, it } from "vitest";

import {
  ensureOAuthEnvironment,
  filterOAuthEnvironment,
  supportedOAuthProviders,
} from "../../src/lib/oauth.js";

describe("OAuth generation configuration", () => {
  it("keeps only supported provider selections", () => {
    expect(supportedOAuthProviders(["github", "unsupported", "google"]))
      .toEqual(["github", "google"]);
  });

  it("keeps environment variables only for generated providers", () => {
    const source = [
      "DATABASE_URL=file:./dev.db",
      "AUTHENIK8_OAUTH_PROVIDERS=google,github",
      "GOOGLE_CLIENT_ID=google-id",
      "GOOGLE_CLIENT_SECRET=google-secret",
      "GITHUB_CLIENT_ID=github-id",
      "GITHUB_CLIENT_SECRET=github-secret",
      "",
    ].join("\r\n");

    expect(filterOAuthEnvironment(source, ["github"])).toBe([
      "DATABASE_URL=file:./dev.db",
      "GITHUB_CLIENT_ID=github-id",
      "GITHUB_CLIENT_SECRET=github-secret",
      "",
    ].join("\n"));
  });

  it("adds only missing provider keys without touching existing credentials", () => {
    const source = [
      "DATABASE_URL=file:./dev.db",
      "GITHUB_CLIENT_ID=already-configured",
      "",
    ].join("\n");

    const result = ensureOAuthEnvironment(source, "github", "express");
    expect(result).toContain("GITHUB_CLIENT_ID=already-configured");
    expect(result.match(/GITHUB_CLIENT_ID=/g)).toHaveLength(1);
    expect(result).toContain('GITHUB_CLIENT_SECRET="change-me-github-client-secret"');
    expect(result).toContain('GITHUB_REDIRECT_URI="http://localhost:3000/auth/github/callback"');
  });
});
