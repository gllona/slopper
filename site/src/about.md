---
layout: base.njk
permalink: /about/
title: About — Slopper
description: What Slopper is, how it is made, the license, and how to contact us.
---
<section class="prose">

# About Slopper

**Slopper** publishes one small piece of art every day about the state of artificial intelligence in the world: models and money, but also jobs, schools, energy, law, politics, and culture. Think of a daily doodle, where the topic is AI and the artist is also AI.

Each slopper has a square image or short animation, a short **motto**, a **phrase** with the joke, and the list of **sources** it is based on (hidden under "Relevant sources").

Yes, this is "AI slop" by definition. We try to make it meaningful, timely, and kind, and not ugly.

## How it is made

Every morning (06:00 UTC) an automated pipeline:

1. collects public headlines about AI from the previous day (titles and short snippets only);
2. asks an AI model to choose what matters, and to write the motto and the phrase;
3. asks the model to draw the art as code (SVG), using a small library of shapes and styles;
4. has a separate AI "critic" check the art, and a separate AI "cop" check for legal problems;
5. opens a pull request that a human can stop before it is published.

The code is open: [github.com/gllona/slopper]({{ site.repo }}).

<h2 id="satire">Satire notice</h2>

Sloppers are humorous commentary on public trends. They are **not news**, and they are **not statements of fact** about any person, company, or organization. We do not name or draw real people, and we do not use brands or logos. If you think a slopper is wrong or unfair, please tell us (see below).

<h2 id="license">License</h2>

The art and texts are licensed under [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). You may share and adapt them, also commercially, if you give credit, for example: *"Slopper #42, slopper.logicos.org, CC BY 4.0"*. Linked sources belong to their owners. The code is MIT-licensed. Fonts: Bricolage Grotesque, Atkinson Hyperlegible Next, and IBM Plex Mono (SIL Open Font License).

<h2 id="contact">Contact and takedown requests</h2>

Write to **[{{ site.contact }}](mailto:{{ site.contact }})** for corrections, rights or takedown requests, or anything else. Takedown requests are handled first. You can also open an issue on [GitHub]({{ site.repo }}/issues).

<h2 id="privacy">Privacy</h2>

This site sets **no cookies** and has no accounts, comments, or forms. We use [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/), which is cookieless and does not track you across sites, to count visits. The site is hosted on Cloudflare Pages. We do not collect personal data.

</section>
