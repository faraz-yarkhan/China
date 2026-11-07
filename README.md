# China & Hong Kong Trip Planner

A single-page travel planner for mainland China, Hong Kong and Macau. Open `index.html` in any browser — no server or install needed.

## What you enter
1. Number of days (and an optional start date)
2. Arrival city and the city you fly home from, with optional landing/take-off times and flight numbers (plus, on each city card, how you'll travel there — high-speed train, flight, coach, private car or ferry/river cruise — and optional departure/arrival times) — cities are arranged into the shortest route between them (optional), and day 1 / the last day include the transfer if those cities aren't stops
3. Cities, in travel order, and the places you want to see in each (from drop-down lists)
4. Trip style: sightseeing, culture & history, food, adventure, nature, relaxing, shopping, nightlife, family — or "Other" with your own description
5. Nights in each city (the planner checks they add up to days − 1, with a one-click fix)

Plus pace (relaxed / balanced), hotel budget, passport (Australian / other) and home airport (Sydney / elsewhere). With an Australian passport and Sydney selected, visa notes, flights, consular contacts, insurance and return-customs advice are tailored for Australians.

## What you get
- **Recommended route and transport** (checkbox, on by default): orders your cities into the shortest route between your airports and recommends a mode for every journey you leave unchosen — researched route advice first, local knowledge (Li River cruise Guilin → Yangshuo, ferries Hong Kong ↔ Macau), then a door-to-door time comparison — with the reason shown and alternatives one tap away
- **Transport choice per journey**: with the checkbox off nothing is assumed; until you choose, each travel day compares the sensible options with door-to-door time and approximate cost, and the map shows that leg as not chosen
- **Times-aware days**: with flight and train times, day 1 starts once you've landed and reached the hotel, travel days fit a morning stop before a late departure, and the last day works back from take-off (3 h airport buffer plus the ride to the airport)
- **Top-rated recommendations** when you don't pick places: each activity is labelled Your pick, ★ Top rated or Recommended for your style, and each city lists its must-sees
- **Maps**: a built-in route map of China (works offline, in print and in the offline copy) with numbered stops, train/flight/ferry legs and zoomed insets for close-together cities; a Map tab with a zoomable OpenStreetMap street map of every stop, filterable by day; and Google Maps links for the whole route and each day
- **At a glance** table at the top of the Day by day tab: day, date, city, morning / evening / night, travel and where you sleep; tap a row to jump to that day
- **Your own places**: each city card has an “Add your own place” box: search any place by name (OpenStreetMap, online), paste a Google/Apple Maps link or coordinates, or add it by name only; choose how long and what time of day, and it's scheduled with directions, nearby halal food and map pins like the built-in places
- **Your own hotels**: on each city card pick a suggested hotel, search any hotel by name (OpenStreetMap, online), or paste a Google/Apple Maps link or coordinates; all walking/metro/DiDi times and fares, nearby halal food, check-in/out and map pins are then worked out from that hotel
- **Weather & what to wear**: a tab with your trip's typical weather and packing list per city, each city's month-by-month climate (with seasonal notes) and clothing advice; a weather line on every day (morning / afternoon / night temperatures and what to wear, including extras for that day's plans) and a weather column in At a glance. Uses long-term climate averages, or a live Open-Meteo forecast when the trip is within about two weeks
- **Hour-by-hour plan you can edit**: each day is laid out as a balanced timeline (breakfast, sights, halal lunch, coffee break, free time, dinner, evening, back to the hotel, plus travel, flights and Friday Jumu'ah at their real times). “Edit this day” lets you change any time, rename or remove items, and add sights, halal restaurants, cafés, shopping or anything of your own; edits are saved in the browser and flow into the summary, printout, offline copy and text export
- **Day trips on each city card**: “Day trips from …” lists nearby cities and towns reachable in about 3½ h or less (with time each way and the best transport) plus the city's out-of-town sights; choose how long (full day, half day, or 2–6 hours there), when (best time, morning, afternoon, evening incl. after dark), which day (or the best day) and how to travel. The trip is timed door to door (e.g. leaving early enough to arrive before dusk, and back before the last train) and built in when you build the itinerary
- **Anything else? (step 6)**: type requests before building, one per line, in the same words as “Change my plan”; a live preview shows what each will add, move out or why it can't be done, and the summary lists the outcome of every day trip and request
- **Change my plan**: a box above the tabs where you type a change in your own words — e.g. “Add a trip from Zhangjiajie to Furong Town on 28 Dec from 5pm till 10pm”, “Add Beihai Park on day 2 afternoon”, “Dinner at Donglaishun at 7pm on 22 Dec”, “Keep the evening of 26 Dec free”, “Remove lunch on day 3”. It reads the day (date, day number or weekday), times (“5pm onwards till 10pm”, “afternoon”, “4 hr”), the place or city and any transport you name, then shows the worked-out change before you add it: door-to-door transport there and back (high-speed train incl. getting to the station, or car/coach, with fares, the last train back and the faster or cheaper alternative), time at the destination, sights, the view after dark, halal food (an early halal meal before you leave when the destination has none), and what it replaces. If the window is too short it offers to start earlier or catch the last train back. Added changes update the day, At a glance, print and PDF at once, are saved in the browser and can be undone. Trips out are worked out from `OUTINGS` in `data.js` (station, train times, last trains) where known, else from the intercity estimates. On the claude.ai page, requests it can't read can be passed to Claude (the viewer is asked first; uses their Claude account)
- **Day-by-day itinerary** split into Morning, Evening and Night, with an alternative option for each slot
- **Directions between every stop**: walk, metro (with station and line) or DiDi/taxi with time and fare estimates, and the Chinese name to show drivers
- **Halal food** nearest each activity, plus mosques and Jumu'ah reminders on Fridays
- **Intercity transfers** (high-speed rail, flights, border crossings to Hong Kong/Macau)
- **Hotels and best areas to stay** for every city, matched to your budget
- **Before you go**: visas and entry forms, insurance, apps, payments, internet, tips, and a saved checklist
- **Download PDF**: captures the planner page itself (summary, route map, At a glance, day cards with hour-by-hour plans, map, hotels & halal food, before you go, phrases — light theme) into A4 pages, each section and each city starting on a new page and nothing split across pages (long day cards break between their parts); rendered in the browser (html2canvas + jsPDF from cdnjs; needs internet the first time). Finished files (PDF and offline copy) open a box with Download, Share (Files / Drive / WhatsApp) and Open, which works on iPhone, Android and computers
- **Print**: a compact print layout — overview page, one page per day, a key-information page, a checklist page and a phrases page; text shrinks automatically so each fits on one A4 page. If the browser blocks printing (the Claude preview, an iPhone Home Screen app, or browsers inside WhatsApp/Gmail), the button explains why and offers **Show print layout**, which puts the print pages on screen for the browser's own Print or Share → Print
- **Phrases**: Mandarin and Cantonese with pinyin/Jyutping, plus a halal dietary card to show restaurant staff

## Files
- `index.html` — page and styles
- `data.js` — cities, places, halal food, hotels and routes (edit this to add destinations)
- `map-data.js` — simplified land and border outlines for the route map (Natural Earth, public domain), generated by `tools/build-map-data.js`
- `app.js` — form, itinerary engine and rendering

Every ¥, HK$ and MOP price is followed by an approximate Australian-dollar amount (mid-market rates checked early November 2026: 1 CNY ≈ A$0.214, HK$1 ≈ A$0.179, MOP 1 ≈ A$0.174; update `AUD_RATE` in `app.js` to change them).

Prices, opening hours and visa rules are typical for 2025–26 and change often: confirm on official sites before booking.

## Using it on iPhone / iPad
Tapping the .html file in Files, Mail, WhatsApp or the Claude app opens a **preview that doesn't run JavaScript**, so the planner can't work there (the page shows a notice when this happens). Instead, open it in Safari from a web address: the published Claude page, or host this repo with GitHub Pages (Settings → Pages → deploy from this branch) and open the Pages URL (https://faraz-yarkhan.github.io/China/). To carry your plan on the phone without internet, press **Save offline copy**: it saves a script-free HTML file of your itinerary that opens in any iPhone preview (Files, WhatsApp, Mail) and prints the same compact layout. The code avoids JavaScript features older iOS Safari lacks, so it runs on iOS 12 and later.

## Keeping the data current
A scheduled Claude session refreshes the facts daily following `tools/REFRESH.md` (exchange rates, entry rules,
flights, prices, opening days, hotels, halal food), logs changes in `tools/refresh-log.md`, and updates the
"Data last refreshed" date shown at the bottom of the page. To rebuild by hand: `python3 tools/build.py`, then
`node tools/smoke-test.js`.
