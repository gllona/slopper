import { XMLParser } from 'fast-xml-parser';

/** A feed entry, whatever the dialect (RSS 2.0, RSS 1.0/RDF, Atom). Values are raw (may contain HTML). */
export interface FeedEntry {
  title: string;
  link: string;
  summary: string;
  date: string | undefined;
  categories: string[];
  source?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  // Security: never expand entities beyond the XML built-ins, and never evaluate anything.
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ['item', 'entry', 'category', 'link'].includes(name),
});

function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text((v as Record<string, unknown>)['#text']);
  return '';
}

function atomLink(links: unknown): string {
  const list = (Array.isArray(links) ? links : [links]) as Array<Record<string, string> | string>;
  const alt = list.find((l) => typeof l === 'object' && (!l['@rel'] || l['@rel'] === 'alternate')) ?? list[0];
  return typeof alt === 'string' ? alt : (alt?.['@href'] ?? text(alt));
}

export function parseFeed(xml: string): FeedEntry[] {
  if (/<!ENTITY/i.test(xml)) throw new Error('Feed declares XML entities; refusing to parse');
  const doc = parser.parse(xml) as Record<string, any>;
  if (doc.rss) {
    const items = (doc.rss.channel?.item ?? []) as Record<string, unknown>[];
    return items.map((it) => ({
      title: text(it.title),
      link: text(it.link) || text(it.guid),
      summary: text(it.description) || text(it['content:encoded']),
      date: text(it.pubDate) || text(it['dc:date']) || undefined,
      categories: ((it.category as unknown[]) ?? []).map(text).filter(Boolean),
      source: text(it.source) || undefined,
    }));
  }
  if (doc.feed) {
    const entries = (doc.feed.entry ?? []) as Record<string, unknown>[];
    return entries.map((e) => ({
      title: text(e.title),
      link: atomLink(e.link),
      summary: text(e.summary) || text(e.content),
      date: text(e.published) || text(e.updated) || undefined,
      categories: ((e.category as Record<string, string>[]) ?? []).map((c) => c['@term'] ?? text(c)).filter(Boolean),
    }));
  }
  if (doc['rdf:RDF']) {
    const items = (doc['rdf:RDF'].item ?? []) as Record<string, unknown>[];
    return items.map((it) => ({
      title: text(it.title),
      link: text(it.link),
      summary: text(it.description),
      date: text(it['dc:date']) || undefined,
      categories: [],
    }));
  }
  throw new Error('Not an RSS, RDF, or Atom feed');
}
