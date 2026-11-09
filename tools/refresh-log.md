# Data refresh log

Newest first. Each daily refresh adds an entry (see `tools/REFRESH.md`).

## 2026-11-09 — daily refresh
- Exchange rates: 1 AUD ≈ ¥4.58–4.61 (Xe 8 Nov, Forbes Advisor 9 Nov; RBA 4.60 on 6 Nov) → 1 CNY ≈ A$0.217 (was 0.214);
  1 AUD ≈ HK$5.49 (moneyexchangerate.org, 5 Nov) → HK$1 ≈ A$0.182; MOP 1 ≈ A$0.177 from the MOP 1.03 = HK$1 peg.
- Entry rules: no extension of the 30-day visa-free arrangement beyond 31 Dec 2026 announced yet (chinaeasymode, tripprof,
  chinavisacheck, as of early Nov 2026). Wording unchanged.
- Flights (rotation): Shenzhen Airlines starts Shenzhen–Sydney nonstop 14 Dec 2026, 4/week, A330-300 (Destination NSW,
  Executive Traveller, AeroRoutes) — added to the Shenzhen flight note; `direct` left false until it is operating.
  A single source says China Southern also flies SZX–SYD 3–4/week — not confirmed, not added. Other Sydney nonstops
  (Air China PEK, Sichuan TFU, Juneyao PVG) still listed by aggregators; no 2026 timetables checked.
- **Not published to the claude.ai page.** The live page (version 1794182812-6735) has changes that are not in this repo:
  booked hotels (Beijing: Guo Ji Yi Yuan Hotel; Shanghai: Hanting Waitan Jiujiang Road; others), a "✅ Booked" hotel
  feature in app.js, and an 8 Nov refresh (rates ¥ 0.218, HK$ 0.186, MOP 0.180). Publishing this build would have wiped
  them, so the page was left as is. The live files need to be merged into this branch before the next publish.

## 2026-11-06 — added Furong Town (芙蓉镇)
- New city "Furong Town" (Yongshun County, western Hunan): coordinates 28.7431, 109.9462 (Wikipedia).
- Access: high-speed train Zhangjiajie West → Furongzhen, 20–30 min, ~¥40, roughly 07:30–21:40 (Trip.com, China Discovery,
  chinalocalhelp); taxi/minibus ~10 min (~¥15) to the old town; DiDi may not operate.
- Ticket ~¥108 (3 days, often ¥60–90 online) from one guide — not confirmed for 2026, marked "check".
- Night lights start 18:30–19:30 depending on source/season, until ~22:30; waterfall low in Dec–Feb.
- Hotels from Trip.com listings (Tianquan Inn, Furong Town Waterfall View Inn, Tusi Xuanfu); coordinates approximate.
- No halal restaurants found; noted plainly.

## 2026-11-05 — baseline
- Exchange rates: 1 CNY ≈ A$0.214 (XE, Wise, Ria, 1 Nov 2026); HK$1 ≈ A$0.179 and MOP 1 ≈ A$0.174 from the
  most recent quotes found (HK$ dated late Aug–Oct 2026; MOP derived from the HK$ peg).
- Entry rules for Australians: 30 days visa-free per mainland entry, to 31 Dec 2026 (Smartraveller); Hong Kong 90 days.
- Sydney nonstops: Beijing (Air China), Shanghai (China Eastern/Qantas codeshare, Juneyao), Guangzhou (China Southern),
  Chengdu (Sichuan Airlines), Hong Kong (Cathay Pacific, Qantas).
- Hotel coordinates are approximate (to a few hundred metres).
