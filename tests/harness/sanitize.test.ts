import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileScene } from '../../harness/compile.ts';
import { sanitizeAndOptimize, sanitizeSvg, unsafeCss } from '../../harness/sanitize.ts';

const wrap = (inner: string, rootAttrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${rootAttrs}>${inner}</svg>`;

/** Each case: malicious input, and a pattern that must NOT survive sanitization. */
const MALICIOUS: [string, string, RegExp][] = [
  ['script element', wrap('<script>alert(1)</script>'), /script|alert/i],
  ['uppercase script', wrap('<SCRIPT>alert(1)</SCRIPT>'), /script|alert/i],
  ['prefixed svg:script', wrap('<x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script>'), /script|alert/i],
  ['CDATA script', wrap('<script><![CDATA[alert(1)]]></script>'), /script|alert/i],
  ['onload on root', wrap('<rect width="1" height="1"/>', ' onload="alert(1)"'), /onload|alert/i],
  ['onclick on shape', wrap('<rect width="1" height="1" onclick="alert(1)"/>'), /onclick|alert/i],
  ['foreignObject html', wrap('<foreignObject><iframe src="https://evil.example"/></foreignObject>'), /foreignObject|iframe|evil/i],
  ['iframe', wrap('<iframe src="https://evil.example"/>'), /iframe|evil/i],
  ['anchor javascript', wrap('<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'), /javascript|<a[\s>]/i],
  ['use external href', wrap('<use href="https://evil.example/x.svg#a"/>'), /evil/i],
  ['use xlink javascript', wrap('<use xlink:href="javascript:alert(1)"/>', ' xmlns:xlink="http://www.w3.org/1999/xlink"'), /javascript/i],
  ['use data URL', wrap('<use href="data:image/svg+xml;base64,PHN2Zz4="/>'), /data:/i],
  ['image element', wrap('<image href="https://evil.example/track.png"/>'), /image|evil/i],
  ['SMIL set href', wrap('<a><set attributeName="href" to="javascript:alert(1)"/></a>'), /set|javascript/i],
  ['SMIL animate', wrap('<rect width="1" height="1"><animate attributeName="width" to="9" dur="1s"/></rect>'), /animate/i],
  ['style @import', wrap('<style>@import url(https://evil.example/x.css);</style>'), /import|evil/i],
  ['style external url', wrap('<style>rect{fill:url(https://evil.example/x.svg#p)}</style>'), /evil/i],
  ['style font-face', wrap("<style>@font-face{font-family:x;src:url(https://evil.example/f.woff)}</style>"), /font-face|evil/i],
  ['style expression', wrap('<style>rect{width:expression(alert(1))}</style>'), /expression|alert/i],
  ['style escape trick', wrap('<style>rect{fill:u\\72l(https://evil.example)}</style>'), /evil/i],
  ['style breaking out', wrap('<style>rect{}</style><script>alert(1)</script>'), /script|alert/i],
  ['style attribute url', wrap('<rect width="1" height="1" style="fill:url(https://evil.example/p)"/>'), /evil/i],
  ['fill attribute url', wrap('<rect width="1" height="1" fill="url(https://evil.example/p#x)"/>'), /evil/i],
  ['filter attribute url', wrap('<rect width="1" height="1" filter="url(https://evil.example/f.svg#f)"/>'), /evil/i],
  ['processing instruction', wrap('<?xml-stylesheet href="https://evil.example/x.css"?><rect width="1" height="1"/>'), /evil|xml-stylesheet/i],
  [
    'billion laughs',
    `<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa">${Array.from({ length: 8 }, (_, i) => `<!ENTITY ${'a'.repeat(i + 2)} "${`&${'a'.repeat(i + 1)};`.repeat(10)}">`).join('')}]>` +
      wrap('<text>&aaaaaaaaa;</text>'),
    /a{1000}/,
  ],
  ['external entity', `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>` + wrap('<text>&x;</text>'), /root:|passwd/],
  ['unknown media query', wrap('<style>@media print{rect{fill:red}}</style>'), /@media print/i],
];

describe('sanitizer: malicious SVG', () => {
  for (const [name, input, forbidden] of MALICIOUS) {
    it(`removes ${name}`, () => {
      let out: string;
      try {
        out = sanitizeAndOptimize(input).svg;
      } catch {
        return; // refusing to parse is also safe
      }
      expect(out).not.toMatch(forbidden);
    });
  }

  it('reports every removal', () => {
    const { removed } = sanitizeSvg(wrap('<script>x</script><rect width="1" height="1" onclick="x"/>'));
    expect(removed.join('\n')).toMatch(/element <script>/);
    expect(removed.join('\n')).toMatch(/attribute onclick/);
  });

  it('keeps local references, animation CSS, and reduced-motion media', () => {
    const svg = wrap(
      '<defs><filter id="f"><feGaussianBlur stdDeviation="1"/></filter></defs>' +
        '<style>@keyframes k{0%{opacity:0}100%{opacity:1}}#a{animation:k 1s linear forwards;filter:url(#f)}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>' +
        '<g id="a" filter="url(#f)"><rect width="1" height="1"/></g>',
    );
    const { svg: out, removed } = sanitizeSvg(svg);
    expect(removed).toEqual([]);
    expect(out).toContain('@keyframes k');
    expect(out).toContain('url(#f)');
    expect(out).toContain('prefers-reduced-motion');
  });

  it('unsafeCss accepts harness CSS and rejects resource loading', () => {
    expect(unsafeCss('.r-body{fill:#fff;stroke:#000}#x{translate:1px 2px}')).toBeNull();
    expect(unsafeCss('a{background:image-set("x.png" 1x)}')).not.toBeNull();
  });
});

describe('sanitizer: harness output', () => {
  const dir = 'harness/fixtures';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    it(`${f} compiles to an SVG the sanitizer leaves intact`, () => {
      const { svg } = compileScene(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
      const { removed } = sanitizeAndOptimize(svg);
      expect(removed).toEqual([]);
    });
  }
});
