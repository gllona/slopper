#!/usr/bin/env node
// A stand-in for `claude -p` used by tests (SLOPPER_CLAUDE_BIN). It answers each stage with valid JSON,
// shaped like the real CLI's `--output-format json` result. Behaviour switches (FAKE_CLAUDE, comma-separated):
//   invalid-once   first curate answer is invalid (tests the retry)
//   critic-fail    the critic never passes
//   cop-revise     the cop asks Curate to revise once, then passes
//   cop-hold       the cop holds
//   limit          every call reports a usage limit
// FAKE_CLAUDE_STATE: a directory for call counters and a log of received argv.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const prompt = args[args.indexOf('-p') + 1] ?? '';
const flags = new Set((process.env.FAKE_CLAUDE ?? '').split(',').filter(Boolean));
const state = process.env.FAKE_CLAUDE_STATE;
const role = /You are the \*\*([^*]+)\*\*/.exec(prompt)?.[1] ?? '';
const stage = { 'curator and writer': 'curate', illustrator: 'art', 'art critic': 'critic', Cop: 'cop' }[role] ?? 'unknown';

let count = 1;
if (state) {
  mkdirSync(state, { recursive: true });
  const f = join(state, `${stage}.count`);
  count = (existsSync(f) ? Number(readFileSync(f, 'utf8')) : 0) + 1;
  writeFileSync(f, String(count));
  appendFileSync(join(state, 'calls.log'), JSON.stringify({ stage, cwd: process.cwd(), args: args.filter((a) => a !== prompt && !a.startsWith('{')) }) + '\n');
}

const reply = (structured, extra = {}) => {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: JSON.stringify(structured), structured_output: structured, ...extra }));
};

if (flags.has('limit')) {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, api_error_status: 429, result: 'Claude usage limit reached.' }));
  process.exit(0);
}

if (stage === 'curate') {
  const digest = JSON.parse(readFileSync('digest.json', 'utf8'));
  const ids = digest.items.slice(0, 2).map((i) => i.id);
  const revising = /Revision requested/.test(prompt);
  if (flags.has('invalid-once') && count === 1) {
    reply({ motto: 'Not Enough' });
  } else {
    const stylesMd = readFileSync('styles.md', 'utf8');
    const lastStyle = /- \d{4}-\d{2}-\d{2}: ([a-z-]+)/.exec(stylesMd)?.[1];
    const style = ['riso-duotone', 'paper-cutout', 'blueprint'].find((s) => s !== lastStyle);
    reply({
      topStories: [{ title: 'A big lab pauses training', itemIds: ids, dimensions: ['safety', 'industry'], novelty: 3, magnitude: 3, breadth: 2, storyline: 'lab-pause' }],
      newStorylines: [{ id: 'lab-pause', title: 'Labs pause training', dimensions: ['safety'], motifs: ['the stop button'] }],
      mode: 'fresh',
      modeReason: 'A very relevant story.',
      motto: revising ? 'The Careful Pause' : 'The Big Pause',
      phrase: revising ? 'A big lab paused its strongest models. Everyone else checked their own pause button.' : 'A big lab pressed pause on its strongest models. The models asked what pause means.',
      phraseAlternatives: ['The strongest model is now resting. Nobody knows who will wake it up.'],
      brief: { concept: 'A robot sits next to a giant pause sign.', metaphor: 'Pause button', cast: ['a robot'], style, composition: 'Robot left, sign right.', artType: 'static', alt: 'A robot sits next to a big pause sign.' },
      sourceIds: ids,
      dimensions: { safety: 3, industry: 2 },
      mood: { hype_doom: -1, calm_frantic: 1 },
    });
  }
} else if (stage === 'art') {
  const brief = JSON.parse(readFileSync('brief.json', 'utf8'));
  reply({
    harness: '0.2',
    style: brief.brief.style,
    elements: [
      { id: 'bot', component: 'robot', at: 'left-third', props: { mood: 'worried' } },
      { id: 'sign', component: 'label', at: { x: 0.68, y: 0.45 }, props: { text: 'PAUSE', size: 'lg', kind: 'tag' } },
    ],
    alt: 'A worried robot stands next to a big sign that says pause.',
  });
} else if (stage === 'critic') {
  const pass = !flags.has('critic-fail');
  const s = pass ? 4 : 2;
  reply({ scores: { clarity: s, coherence: s, composition: s, style: s, polish: s, novelty: s, kindness: 5 }, verdict: pass ? 'Clear and simple.' : 'Hard to read.', revisionNotes: pass ? [] : ['Scale the robot to 1.3'] });
} else if (stage === 'cop') {
  if (flags.has('cop-hold')) reply({ verdict: 'hold', findings: [{ check: 'sensitive-events', severity: 'high', evidence: 'x', suggestion: 'y' }] });
  else if (flags.has('cop-revise') && count === 1) reply({ verdict: 'revise', findings: [{ check: 'defamation', severity: 'medium', evidence: 'pressed pause', suggestion: 'say paused', stage: 'curate' }] });
  else reply({ verdict: 'pass', findings: [] });
} else {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'unknown stage' }));
}
