import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';


vi.mock('child_process');
vi.mock('../../src/lib/process');
vi.mock('../../src/lib/ui');


import { installDependencies, detectPackageManager, ensureRedisServerInstalled } from '../../src/steps/installDeps';
import * as processLib from '../../src/lib/process';
import * as uiLib from '../../src/lib/ui';


describe('installDeps.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.npm_execpath; // reset env for each test
  });

  describe('detectPackageManager()', () => {
    it('returns "pnpm" when npm_execpath contains pnpm', () => {
      process.env.npm_execpath = '/usr/bin/pnpm';
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('returns "bun" when npm_execpath contains bun', () => {
      process.env.npm_execpath = '/usr/local/bin/bun';
      expect(detectPackageManager()).toBe('bun');
    });

    it('returns "npm" when npm_execpath contains npm', () => {
      process.env.npm_execpath = '/usr/local/bin/npm-cli.js';
      expect(detectPackageManager()).toBe('npm');
    });

    it('returns "pnpm" when pnpm command succeeds', () => {
      vi.mocked(execSync).mockImplementationOnce(() => {});
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('returns "bun" when pnpm fails but bun succeeds', () => {
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw new Error(); })
        .mockImplementationOnce(() => {});

      expect(detectPackageManager()).toBe('bun');
    });

    it('falls back to "npm" when neither is available', () => {
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw new Error(); })
        .mockImplementationOnce(() => { throw new Error(); });

      expect(detectPackageManager()).toBe('npm');
    });
  });

  describe('installDependencies()', () => {
    const targetDir = '/tmp/test-project';

    beforeEach(() => {
      vi.mocked(execSync).mockImplementation((command) => {
        if (String(command).includes('redis-server --version')) return Buffer.from('');
        throw new Error();
      });
      vi.mocked(processLib.run).mockResolvedValue(undefined);
      vi.mocked(uiLib.spinner.start).mockReturnValue(undefined as any);
      vi.mocked(uiLib.spinner.stop).mockReturnValue(undefined as any);
      vi.mocked(uiLib.spinner.fail).mockReturnValue(undefined as any);
      vi.mocked(processLib.exitForInterrupt).mockImplementation(() => {});
      vi.mocked(processLib.getCommand).mockImplementation((pm) => pm);
    });

    it('uses pnpm and installs successfully', async () => {
      process.env.npm_execpath = '/pnpm';

      await installDependencies(targetDir);

      expect(uiLib.spinner.start).toHaveBeenCalledWith('Installing dependencies...(this may take a few minutes)');
      expect(processLib.run).toHaveBeenCalledWith(
        'pnpm',
        ['install', '--prefer-offline'],
        { cwd: targetDir, stdio: 'ignore' }
      );
      expect(uiLib.spinner.stop).toHaveBeenCalled();
    });

    it('uses bun and installs successfully', async () => {
      process.env.npm_execpath = '/bun';

      await installDependencies(targetDir);

      expect(processLib.run).toHaveBeenCalledWith(
        'bun',
        ['install'],
        { cwd: targetDir, stdio: 'ignore' }
      );
      expect(uiLib.spinner.stop).toHaveBeenCalled();
    });

    it('falls back to npm and installs successfully', async () => {
      process.env.npm_execpath = '/npm';

      await installDependencies(targetDir);

      expect(processLib.run).toHaveBeenCalledWith(
        'npm',
        ['install', '--prefer-offline', '--no-audit', '--no-fund'],
        { cwd: targetDir, stdio: 'ignore' }
      );
    });

    it('handles installation failure gracefully', async () => {
      const error = new Error('Install failed');
      process.env.npm_execpath = '/pnpm';
      vi.mocked(processLib.run).mockRejectedValueOnce(error);

      await expect(installDependencies(targetDir)).rejects.toThrow('Install failed');

      expect(uiLib.spinner.fail).toHaveBeenCalledWith('Failed to install dependencies');
      expect(processLib.exitForInterrupt).toHaveBeenCalledWith(error);
    });
  });

  describe('ensureRedisServerInstalled()', () => {
    it('does nothing when redis-server is already available', () => {
      vi.mocked(execSync).mockImplementation((command) => {
        expect(command).toBe('redis-server --version');
        return Buffer.from('');
      });

      ensureRedisServerInstalled();

      expect(execSync).toHaveBeenCalledTimes(1);
    });

    it('installs redis-server with apt-get when available', () => {
      vi.mocked(execSync).mockImplementation((command) => {
        const value = String(command);
        if (value === 'redis-server --version') throw new Error();
        if (value === 'apt-get --version') return Buffer.from('');
        if (value === 'sudo apt-get update && sudo apt-get install -y redis-server') return Buffer.from('');
        throw new Error();
      });

      ensureRedisServerInstalled();

      expect(execSync).toHaveBeenCalledWith(
        'sudo apt-get update && sudo apt-get install -y redis-server',
        { stdio: 'inherit' }
      );
    });
  });
});
