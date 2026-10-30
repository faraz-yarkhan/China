# China & Hong Kong Trip Planner

A single-page travel planner for mainland China, Hong Kong and Macau. Open `index.html` in any browser — no server or install needed.

## What you enter
1. Number of days (and an optional start date)
2. Arrival city and the city you fly home from — cities are arranged into the shortest route between them (optional), and day 1 / the last day include the transfer if those cities aren't stops
3. Cities, in travel order, and the places you want to see in each (from drop-down lists)
4. Trip style: sightseeing, culture & history, food, adventure, nature, relaxing, shopping, nightlife, family — or "Other" with your own description
5. Nights in each city (the planner checks they add up to days − 1, with a one-click fix)

Plus pace (relaxed / balanced), hotel budget, passport (Australian / other) and home airport (Sydney / elsewhere). With an Australian passport and Sydney selected, visa notes, flights, consular contacts, insurance and return-customs advice are tailored for Australians.

## What you get
- **Top-rated recommendations** when you don't pick places: each activity is labelled Your pick, ★ Top rated or Recommended for your style, and each city lists its must-sees
- **Day-by-day itinerary** split into Morning, Evening and Night, with an alternative option for each slot
- **Directions between every stop**: walk, metro (with station and line) or DiDi/taxi with time and fare estimates, and the Chinese name to show drivers
- **Halal food** nearest each activity, plus mosques and Jumu'ah reminders on Fridays
- **Intercity transfers** (high-speed rail, flights, border crossings to Hong Kong/Macau)
- **Hotels and best areas to stay** for every city, matched to your budget
- **Before you go**: visas and entry forms, insurance, apps, payments, internet, tips, and a saved checklist
- **Print**: a compact print layout — overview page, one page per day, a key-information page, a checklist page and a phrases page; text shrinks automatically so each fits on one A4 page
- **Phrases**: Mandarin and Cantonese with pinyin/Jyutping, plus a halal dietary card to show restaurant staff

## Files
- `index.html` — page and styles
- `data.js` — cities, places, halal food, hotels and routes (edit this to add destinations)
- `app.js` — form, itinerary engine and rendering

Prices, opening hours and visa rules are typical for 2025–26 and change often: confirm on official sites before booking.

## Using it on iPhone / iPad
Tapping the .html file in Files, Mail, WhatsApp or the Claude app opens a **preview that doesn't run JavaScript**, so the planner can't work there (the page shows a notice when this happens). Instead, open it in Safari from a web address: the published Claude page, or host this repo with GitHub Pages (Settings → Pages → deploy from this branch) and open the Pages URL. The code avoids JavaScript features older iOS Safari lacks, so it runs on iOS 12 and later.
