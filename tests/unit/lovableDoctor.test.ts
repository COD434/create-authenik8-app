import { describe, expect, it } from "vitest";

import {
  LovableDoctorUsageError,
  parseLovableDoctorArguments,
} from "../../src/commands/lovableDoctor/index.js";

describe("Lovable Doctor command", () => {
  it("parses the explicit target and forwards runtime options", () => {
    expect(parseLovableDoctorArguments([
      "frontend",
      "--target",
      "lovable",
      "./frontend",
      "--json",
      "--runtime",
      "--api-url",
      "https://api.example.com",
      "--origin",
      "https://app.example.com",
    ])).toMatchObject({
      directory: expect.stringMatching(/frontend$/),
      forwardedArguments: [
        "--json",
        "--runtime",
        "--api-url",
        "https://api.example.com",
        "--origin",
        "https://app.example.com",
      ],
    });
  });

  it.each([
    [["frontend"], "target lovable is required"],
    [["frontend", "--target", "supabase"], "target lovable is required"],
    [["frontend", "--target"], "target requires lovable"],
    [["frontend", "--target", "lovable", "--unknown"], "Unknown"],
  ])("rejects unsupported command shapes %#", (args, message) => {
    expect(() => parseLovableDoctorArguments(args)).toThrowError(LovableDoctorUsageError);
    expect(() => parseLovableDoctorArguments(args)).toThrow(message);
  });
});
