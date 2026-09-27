import { chart } from './chart.ts';
import { cloud } from './cloud.ts';
import { datacenter } from './datacenter.ts';
import { human } from './human.ts';
import { label } from './label.ts';
import { meter } from './meter.ts';
import { raw } from './raw.ts';
import { robot } from './robot.ts';
import { speechBubble } from './speech-bubble.ts';
import { sun } from './sun.ts';
import type { ComponentDef } from './types.ts';

/** The component library (DESIGN §9.4). Add new components here after review. */
export const COMPONENTS: Record<string, ComponentDef<any>> = {
  robot,
  human,
  cloud,
  datacenter,
  chart,
  'speech-bubble': speechBubble,
  sun,
  label,
  meter,
  raw,
};
