import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ui from '../../src/lib/ui';
import { hasReachedStep } from '../../src/lib/state';

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn(),
    fail: vi.fn(),
    stop: vi.fn(),
    text: '',
  })),
}));
vi.mock('../../src/lib/state');

describe('ui.ts', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleClearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleClearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});

    vi.mocked(hasReachedStep).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('renderHeader()', () => {
    it('prints the header with branding', () => {
      ui.renderHeader();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Happy building'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Authenik8 CLI'));
    });
  });

  describe('renderStep()', () => {
    it('marks completed steps with green ✔', () => {
      vi.mocked(hasReachedStep).mockReturnValue(true);

      ui.renderStep('project-scaffold', false);

      const hasCheck = consoleLogSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('✔')
      );
      expect(hasCheck).toBe(true);
    });

    it('skips production step when not in production mode', () => {
      ui.renderStep('production-configured', false);

      const allLogs = consoleLogSpy.mock.calls.flat().join(' ');
      expect(allLogs).not.toContain('production');
    });

    it('shows production step when isProduction = true', () => {
      ui.renderStep('production-configured', true);

      const hasSpinner = consoleLogSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('⏳')
      );
      expect(hasSpinner).toBe(true);
    });
  });

  describe('sleep()', () => {
    it('resolves after the given milliseconds', async () => {
      const promise = ui.sleep(100);
      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
    });
  });
});
