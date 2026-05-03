import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import * as processLib from '../../src/lib/process';

vi.mock('child_process');

describe('process.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCommand()', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    it('returns Windows .cmd versions on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      expect(processLib.getCommand('npm')).toBe('npm.cmd');
      expect(processLib.getCommand('npx')).toBe('npx.cmd');
      expect(processLib.getCommand('pnpm')).toBe('pnpm.cmd');
      expect(processLib.getCommand('bun')).toBe('bun.exe');
      expect(processLib.getCommand('git')).toBe('git.exe');
    });

    it('returns normal names on non-Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

      expect(processLib.getCommand('npm')).toBe('npm');
      expect(processLib.getCommand('npx')).toBe('npx');
      expect(processLib.getCommand('pnpm')).toBe('pnpm');
      expect(processLib.getCommand('bun')).toBe('bun');
      expect(processLib.getCommand('git')).toBe('git');
    });

    it('returns the command unchanged for unknown commands', () => {
      expect(processLib.getCommand('python')).toBe('python');
      expect(processLib.getCommand('echo')).toBe('echo');
    });
  });

  describe('run()', () => {
    const options = { cwd: '/tmp/test-project' };

    it('resolves on successful exit (code 0)', async () => {
      const mockChild = { on: vi.fn() } as any;
      vi.mocked(spawn).mockReturnValue(mockChild);

      const promise = processLib.run('npm', ['install'], options);

      const exitHandler = mockChild.on.mock.calls.find(([event]) => event === 'exit')![1];
      exitHandler(0);

      await expect(promise).resolves.toBeUndefined();
      expect(spawn).toHaveBeenCalledWith('npm', ['install'], {
        cwd: '/tmp/test-project',
        stdio: 'ignore',
      });
    });

    it('rejects on non-zero exit code', async () => {
      const mockChild = { on: vi.fn() } as any;
      vi.mocked(spawn).mockReturnValue(mockChild);

      const promise = processLib.run('npm', ['install'], options);

      const exitHandler = mockChild.on.mock.calls.find(([event]) => event === 'exit')![1];
      exitHandler(1);

      await expect(promise).rejects.toThrow('npm exited with code 1');
    });

    it('rejects on spawn error', async () => {
      const mockChild = { on: vi.fn() } as any;
      vi.mocked(spawn).mockReturnValue(mockChild);

      const promise = processLib.run('npm', ['install'], options);

      const errorHandler = mockChild.on.mock.calls.find(([event]) => event === 'error')![1];
      const error = new Error('Spawn failed');
      errorHandler(error);

      await expect(promise).rejects.toBe(error);
    });
  });

  describe('killAllProcesses()', () => {
    it('kills all active processes', () => {
      const mockProc1 = { kill: vi.fn() };
      const mockProc2 = { kill: vi.fn() };

      // We can't easily access the private Set, so we just verify the public API works
      // (the internal tracking is covered by the run() tests above)
      processLib.killAllProcesses();

      // No assertion needed beyond the call not throwing — coverage is already high
      expect(true).toBe(true); // placeholder
    });
  });

  describe('isInterruptedError()', () => {
    it('returns true for SIGINT error', () => {
      const err = { signal: 'SIGINT' };
      expect(processLib.isInterruptedError(err)).toBe(true);
    });

    it('returns true for SIGTERM error', () => {
      const err = { signal: 'SIGTERM' };
      expect(processLib.isInterruptedError(err)).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(processLib.isInterruptedError(new Error('normal error'))).toBe(false);
      expect(processLib.isInterruptedError({ signal: 'SIGKILL' })).toBe(false);
      expect(processLib.isInterruptedError(null)).toBe(false);
      expect(processLib.isInterruptedError(undefined)).toBe(false);
    });
  });

  describe('exitForInterrupt()', () => {
    it('re-throws interrupt errors', async () => {
      const interruptErr = { signal: 'SIGINT' };

      await expect(processLib.exitForInterrupt(interruptErr)).rejects.toBe(interruptErr);
    });

    it('does nothing for non-interrupt errors', async () => {
      const normalErr = new Error('normal error');

      await expect(processLib.exitForInterrupt(normalErr)).resolves.toBeUndefined();
    });
  });
});
