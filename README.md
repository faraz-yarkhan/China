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
- **Your own hotels**: on each city card pick a suggested hotel, search any hotel by name (OpenStreetMap, online), or paste a Google/Apple Maps link or coordinates; all walking/metro/DiDi times and fares, nearby halal food, check-in/out and map pins are then worked out from that hotel
- **Hour-by-hour plan you can edit**: each day is laid out as a balanced timeline (breakfast, sights, halal lunch, coffee break, free time, dinner, evening, back to the hotel, plus travel, flights and Friday Jumu'ah at their real times). “Edit this day” lets you change any time, rename or remove items, and add sights, halal restaurants, cafés, shopping or anything of your own; edits are saved in the browser and flow into the summary, printout, offline copy and text export
- **Day-by-day itinerary** split into Morning, Evening and Night, with an alternative option for each slot
- **Directions between every stop**: walk, metro (with station and line) or DiDi/taxi with time and fare estimates, and the Chinese name to show drivers
- **Halal food** nearest each activity, plus mosques and Jumu'ah reminders on Fridays
- **Intercity transfers** (high-speed rail, flights, border crossings to Hong Kong/Macau)
- **Hotels and best areas to stay** for every city, matched to your budget
- **Before you go**: visas and entry forms, insurance, apps, payments, internet, tips, and a saved checklist
- **Download PDF**: renders the compact print layout into an A4 PDF in the browser (html2canvas + jsPDF from cdnjs; needs internet the first time). Finished files (PDF and offline copy) open a box with Download, Share (Files / Drive / WhatsApp) and Open, which works on iPhone, Android and computers
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
