import type { Background } from '../pipeline/schemas/scene.ts';
import type { StyleCard } from './style.ts';

/** Background layer. Uses palette colors only. */
export function renderBackground(bg: Background & { type: NonNullable<Background['type']> }, style: StyleCard, size: number, ground: number): { svg: string; defs: string } {
  const c1 = style.palette[bg.color ?? style.background.color];
  const c2 = style.palette[bg.color2 ?? style.background.color2];
  const ink = style.palette.ink;
  const g = Math.round(ground);
  switch (bg.type) {
    case 'solid':
      return { svg: `<rect width="${size}" height="${size}" fill="${c1}"/>`, defs: '' };
    case 'sky-ground':
      return {
        svg:
          `<rect width="${size}" height="${size}" fill="${c1}"/>` +
          `<rect y="${g}" width="${size}" height="${size - g}" fill="${c2}" opacity="0.55"/>` +
          `<path d="M0 ${g}H${size}" stroke="${ink}" stroke-width="${style.stroke.width * 0.6}"/>`,
        defs: '',
      };
    case 'split': {
      // a gently wavy cut between two flat bands, like torn paper
      const wave = Array.from({ length: 9 }, (_, i) => {
        const x = (size / 8) * i;
        const y = g + (i % 2 ? -8 : 8);
        return `${i ? 'L' : 'M'}${Math.round(x)} ${y}`;
      }).join('');
      return {
        svg: `<rect width="${size}" height="${size}" fill="${c1}"/><path d="${wave}V${size}H0Z" fill="${c2}"/>`,
        defs: '',
      };
    }
    case 'rays': {
      const cx = size / 2;
      const cy = g;
      const n = 16;
      const R = size * 1.5;
      let d = '';
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        d += `M${cx} ${cy}L${Math.round(cx + R * Math.cos(a0))} ${Math.round(cy + R * Math.sin(a0))}L${Math.round(cx + R * Math.cos(a1))} ${Math.round(cy + R * Math.sin(a1))}Z`;
      }
      return { svg: `<rect width="${size}" height="${size}" fill="${c1}"/><path d="${d}" fill="${c2}" opacity="0.28"/>`, defs: '' };
    }
    case 'grid': {
      const defs =
        `<pattern id="bg-grid-minor" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="${c2}" stroke-width="1" opacity="0.35"/></pattern>` +
        `<pattern id="bg-grid-major" width="150" height="150" patternUnits="userSpaceOnUse"><path d="M150 0H0V150" fill="none" stroke="${c2}" stroke-width="2" opacity="0.6"/></pattern>`;
      return {
        svg:
          `<rect width="${size}" height="${size}" fill="${c1}"/>` +
          `<rect width="${size}" height="${size}" fill="url(#bg-grid-minor)"/>` +
          `<rect width="${size}" height="${size}" fill="url(#bg-grid-major)"/>` +
          `<rect x="24" y="24" width="${size - 48}" height="${size - 48}" fill="none" stroke="${ink}" stroke-width="3"/>`,
        defs,
      };
    }
  }
}
