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

  it('defaults to Express and returns the selected preset options', async () => {
    vi.mocked(hasBun).mockReturnValue(true);

    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'auth-oauth',
      oauthProviders: ['google'],
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
    const questions = vi.mocked(inquirer.prompt).mock.calls[0]?.[0] as any[];
    expect(questions.some((question) => question.name === 'framework')).toBe(false);
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
      oauthProviders: ['github'],
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

  it('normalizes the fullstack golden path and OAuth providers', async () => {
    vi.mocked(hasBun).mockReturnValue(false);
    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'fullstack',
      authMethods: ['password', 'github'],
      database: 'sqlite',
      useGit: true,
    });

    const answers = await runPrompts({} as any, false);

    expect(answers.usePrisma).toBe(true);
    expect(answers.database).toBe('postgresql');
    expect(answers.runtime).toBe('node');
    expect(answers.oauthProviders).toEqual(['github']);
  });

  it('does not offer fullstack choices that the preset cannot honor', async () => {
    vi.mocked(hasBun).mockReturnValue(true);
    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'fullstack',
      authMethods: ['password'],
      useGit: true,
    });

    await runPrompts({} as any, true);

    const questions = vi.mocked(inquirer.prompt).mock.calls[0]?.[0] as any[];
    const database = questions.find((question) => question.name === 'database');
    const runtime = questions.find((question) => question.name === 'runtime');
    const preset = questions.find((question) => question.name === 'authMode');

    expect(questions.some((question) => question.name === 'applicationModules')).toBe(false);
    expect(database.when({ authMode: 'fullstack', usePrisma: true })).toBe(false);
    expect(runtime.when({ authMode: 'fullstack' })).toBe(false);
    expect(preset.default).toBe('fullstack');
    expect(preset.choices[0]).toMatchObject({ value: 'fullstack' });
  });

  it('keeps password selected and validates normalized checkbox choices', async () => {
    vi.mocked(hasBun).mockReturnValue(false);
    (inquirer.prompt as any).mockResolvedValueOnce({
      framework: 'Express',
      authMode: 'fullstack',
      authMethods: ['password', 'google', 'github'],
      useGit: false,
    });

    await runPrompts({} as any, false);

    const questions = vi.mocked(inquirer.prompt).mock.calls[0]?.[0] as any[];
    const authMethods = questions.find((question) => question.name === 'authMethods');
    const password = authMethods.choices.find((choice: any) => choice.value === 'password');

    expect(password).toMatchObject({ name: 'Email and password (required)', checked: true });
    expect(authMethods.validate([{ value: 'password' }, { value: 'github' }])).toBe(true);
    expect(authMethods.validate([{ value: 'github' }])).toBe(
      'Email and password is required by the first full-stack preset',
    );
  });

  it('rejects invalid answers returned by the prompt adapter', async () => {
    vi.mocked(hasBun).mockReturnValue(false);
    (inquirer.prompt as any).mockResolvedValueOnce({
      authMode: 'auth-oauth',
      oauthProviders: [],
      database: 'sqlite',
      useGit: true,
    });

    await expect(runPrompts({} as any, false)).rejects.toThrow(
      'Invalid prompt input: oauthProviders: Select at least one OAuth provider',
    );
  });
});
