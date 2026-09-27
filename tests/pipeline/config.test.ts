import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, mergeLayers, toScreamingSnake } from '../../pipeline/util/config.ts';

function repoWith(config: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopper-config-'));
  writeFileSync(join(dir, 'slopper.config.json'), JSON.stringify(config));
  return dir;
}

describe('config precedence', () => {
  it('uses code defaults when nothing else is set', () => {
    const c = loadConfig({ root: repoWith({}), env: {} });
    expect(c.maxArtIterations).toBe(3);
    expect(c.vetoMode).toBe('window');
    expect(c.dryRun).toBe(true);
    expect(c.critic.passAverage).toBe(3.5);
  });

  it('file > default, env > file, cli > env', () => {
    const root = repoWith({ maxArtIterations: 5, critic: { minScore: 3 } });
    expect(loadConfig({ root, env: {} }).maxArtIterations).toBe(5);
    expect(loadConfig({ root, env: {} }).critic).toEqual({ passAverage: 3.5, minScore: 3 });
    const env = { SLOPPER_MAX_ART_ITERATIONS: '2', VETO_MODE: 'approve', DRY_RUN: 'false' };
    const fromEnv = loadConfig({ root, env });
    expect(fromEnv.maxArtIterations).toBe(2);
    expect(fromEnv.vetoMode).toBe('approve');
    expect(fromEnv.dryRun).toBe(false);
    expect(loadConfig({ root, env, cli: { maxArtIterations: 1 } }).maxArtIterations).toBe(1);
  });

  it('ignores empty env values (unset GitHub variables)', () => {
    const c = loadConfig({ root: repoWith({}), env: { VETO_MODE: '', LAUNCH_DATE: '' } });
    expect(c.vetoMode).toBe('window');
    expect(c.launchDate).toBeUndefined();
  });

  it('rejects invalid values with a readable error', () => {
    expect(() => loadConfig({ root: repoWith({}), env: { VETO_MODE: 'sometimes' } })).toThrow(/vetoMode/);
    expect(() => loadConfig({ root: repoWith({}), env: { DRY_RUN: 'maybe' } })).toThrow(/boolean/);
  });

  it('loads the real slopper.config.json', () => {
    const c = loadConfig({ env: {} });
    expect(c.sources.feeds.length).toBeGreaterThan(0);
    expect(c.publishHourUTC).toBe(19);
    expect(c.artboard).toBe(1080);
  });
});

describe('helpers', () => {
  it('toScreamingSnake', () => {
    expect(toScreamingSnake('maxArtIterations')).toBe('MAX_ART_ITERATIONS');
    expect(toScreamingSnake('generateHourUTC')).toBe('GENERATE_HOUR_UTC');
  });
  it('mergeLayers deep-merges objects and replaces arrays', () => {
    expect(mergeLayers({ a: { b: 1, c: [1, 2] } }, { a: { c: [3] } })).toEqual({ a: { b: 1, c: [3] } });
  });
});
