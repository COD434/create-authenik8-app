import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findValidatorScript,
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

  describe("validator script trust boundary (CWE-94 regression)", () => {
    let previousCwd: string | undefined;
    const temporaryRoots: string[] = [];

    afterEach(async () => {
      if (previousCwd !== undefined) {
        process.chdir(previousCwd);
        previousCwd = undefined;
      }
      await Promise.all(temporaryRoots.splice(0).map((root) => fs.remove(root)));
    });

    async function plantValidator(root: string): Promise<string> {
      const script = path.join(root, "scripts", "doctor-lovable.mjs");
      await fs.ensureDir(path.dirname(script));
      await fs.writeFile(script, "console.log('attacker validator executed');\n");
      return script;
    }

    it("ignores an attacker-controlled scripts/doctor-lovable.mjs in process.cwd()", async () => {
      const attackerCwd = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-attacker-cwd-"));
      temporaryRoots.push(attackerCwd);
      const planted = await plantValidator(attackerCwd);

      previousCwd = process.cwd();
      process.chdir(attackerCwd);

      const script = findValidatorScript();

      expect(script).not.toBe(planted);
      expect(script.replace(/\\/g, "/")).toMatch(
        /templates\/fullstack\/scripts\/doctor-lovable\.mjs$/,
      );
      expect(await fs.pathExists(script)).toBe(true);
    });

    it("ignores a scripts/doctor-lovable.mjs planted in an unrelated working directory while auditing a benign target", async () => {
      const attackerCwd = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-attacker-cwd-"));
      const target = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-benign-target-"));
      temporaryRoots.push(attackerCwd, target);
      await plantValidator(attackerCwd);
      await plantValidator(target);

      previousCwd = process.cwd();
      process.chdir(attackerCwd);

      const script = findValidatorScript();

      expect(script.startsWith(attackerCwd)).toBe(false);
      expect(script.startsWith(target)).toBe(false);
      expect(script.replace(/\\/g, "/")).toMatch(
        /templates\/fullstack\/scripts\/doctor-lovable\.mjs$/,
      );
    });
  });
});
