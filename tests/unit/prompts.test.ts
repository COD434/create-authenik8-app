import { describe, it, expect, vi, beforeEach } from 'vitest';
import inquirer from 'inquirer';

vi.mock('inquirer');
vi.mock('../../src/steps/finalSetup');

import * as promptsModule from '../../src/steps/prompts';
import { hasBun } from '../../src/steps/finalSetup';
const { runPrompts } = promptsModule;


describe('prompts.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prompts for framework, authMode, and other questions', async () => {
    vi.mocked(hasBun).mockReturnValue(true);

    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'auth-oauth',
      usePrisma: false,
      database: 'sqlite',
      useGit: true,
      runtime: 'bun',
    });

    const answers = await runPrompts({} as any, true);

    expect(answers.framework).toBe('Express');
    expect(answers.authMode).toBe('auth-oauth');
    expect(answers.database).toBe('sqlite');
    expect(answers.runtime).toBe('bun');
  });

  it('shows Prisma prompt only for "base" authMode', async () => {
    vi.mocked(hasBun).mockReturnValue(false);

    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'base',
      usePrisma: true,
      database: 'sqlite',
      useGit: true,
    });

    const answers = await runPrompts({} as any, true);

    expect(answers.authMode).toBe('base');
    expect(answers.usePrisma).toBe(true);
  });

  it('skips Prisma prompt for auth and auth-oauth modes', async () => {
    vi.mocked(hasBun).mockReturnValue(false);

    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'auth-oauth',
      database: 'postgresql',
      useGit: true,
    });

    const answers = await runPrompts({} as any, true);

    expect(answers.authMode).toBe('auth-oauth');
    expect(answers.usePrisma).toBeUndefined(); // not asked
  });

  it('falls back to Node if Bun is chosen but not available', async () => {
    vi.mocked(hasBun).mockReturnValue(false);

    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'base',
      usePrisma: true,
      database: 'sqlite',
      useGit: true,
      runtime: 'bun',
    });

    const answers = await runPrompts({} as any, true);

    expect(answers.runtime).toBe('node');
  });

  it('handles user cancellation gracefully', async () => {
    (inquirer.prompt as any).mockRejectedValueOnce(new Error('User cancelled'));

    await expect( runPrompts({} as any, true)).rejects.toThrow();
  });
});
