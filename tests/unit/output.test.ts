import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as output from '../../src/utils/output';
import type { CliState } from '../../src/lib/types.js';

describe('output.ts', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const baseState: CliState = {
    projectName: 'test-app',
    framework: 'Express',
    authMode: 'base',
    usePrisma: true,
    database: 'sqlite',
    runtime: 'node',
    useGit: true,
  } as CliState;

  it('prints full summary for base authMode (non-production)', () => {
    output.printSummary(baseState, false);

    expect(consoleSpy).toHaveBeenCalledTimes(2);

    const successHeader = consoleSpy.mock.calls[0][0] as string;
    const mainBody = consoleSpy.mock.calls[1][0] as string;

    expect(successHeader).toContain('🎉 Authenik8 app created successfully!');
    expect(mainBody).toContain('cd test-app');
    expect(mainBody).toContain('✓ JWT only');
    expect(mainBody).toContain('✔ SQLite');
    expect(mainBody).toContain('✔ Prisma ORM');
    expect(mainBody).toContain('GET    /public');
    expect(mainBody).toContain('GET    /guest');
    expect(mainBody).toContain('POST   /refresh');
    expect(mainBody).toContain('github.com/COD434/create-authenik8-app');
  });

  it('prints summary for authMode = "auth"', () => {
    const state = { ...baseState, authMode: 'auth' } as CliState;
    output.printSummary(state, false);

    const mainBody = consoleSpy.mock.calls[1][0] as string;
    expect(mainBody).toContain('✓ Email + Password');
    expect(mainBody).toContain('POST   /auth/register');
  });

  it('prints summary for authMode = "auth-oauth"', () => {
    const state = { ...baseState, authMode: 'auth-oauth' } as CliState;
    output.printSummary(state, false);

    const mainBody = consoleSpy.mock.calls[1][0] as string;
    expect(mainBody).toContain('✓ Password + OAuth (Google/GitHub)');
    expect(mainBody).toContain('GET    /auth/google');
  });

  it('handles usePrisma = false (no database)', () => {
    const state = { ...baseState, usePrisma: false } as CliState;
    output.printSummary(state, false);

    const mainBody = consoleSpy.mock.calls[1][0] as string;
    expect(mainBody).toContain('✔ No database');
    expect(mainBody).toContain('✔ No ORM');
  });

  it('handles postgresql database', () => {
    const state = { ...baseState, database: 'postgresql' } as CliState;
    output.printSummary(state, false);

    const mainBody = consoleSpy.mock.calls[1][0] as string;
    expect(mainBody).toContain('✔ PostgreSQL');
  });

  it('prints extra production section when isProduction = true', () => {
    output.printSummary(baseState, true);

    expect(consoleSpy).toHaveBeenCalledTimes(3);

    const productionBlock = consoleSpy.mock.calls[2][0] as string;
    expect(productionBlock).toContain('🚀 Production Ready Enabled');
    expect(productionBlock).toContain('npm run pm2:start');
  });

  it('handles minimal state (edge case)', () => {
    const minimalState = {
      projectName: 'minimal',
      authMode: 'base',
      usePrisma: false,
    } as CliState;

    output.printSummary(minimalState, false);

    const mainBody = consoleSpy.mock.calls[1][0] as string;
    expect(mainBody).toContain('cd minimal');
  });
});
