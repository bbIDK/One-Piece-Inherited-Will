// Icon contact sheets through the standard harness: node tools/shot.mjs icons [--only=items,ui]
// Renders every item (content packs included), every technique and every UI icon
// at several sizes on parchment and on the dark HUD colour, saves
// shots/icons-<section>.png and fails if anything falls back to a placeholder
// (the sheet's deliberate unknown test entries excepted).
import { buildSheet, shootSheet } from './icons-sheet.mjs';

export const scenarios = {
  icons: {
    path: '/shots/icons-sheet.html',
    query: '?only=none',
    async run(page, snap, args) {
      const sheet = await buildSheet();
      const url = new URL(page.url());
      url.pathname = sheet;
      url.search = args.only ? `?only=${args.only}` : '';
      await page.goto(url.toString(), { waitUntil: 'commit' });
      const { report, files } = await shootSheet(page);
      for (const f of files) console.log(`shot → ${f}`);
      console.log('icons', JSON.stringify(report));
      const bad = report.fallback.filter((x) => !/^x_unknown|ghost_unknown/.test(x));
      if (bad.length || report.generic.length) throw new Error(`icon fallbacks: ${[...bad, ...report.generic].join(', ')}`);
      if (!report.urlOk || !report.cacheOk) throw new Error('iconURL / cache check failed');
      if (snap) await snap('sheet');
    },
  },
};
