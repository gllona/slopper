/* Minimal structured logger. GitHub Actions annotations when running in CI. */

type Level = 'debug' | 'info' | 'warn' | 'error';

const inCI = process.env.GITHUB_ACTIONS === 'true';
const debugOn = process.env.SLOPPER_DEBUG === '1' || process.env.RUNNER_DEBUG === '1';

function emit(level: Level, scope: string, msg: string, data?: unknown): void {
  if (level === 'debug' && !debugOn) return;
  const extra = data === undefined ? '' : ' ' + (typeof data === 'string' ? data : JSON.stringify(data));
  const line = `[${scope}] ${msg}${extra}`;
  if (inCI && (level === 'warn' || level === 'error')) {
    console.log(`::${level === 'warn' ? 'warning' : 'error'}::${line}`);
  } else if (level === 'error' || level === 'warn') {
    console.error(`${level.toUpperCase()} ${line}`);
  } else {
    console.log(line);
  }
}

export function logger(scope: string) {
  return {
    debug: (msg: string, data?: unknown) => emit('debug', scope, msg, data),
    info: (msg: string, data?: unknown) => emit('info', scope, msg, data),
    warn: (msg: string, data?: unknown) => emit('warn', scope, msg, data),
    error: (msg: string, data?: unknown) => emit('error', scope, msg, data),
  };
}

export type Logger = ReturnType<typeof logger>;
