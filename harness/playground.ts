import { existsSync, readFileSync, watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../pipeline/util/config.ts';
import { compileScene, SceneError } from './compile.ts';
import { lintSvg } from './lint.ts';
import { sanitizeAndOptimize } from './sanitize.ts';

/**
 * npm run harness:watch -- <scene.json> [--port 8765] [--host 127.0.0.1] [--no-open]
 * Live preview while editing a scene: recompiles on every save (compile + sanitize + static lint;
 * no Playwright, so it is instant). Opens the page in your default browser; the page reloads the
 * art by itself. Use --host 0.0.0.0 to reach it from outside a container or VM.
 */

const { positionals, values: opts } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', default: '8765' },
    host: { type: 'string', default: '127.0.0.1' },
    'no-open': { type: 'boolean', default: false },
  },
});
const file = positionals[0];
const port = Number(opts.port);
if (!file) {
  console.error('usage: npm run harness:watch -- <scene.json> [--port 8765] [--host 127.0.0.1] [--no-open]');
  process.exit(2);
}
const path = resolve(file);
if (!existsSync(path)) {
  console.error(`Scene file not found: ${file}`);
  process.exit(2);
}
const config = loadConfig({ loadDotEnv: true });

let state = { version: 0, svg: '', errors: [] as string[], warnings: [] as string[], info: '' };

function rebuild(): void {
  const next = { version: state.version + 1, svg: state.svg, errors: [] as string[], warnings: [] as string[], info: '' };
  try {
    const compiled = compileScene(JSON.parse(readFileSync(path, 'utf8')), config);
    const { svg, removed } = sanitizeAndOptimize(compiled.svg);
    const lint = lintSvg(compiled, svg, removed, config);
    next.svg = svg;
    next.errors = lint.errors;
    next.warnings = lint.warnings;
    next.info = `${compiled.style.id} · ${lint.stats.svgKB} KB · ${lint.stats.words} words · ${compiled.duration ? `${compiled.duration}s` : 'static'}`;
  } catch (e) {
    next.errors = e instanceof SceneError ? e.issues : [(e as Error).message];
  }
  state = next;
  console.log(`[${new Date().toISOString().slice(11, 19)}] v${state.version} ${state.errors.length ? `${state.errors.length} error(s)` : 'OK'} ${state.info}`);
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Slopper playground</title><style>
body{margin:0;font:15px/1.4 system-ui,sans-serif;background:#1d1d1f;color:#eee;display:grid;grid-template-columns:minmax(0,640px) 1fr;gap:24px;padding:24px}
img{width:100%;aspect-ratio:1;background:#fff;display:block}
button{margin-top:10px;font:inherit;padding:6px 14px;border-radius:6px;border:0;cursor:pointer}
.err{color:#ff8a8a}.warn{color:#ffd479}.info{color:#9ab}
li{margin:4px 0}</style></head><body>
<div><img id="art" alt="scene preview"><button id="replay">Replay</button></div>
<div><h2 id="title">Slopper playground</h2><p class="info" id="info"></p><ul id="list"></ul></div>
<script>
let v = -1;
const art = document.getElementById('art');
document.getElementById('replay').onclick = () => { art.src = '/art.svg?v=' + v + '&r=' + Date.now(); };
async function poll() {
  try {
    const s = await (await fetch('/state')).json();
    if (s.version !== v) {
      v = s.version;
      art.src = '/art.svg?v=' + v;
      document.getElementById('info').textContent = s.info;
      document.getElementById('list').innerHTML = s.errors.map(e => '<li class="err">' + esc(e) + '</li>').join('') + s.warnings.map(w => '<li class="warn">' + esc(w) + '</li>').join('');
    }
  } catch {}
  setTimeout(poll, 500);
}
function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }
poll();
</script></body></html>`;

rebuild();
let timer: NodeJS.Timeout | undefined;
watch(path, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 80);
});

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/state') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ version: state.version, errors: state.errors, warnings: state.warnings, info: state.info }));
  } else if (url.pathname === '/art.svg') {
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
    res.end(state.svg);
  } else if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  } else {
    res.writeHead(404).end();
  }
})
  .on('error', (e: NodeJS.ErrnoException) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is busy (another playground running?). Try --port ${port + 1}.` : e.message);
    process.exit(1);
  })
  .listen(port, opts.host, () => {
  const url = `http://${opts.host === '0.0.0.0' ? '127.0.0.1' : opts.host}:${port}/`;
  console.log(`Playground: ${url}  (watching ${file}; Ctrl+C to stop)`);
  if (!opts['no-open']) openBrowser(url);
});

/** Best effort: open the default browser. Prints a hint instead of failing when it can't. */
function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url];
  const hint = () => console.log(`Could not open a browser automatically. Open ${url} yourself.`);
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return hint();
  try {
    const child = spawn(cmd[0]!, cmd.slice(1), { stdio: 'ignore', detached: true });
    child.on('error', hint);
    child.unref();
  } catch {
    hint();
  }
}
