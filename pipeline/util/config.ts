import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigSchema, TunablesSchema, type Config } from '../schemas/config.ts';

/**
 * Config precedence (DESIGN §15.1):
 *   CLI flag > environment variable > slopper.config.json > code default.
 */

type Json = Record<string, unknown>;

/** Environment variables that map to runtime settings (GitHub repository variables in CI). */
const RUNTIME_ENV: Record<string, { key: keyof Config; parse: (v: string) => unknown }> = {
  VETO_MODE: { key: 'vetoMode', parse: (v) => v },
  PUBLISH_HOUR_UTC: { key: 'publishHourUTC', parse: Number },
  VETO_MIN_MINUTES: { key: 'vetoMinMinutes', parse: Number },
  DRY_RUN: { key: 'dryRun', parse: parseBool },
  SITE_URL: { key: 'siteUrl', parse: (v) => v },
  LAUNCH_DATE: { key: 'launchDate', parse: (v) => v },
  CLOUDFLARE_ACCOUNT_ID: { key: 'cloudflareAccountId', parse: (v) => v },
};

const TUNABLE_PREFIX = 'SLOPPER_';

function parseBool(v: string): boolean {
  if (/^(1|true|yes|on)$/i.test(v)) return true;
  if (/^(0|false|no|off)$/i.test(v)) return false;
  throw new Error(`Not a boolean: "${v}"`);
}

/** maxArtIterations → MAX_ART_ITERATIONS */
export function toScreamingSnake(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Read overrides from an environment object. Empty strings are ignored (unset GitHub variables). */
export function envOverrides(env: NodeJS.ProcessEnv, fileLayer: Json = {}): Json {
  const out: Json = {};
  for (const [name, { key, parse }] of Object.entries(RUNTIME_ENV)) {
    const v = env[name];
    if (v !== undefined && v !== '') out[key] = parse(v);
  }
  // Generic numeric/boolean overrides for top-level tunables: SLOPPER_MAX_ART_ITERATIONS=2
  for (const key of Object.keys(TunablesSchema.shape)) {
    if (isPlainObject(fileLayer[key])) continue; // nested groups are file-only
    const v = env[TUNABLE_PREFIX + toScreamingSnake(key)];
    if (v === undefined || v === '') continue;
    out[key] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : /^(true|false)$/i.test(v) ? parseBool(v) : v;
  }
  return out;
}

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge; later layers win. Arrays are replaced, not concatenated. */
export function mergeLayers(...layers: Json[]): Json {
  const out: Json = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue;
      out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeLayers(out[k] as Json, v) : v;
    }
  }
  return out;
}

export interface LoadConfigOptions {
  /** Repository root (where slopper.config.json lives). */
  root?: string;
  env?: NodeJS.ProcessEnv;
  /** CLI flag layer (highest precedence). */
  cli?: Json;
  /** Load `.env` from root into the env object when present (local development). */
  loadDotEnv?: boolean;
}

export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const root = opts.root ?? process.cwd();
  const env = opts.env ?? process.env;
  if (opts.loadDotEnv && env === process.env) {
    const dotenv = resolve(root, '.env');
    if (existsSync(dotenv)) process.loadEnvFile(dotenv);
  }
  const file = resolve(root, 'slopper.config.json');
  const fileLayer: Json = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Json) : {};
  const merged = mergeLayers(fileLayer, envOverrides(env, fileLayer), opts.cli ?? {});
  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  return parsed.data;
}
