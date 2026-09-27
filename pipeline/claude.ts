import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { logger } from './util/log.ts';

/**
 * The only door to AI in Slopper (DESIGN §15.5, §19.2). Every call:
 *   - runs `claude -p` in a fresh, throwaway workspace that contains only the stage's input files;
 *   - uses --restricted (no Bash/code tools, no WebFetch, file tools confined to the workspace, user and
 *     project settings ignored), --tools Read, no MCP servers, no slash commands, no session saved;
 *   - uses Claude Code's default model (no --model flag);
 *   - requests structured output with --json-schema and validates it with zod; one retry on invalid output,
 *     telling the model what was wrong.
 * Claude never writes files: the orchestrator writes everything from the returned JSON.
 *
 * SLOPPER_CLAUDE_BIN overrides the executable (tests use a fake).
 */

export class ClaudeError extends Error {}
/** Usage limit or rate limit reached: the orchestrator may retry later (DESIGN §20). */
export class ClaudeLimitError extends ClaudeError {}

/** A file placed in the workspace: from disk, or generated content. */
export type WorkspaceFile = { name: string; path: string } | { name: string; content: string | Buffer };

export interface ClaudeCall<T> {
  stage: string;
  prompt: string;
  schema: z.ZodType<T>;
  files: WorkspaceFile[];
  /** Wall-clock limit (there is no --max-turns flag in the current CLI). */
  timeoutMs?: number;
  /** Extra deterministic checks after schema validation; return problems to trigger the retry. */
  check?: (value: T) => string[];
}

export interface ClaudeResult<T> {
  value: T;
  attempts: number;
  durationMs: number;
  turns: number;
}

interface CliResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  num_turns?: number;
  api_error_status?: number | null;
  terminal_reason?: string;
}

const LIMIT_PATTERN = /usage limit|rate limit|limit reached|too many requests|overloaded|quota/i;

export function claudeBin(): string {
  return process.env.SLOPPER_CLAUDE_BIN || 'claude';
}

export function buildArgs(prompt: string, jsonSchema: object): string[] {
  return [
    '-p',
    prompt,
    '--restricted',
    '--tools',
    'Read',
    '--strict-mcp-config',
    '--permission-mode',
    'dontAsk',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(jsonSchema),
  ];
}

export async function callClaude<T>(call: ClaudeCall<T>): Promise<ClaudeResult<T>> {
  const log = logger(`claude:${call.stage}`);
  const jsonSchema = cliJsonSchema(call.schema);
  const workspace = mkdtempSync(join(tmpdir(), `slopper-${call.stage}-`));
  const t0 = Date.now();
  try {
    for (const f of call.files) {
      if (!/^[\w.-]+(\/[\w.-]+)?$/.test(f.name) || f.name.includes('..')) throw new ClaudeError(`Bad workspace file name "${f.name}"`);
      const target = join(workspace, f.name);
      mkdirSync(dirname(target), { recursive: true });
      if ('path' in f) copyFileSync(f.path, target);
      else writeFileSync(target, f.content);
    }
    let prompt = call.prompt;
    let turns = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await runCli(buildArgs(prompt, jsonSchema), workspace, call.timeoutMs ?? 600_000);
      turns += raw.num_turns ?? 0;
      if (raw.is_error || raw.subtype !== 'success') {
        const text = `${raw.subtype ?? ''} ${raw.result ?? ''} ${raw.terminal_reason ?? ''}`;
        if (raw.api_error_status === 429 || LIMIT_PATTERN.test(text)) throw new ClaudeLimitError(`Claude usage limit (${call.stage}): ${text.trim().slice(0, 300)}`);
        throw new ClaudeError(`Claude failed (${call.stage}): ${text.trim().slice(0, 500)}`);
      }
      const candidate = raw.structured_output ?? parseJsonLoose(raw.result ?? '');
      const parsed = call.schema.safeParse(candidate);
      const problems = parsed.success
        ? (call.check?.(parsed.data) ?? [])
        : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      if (parsed.success && problems.length === 0) {
        log.info(`ok in ${Math.round((Date.now() - t0) / 1000)} s, ${turns} turns${attempt > 1 ? ' (after retry)' : ''}`);
        return { value: parsed.data, attempts: attempt, durationMs: Date.now() - t0, turns };
      }
      log.warn(`invalid output (attempt ${attempt})`, problems.slice(0, 8));
      if (attempt === 2) throw new ClaudeError(`Invalid output from ${call.stage} after retry:\n  - ${problems.join('\n  - ')}`);
      prompt = `${call.prompt}\n\n## Your previous answer was rejected\n\nFix these problems and answer again with the complete JSON object:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nYour previous answer was:\n${JSON.stringify(candidate).slice(0, 20_000)}`;
    }
    throw new ClaudeError('unreachable');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function runCli(args: string[], cwd: string, timeoutMs: number): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin(), args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new ClaudeError(`Claude timed out after ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new ClaudeError(`Cannot run ${claudeBin()}: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out) as CliResult);
      } catch {
        const text = `${out}\n${err}`.trim().slice(0, 800);
        if (LIMIT_PATTERN.test(text)) reject(new ClaudeLimitError(`Claude usage limit: ${text}`));
        else reject(new ClaudeError(`Claude exited with ${code} and no JSON result: ${text}`));
      }
    });
  });
}

/**
 * JSON Schema for --json-schema. The API validates it as draft 2020-12 (tuples must use prefixItems), but the
 * CLI's local validator rejects the draft-2020-12 `$schema` URI: generate 2020-12 and drop only `$schema`.
 */
export function cliJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
}

/** Accept a bare JSON object, or one wrapped in a ```json fence. */
export function parseJsonLoose(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1]! : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** Fill {{placeholders}} in a prompt template. Unknown placeholders are an error. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  const text = template.replace(/^<!--.*?-->\s*/s, '');
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    if (!(k in vars)) throw new Error(`Missing prompt variable {{${k}}}`);
    return vars[k]!;
  });
}

/** "<!-- version: 3 -->" → "3" */
export function fileVersion(text: string): string {
  return /<!--\s*version:\s*([\w.-]+)\s*-->/.exec(text)?.[1] ?? /^version:\s*([\w.-]+)/m.exec(text)?.[1] ?? '0';
}
