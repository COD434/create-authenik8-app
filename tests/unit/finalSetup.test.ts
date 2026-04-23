import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

import * as finalSetup from '../../src/steps/finalSetup';
import * as processLib from '../../src/lib/process';
import * as uiLib from '../../src/lib/ui';

vi.mock('fs-extra');
vi.mock('path');
vi.mock('child_process');
vi.mock('../../src/lib/process');
vi.mock('../../src/lib/ui');

describe('finalSetup.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasBun()', () => {
    it('returns true when bun is available', () => {
      vi.mocked(execSync).mockImplementationOnce(() => {});
      expect(finalSetup.hasBun()).toBe(true);
    });

    it('returns false when bun is not available', () => {
      vi.mocked(execSync).mockImplementationOnce(() => { throw new Error(); });
      expect(finalSetup.hasBun()).toBe(false);
    });
  });

  describe('resolveRuntime()', () => {
    it('returns "bun" when runtime is bun and bun is available', () => {
      vi.mocked(execSync).mockImplementationOnce(() => {});
      expect(finalSetup.resolveRuntime('bun')).toBe('bun');
    });

    it('falls back to "node" and logs warning when bun is chosen but not available', () => {
      vi.mocked(execSync).mockImplementationOnce(() => { throw new Error(); });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      expect(finalSetup.resolveRuntime('bun')).toBe('node');
      expect(consoleSpy).toHaveBeenCalledWith('⚠️ Bun not found, falling back to Node');
    });

    it('returns "node" for any other runtime', () => {
      expect(finalSetup.resolveRuntime('node')).toBe('node');
      expect(finalSetup.resolveRuntime('anything')).toBe('node');
    });
  });

  describe('createPm2Config()', () => {
    const targetDir = '/tmp/test-project';
    const projectName = 'my-app';

    beforeEach(() => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    });

    it('creates bun ecosystem.config.js when runtime is bun', () => {
      finalSetup.createPm2Config(targetDir, projectName, 'bun');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('ecosystem.config.js'),
        expect.stringContaining('interpreter: "bun"'),
        'utf-8'
      );
    });

    it('creates node ecosystem.config.js with ts-node when runtime is node', () => {
      finalSetup.createPm2Config(targetDir, projectName, 'node');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('ecosystem.config.js'),
        expect.stringContaining('interpreter:"node"'),
        'utf-8'
      );
    });
  });

  describe('configureProduction()', () => {
    const targetDir = '/tmp/test-project';
    const projectName = 'my-app';

    beforeEach(() => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ scripts: {}, dependencies: {} })
      );
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    });

    it('adds pm2 + ts-node and creates config for node runtime', async () => {
      await finalSetup.configureProduction(targetDir, projectName, 'node');

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;

      // package.json write
      const pkgCall = writeCalls.find((call) => call[0].includes('package.json'));
      expect(pkgCall).toBeDefined();
      expect(pkgCall![1]).toContain('"pm2": "^5.4.2"');
      expect(pkgCall![1]).toContain('"ts-node": "^10.9.2"');

      // ecosystem.config.js write (from createPm2Config)
      const configCall = writeCalls.find((call) => call[0].includes('ecosystem.config.js'));
      expect(configCall).toBeDefined();
      expect(configCall![1]).toContain('interpreter:"node"');
      expect(configCall![1]).toContain('-r ts-node/register');
    });

    it('adds only pm2 for bun runtime', async () => {
      await finalSetup.configureProduction(targetDir, projectName, 'bun');

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;

      // package.json write
      const pkgCall = writeCalls.find((call) => call[0].includes('package.json'));
      expect(pkgCall).toBeDefined();
      expect(pkgCall![1]).toContain('"pm2": "^5.4.2"');
      expect(pkgCall![1]).not.toContain('ts-node');

      // ecosystem.config.js write
      const configCall = writeCalls.find((call) => call[0].includes('ecosystem.config.js'));
      expect(configCall).toBeDefined();
      expect(configCall![1]).toContain('interpreter: "bun"');
    });
  });

  describe('initGit()', () => {
    const targetDir = '/tmp/test-project';

    beforeEach(() => {
      vi.mocked(processLib.run).mockResolvedValue(undefined);
      vi.mocked(processLib.getCommand).mockReturnValue('git');
      vi.mocked(uiLib.spinner.stop).mockImplementation(() => {});
      vi.mocked(uiLib.spinner.fail).mockImplementation(() => {});
    });

    it('successfully runs git init', async () => {
      await finalSetup.initGit(targetDir);

      expect(processLib.run).toHaveBeenCalledWith(
        'git',
        ['init'],
        { cwd: targetDir, stdio: 'ignore' }
      );
      expect(uiLib.spinner.stop).toHaveBeenCalled();
    });

    it('handles git init failure gracefully', async () => {
      vi.mocked(processLib.run).mockRejectedValueOnce(new Error('git failed'));

      await finalSetup.initGit(targetDir);

      expect(uiLib.spinner.fail).toHaveBeenCalledWith('Git init failed');
    });
  });

  describe('appendProductionReadme()', () => {
    const targetDir = '/tmp/test-project';
    const projectName = 'my-app';

    beforeEach(() => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(fs.appendFileSync).mockImplementation(() => {});
    });

    it('appends production instructions to README.md', () => {
      finalSetup.appendProductionReadme(targetDir, projectName);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('README.md'),
        expect.stringContaining('🚀 Production Mode')
      );
    });
  });
});
