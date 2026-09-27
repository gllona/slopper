import type { CurateOutput } from './schemas/curate.ts';
import type { StorylinesFile } from './schemas/storylines.ts';
import { daysBetween, type IsoDate } from './util/dates.ts';

/**
 * Deterministic storyline bookkeeping (DESIGN §6.5): storylines touched today are refreshed (heat 1),
 * new ones are added, all others cool down by `heatDecay` per day and go dormant below 0.1.
 */
export function updateStorylines(prev: StorylinesFile, date: IsoDate, curate: CurateOutput, heatDecay: number): StorylinesFile {
  const touched = new Set(curate.topStories.map((s) => s.storyline));
  const byId = new Map(prev.storylines.map((s) => [s.id, structuredClone(s)]));
  for (const n of curate.newStorylines) {
    if (byId.has(n.id) || !touched.has(n.id)) continue;
    byId.set(n.id, { id: n.id, title: n.title, dimensions: n.dimensions, firstSeen: date, lastSeen: date, daysActive: 0, heat: 1, status: 'active', sloppers: [], motifs: n.motifs });
  }
  for (const s of byId.values()) {
    if (touched.has(s.id)) {
      if (s.lastSeen !== date || s.daysActive === 0) s.daysActive += 1;
      s.lastSeen = date;
      s.heat = 1;
      s.status = 'active';
      if (!s.sloppers.includes(date)) s.sloppers.push(date);
      const extra = curate.newStorylines.find((n) => n.id === s.id)?.motifs ?? [];
      s.motifs = [...new Set([...s.motifs, ...extra])].slice(0, 6);
    } else {
      const idle = Math.max(1, daysBetween(s.lastSeen, date));
      s.heat = Math.round(Math.pow(heatDecay, idle) * 1000) / 1000;
      if (s.heat < 0.1) s.status = 'dormant';
    }
  }
  const storylines = [...byId.values()].sort((a, b) => b.heat - a.heat || b.lastSeen.localeCompare(a.lastSeen));
  return { version: 1, storylines };
}
