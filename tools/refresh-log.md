# Data refresh log

Newest first. Each daily refresh adds an entry (see `tools/REFRESH.md`).

## 2026-11-13 — border forms with links; live page merged back
- New "Forms at each border — step by step" panel in Before you go, plus 📝 lines on the arrival, border-crossing and
  departure days, with official links (`BORDER_LINKS` in data.js):
  - China: online arrival card at s.nia.gov.cn/ArrivalCardFillingPC (live since 20 Nov 2025, free; paper/QR fallback —
    Israeli embassy Beijing notice, entrycardguide, chinasimply). Filing window given as 24 h or 72 h by different
    sources, so the app just says "up to a few days before". Health declaration abolished 1 Nov 2023 (symptoms only).
    Customs: declare over ¥20,000 yuan cash / US$5,000 foreign cash. Paper departure cards: unclear, so "staff will tell you".
  - Hong Kong: arrival/departure cards abolished 16 Oct 2024 (ImmD annual report 2024, press release 27 Jan 2025).
  - Australia: paper Incoming Passenger Card still the default; digital Australia Travel Declaration on some Qantas
    flights (Qantas app, up to 72 h before), nationwide by end 2027 (abf.gov.au newsroom, ABF IPC FAQ). Cash A$10,000+
    must be declared (AUSTRAC). No outgoing passenger card.
  - Link pages were taken from search results; direct fetching is blocked in this environment, so home pages are used
    where a deep link couldn't be confirmed (english.customs.gov.cn, customs.gov.hk, fsm.gov.mo, immd.gov.hk).
- Merged the live claude.ai page (version 1794182812-6735) back into this branch with a three-way merge against 4edd3d1:
  booked hotels in data.js and the "✅ Booked" hotel feature in app.js are now in the repo; newer date/rates kept.

## 2026-11-12 — daily refresh
- Exchange rates: 1 AUD ≈ HK$5.34 (Wise 5.342, TradingView 5.347, Yahoo 5.338) → HK$1 ≈ A$0.187 (was 0.185);
  MOP 1 ≈ A$0.182 from the peg. CNY unchanged at A$0.218 (Pluang 0.21793, 11 Nov).
- Entry rules: still no 2027 extension of the 30-day visa-free arrangement (CGTN, visapreflight, blisstravel; only Russia
  extended to 2027). Rotation: 240-hour transit now covers 57 countries (Kyrgyzstan and Vietnam added 20 Aug 2026 —
  english.www.gov.cn, en.hainan.gov.cn, en.shaanxi.gov.cn); app.js wording updated from 55 and now names Australia.
  Hong Kong 90 days for Australians not re-checked today.
- Not published to the claude.ai page — the live page (version 1794182812-6735) still has booked hotels / app.js changes
  not in this repo.

## 2026-11-11 — daily refresh, no data changes
- Rates unchanged (¥ 0.218, HK$ 0.185, MOP 0.180): Wise/XE ~HK$5.375–5.39 per A$1 and ~¥4.58, but no quote dated 11 Nov found.
  Visa-free: still no 2027 extension announced (chinaeasymode, visapreflight, chinavisacheck; third-party sites). Not
  published to the claude.ai page — the live page (version 1794182812-6735) still has booked hotels / app.js changes not in this repo.

## 2026-11-10 — daily refresh
- Exchange rates: 1 AUD ≈ ¥4.58 (OFX, 10 Nov) / CNY 1 ≈ A$0.2169 (Pluang, 10 Nov) → 1 CNY ≈ A$0.218 (was 0.217);
  1 AUD ≈ HK$5.37–5.43 (XE 9 Nov 5.374, Coinbase 10 Nov 5.37–5.43, OFX 5.43) → HK$1 ≈ A$0.185 (was 0.182 — yesterday's
  5 Nov quote was stale); MOP 1 ≈ A$0.180 from the MOP 1.03 = HK$1 peg.
- Entry rules: still no announcement extending the 30-day visa-free arrangement past 31 Dec 2026 (chinaeasymode as of
  4 Nov, trip.com, chinavisacheck). Third-party sites only; nothing official checked. Wording unchanged.
- Payments (rotation): ¥200 fee-free / 3% above still the consensus (chinavigators, travelofchina, chinatravelsorted);
  no official Alipay/WeChat page checked. Wording unchanged.
- **Not published to the claude.ai page** — same reason as 9 Nov: the live page (version 1794182812-6735, unchanged
  since) still has booked hotels and app.js changes that are not in this repo.

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
