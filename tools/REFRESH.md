# Weekly data refresh

The planner's facts go stale: exchange rates move, visa rules change, flights and prices change,
restaurants and hotels open and close. Once a week a scheduled Claude session follows this checklist.

## Ground rules
- Work on branch `claude/lucid-feynman-omifim` only (pull it first). Never force-push.
- Change **data**, not design. Most edits belong in `data.js`; a few facts are written in `app.js`
  text (search for them before editing). Don't restructure code.
- Every change must be backed by a current source (official site first, then reputable travel or
  booking sites, then recent reviews). If sources disagree or you can't verify something, leave it
  as is and note it in the log. Never invent places, prices or ratings.
- Keep the JavaScript working on older iPhones: no `??`, `?.`, regex lookbehind `(?<=`, `flatMap`,
  `.flat(`, `replaceAll`, `.at(`.
- Small, careful changes beat big rewrites. Add at most a few new places per week, each with a
  proper description, coordinates, cost, tip and rating (r: 1–3; 3 = unmissable).

## Checklist
1. **Exchange rates** (XE, Wise): update `DATA_INFO.audRates` and `DATA_INFO.ratesNote` in `data.js`
   (A$ per ¥1, per HK$1, per MOP 1; the pataca is pegged at MOP 1.03 = HK$1).
2. **Entry rules for Australians** (smartraveller.gov.au China / Hong Kong / Macau pages, nia.gov.cn):
   the 30-day visa-free arrangement currently runs to 31 Dec 2026 — check for an extension or change
   and update the wording in `app.js` (search `31 December 2026`, `2026-12-31`, `visa-free`).
   Also check the 240-hour transit rule and Hong Kong / Macau stays.
3. **Flights from Sydney** (`SYD_FLIGHTS` in `data.js`): nonstop routes and airlines still operating.
4. **Payments**: Alipay / WeChat Pay fees for foreign cards (search `3%` in `app.js`).
5. **Places** (`CITIES[...].places`): ticket prices, closing days (`cl`), booking rules, closures.
6. **Hotels** (`CITIES[...].hotels`): still operating, names unchanged.
7. **Halal food & mosques** (`CITIES[...].halal`, `.mosques`): still open (recent reviews), addresses.
   Remove or replace closed ones; add well-reviewed new halal places if found.
8. **Intercity routes** (`ROUTES`, `BOATS` in `app.js`): typical times and fares, new lines/services.
9. **Climate averages** (`CLIMATE` in `data.js`) rarely change; only correct clear errors against Wikipedia / national weather service tables.
10. **Recommendations / ratings**: adjust `r` only with good reason; note why in the log.

## Finish
1. Set `DATA_INFO.refreshed` in `data.js` to today's date (YYYY-MM-DD) — even if nothing else changed.
2. `python3 tools/build.py` — rebuilds `china-trip-planner.html` and `.build/site/`.
3. `node tools/smoke-test.js` — must print PASS for both files. Fix anything you broke.
4. Add an entry at the top of `tools/refresh-log.md`: date, what changed, sources, anything unverified.
5. Commit (`Weekly data refresh YYYY-MM-DD`) and push to `claude/lucid-feynman-omifim`.
   GitHub Pages (if enabled) updates from this branch automatically.
6. Update the claude.ai page https://claude.ai/artifact/EYAy1zPmQ4mTAHKWsCaDCK with the Artifact tool:
   publish `.build/site/index.html` to that `url` with `files` data.js, map-data.js and app.js from
   `.build/site/`. If the tool is missing or refuses, say so in the log and the final summary.
7. End with a short summary of what changed and what couldn't be verified.

## Note: guide-data.js
`guide-data.js` (the owner's personal travel guide) exists only on the published Claude page, never in this public repo. The weekly publish sends only index.html, data.js, map-data.js and app.js, so the guide file on the page is kept — do not delete it or pass `null` for it. Without the file the app simply hides guide tips.
