import type { Config } from '../schemas/config.ts';
import type { SourceName } from '../schemas/common.ts';
import type { Logger } from '../util/log.ts';
import type { HttpClient } from './http.ts';

/** What a source module returns: normalized later (ids, text cleanup, window filter, caps). */
export interface RawItem {
  url: string;
  title: string;
  snippet?: string;
  publishedAt: string | null;
  score?: number;
  lang?: string;
  publisher?: string;
}

export interface SourceContext {
  date: string;
  window: { from: Date; to: Date };
  config: Config;
  http: HttpClient;
  log: Logger;
  /** Current time (injectable for tests). */
  now: Date;
}

export interface Source {
  name: SourceName;
  /**
   * Extra days accepted around the window. E.g. arXiv announces the day *after* submission,
   * and trending models are dated by creation (up to a couple of weeks old).
   */
  slack?: { beforeDays?: number; afterDays?: number };
  fetch(ctx: SourceContext): Promise<RawItem[]>;
}
