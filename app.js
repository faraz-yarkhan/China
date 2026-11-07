/* China & Hong Kong Trip Planner — form, itinerary engine and rendering. Depends on data.js. */
(function () {
  "use strict";
  // The script is running, so remove the "can't run" notice
  const nojs = document.getElementById("nojs");
  if (nojs) nojs.parentNode.removeChild(nojs);

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SLOT = {
    m: { label: "Morning", time: "08:30 – 12:30" },
    e: { label: "Evening", time: "13:30 – 18:30" },
    n: { label: "Night", time: "19:00 – 22:00" },
    full: { label: "Morning → Evening", time: "07:30 – 18:30" },
  };
  const BUDGET = {
    budget: { label: "Budget", day: "¥450–700", hk: "HK$700–1,100" },
    mid: { label: "Mid-range", day: "¥1,000–1,700", hk: "HK$1,600–2,600" },
    lux: { label: "Luxury", day: "¥3,000+", hk: "HK$4,500+" },
  };
  const TIER = { lux: "Luxury", mid: "Mid-range", budget: "Budget" };
  const STORE = "chk-trip-planner-v1";

  // Give every place a stable id
  Object.entries(CITIES).forEach(([cid, c]) => { c.id = cid; c.places.forEach((p, i) => (p.id = cid + "-" + i)); });

  /* ---------- state ---------- */
  const DEFAULT = {
    days: 10, start: "", pace: "balanced", budget: "mid", passport: "au", home: "syd", arrive: "bj", depart: "hk", optimise: true, flights: {},
    types: ["sightseeing", "culture", "food"], other: "",
    stops: [
      { city: "bj", nights: 3, places: ["bj-0", "bj-3"] },
      { city: "xa", nights: 2, places: ["xa-0"] },
      { city: "sh", nights: 2, places: [] },
      { city: "hk", nights: 2, places: [] },
    ],
  };
  const saved = load("form");
  if (saved && !("arrive" in saved)) Object.assign(saved, { arrive: "", depart: "", optimise: false });
  let state = Object.assign(structuredCloneSafe(DEFAULT), saved || {});
  let isExample = !load("form");

  function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
  function load(k) { try { const v = localStorage.getItem(STORE + ":" + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(STORE + ":" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

  /* ---------- geometry ---------- */
  function km(a, b) {
    if (!a || !b) return 0;
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const round5 = (n) => Math.round(n / 5) * 5;

  /* ---------- prices in Australian dollars (approximate, mid-market) ---------- */
  // Checked 2 Nov 2026: 1 CNY ≈ A$0.214 (XE, Wise, Ria). HK$ and MOP from recent quotes; the pataca is pegged at MOP 1.03 = HK$1.
  const AUD_RATE = DATA_INFO.audRates;
  // "5 Nov 2026" from "2026-11-05"
  const refreshedLabel = (() => { const d = new Date(DATA_INFO.refreshed + "T00:00:00"); return isNaN(d) ? DATA_INFO.refreshed : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })();
  const AUD_NOTE = DATA_INFO.ratesNote + ", checked " + refreshedLabel;
  const refreshLine = () => `Data last refreshed: ${refreshedLabel} (${DATA_INFO.covers}). Checked weekly.`;
  const audFmt = (v) => (v < 1 ? String(Math.max(0.5, Math.round(v * 2) / 2)) : v < 10 ? String(Math.round(v * 2) / 2) : v < 100 ? String(Math.round(v)) : (v < 1000 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10).toLocaleString("en-US"));
  // Adds "(≈A$…)" after every ¥ / HK$ / MOP amount or range in a piece of text
  const PRICE_RE = /(¥|HK\$|MOP\$?\s?)(\d[\d,]*(?:\.\d+)?)(\s?[–-]\s?(?:¥|HK\$|MOP\$?\s?)?(\d[\d,]*(?:\.\d+)?))?(?![\d,]*\.?\d)(?!\s*\(?≈\s?A\$)/g;
  function withAUD(text) {
    return String(text).replace(PRICE_RE, (all, cur, a, rangePart, b) => {
      const rate = AUD_RATE[cur.indexOf("HK") === 0 ? "HK$" : cur.indexOf("MOP") === 0 ? "MOP" : "¥"];
      const n = (x) => parseFloat(String(x).replace(/,/g, ""));
      const lo = n(a) * rate, hi = b ? n(b) * rate : null;
      return `${all} (≈A$${audFmt(lo)}${hi != null ? "–" + audFmt(hi) : ""})`;
    });
  }
  // Apply to every text node under an element (skips form fields and scripts); safe to run twice
  function addAUD(root) {
    if (!root || !document.createTreeWalker) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false), nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((t) => {
      const pe = t.parentNode && t.parentNode.nodeName;
      if (pe === "SCRIPT" || pe === "STYLE" || pe === "TEXTAREA" || pe === "OPTION") return;
      if (!/(¥|HK\$|MOP)\s?\d/.test(t.nodeValue)) return;
      const v = withAUD(t.nodeValue);
      if (v !== t.nodeValue) t.nodeValue = v;
    });
  }

  /* ---------- the traveller's own hotel (optional), else the recommended area ---------- */
  const userHotel = (city) => (state.hotels && state.hotels[city.id] && state.hotels[city.id].ll ? state.hotels[city.id] : null);
  const stayLL = (city) => (userHotel(city) ? userHotel(city).ll : city.stay.ll);
  const stayName = (city) => (userHotel(city) ? userHotel(city).name : city.stay.area);
  // Nearest known metro station to a point (within ~1.3 km), from the city's sights and recommended area
  function nearestMetro(city, ll) {
    const cands = city.places.filter((p) => p.m).map((p) => ({ m: p.m, d: km(ll, p.ll) })).concat(city.stay.m ? [{ m: city.stay.m, d: km(ll, city.stay.ll) }] : []);
    const best = cands.sort((a, b) => a.d - b.d)[0];
    return best && best.d < 1.3 ? best.m : null;
  }
  function hotelPoint(city) {
    const h = userHotel(city);
    if (h) return { n: h.name, zh: h.name, ll: h.ll, m: nearestMetro(city, h.ll), hotel: true };
    return { n: "your hotel (" + city.stay.area + ")", ll: city.stay.ll, m: city.stay.m, hotel: true };
  }

  /* How to get from A to B inside a city */
  function getThere(from, to, city) {
    const d = km(from.ll, to.ll);
    const farMins = Math.round(((d * 1.35) / 45) * 60 + 15);
    if (d < 0.15) return { mode: "Walk", mins: 0, text: "You're already here." };
    if (to.x && d > 12) return { mode: "Trip", mins: farMins, text: esc(to.x) };
    if (from.x && d > 12) {
      if (to.hotel) return { mode: "Return", mins: farMins, text: "Head back the way you came: " + esc(from.x) };
      const onward = getThere(hotelPoint(city), to, city);
      return { mode: "Return", mins: farMins, text: "Head back to the city the way you came, then: " + onward.text };
    }
    const road = d * 1.35;
    const walk = Math.round((road / 4.5) * 60);
    const [base, baseKm, perKm] = city.taxi;
    const fare = Math.max(base, round5(base + Math.max(0, road - baseKm) * perKm));
    const car = Math.round((road / (d > 15 ? 40 : 22)) * 60 + 5);
    const show = to.zh ? ` Show the driver: <span class="han">${esc(to.zh)}</span>.` : "";
    const ride = city.ride;
    if (d < 1) return { mode: "Walk", mins: walk, text: `Walk about ${walk} min (${d.toFixed(1)} km).` };
    if (d < 2) return { mode: "Walk", mins: Math.min(walk, car), text: `Walk about ${walk} min, or a short ${ride} (~${city.cur}${fare}).` + show };
    if (city.metro && from.m && to.m) {
      const mm = Math.round((road / 30) * 60 + 12);
      return { mode: "Metro", mins: mm, text: `Metro from <b>${esc(from.m)}</b> to <b>${esc(to.m)}</b>, about ${mm} min door to door (Apple Maps or Amap will show the exact transfer). Or ${ride} ~${car} min, approx. ${city.cur}${fare}.` + show };
    }
    return { mode: ride === "DiDi" ? "DiDi" : "Taxi", mins: car, text: `${ride[0].toUpperCase() + ride.slice(1)} ~${car} min, approx. ${city.cur}${fare}.` + show };
  }

  /* Intercity route */
  function routeText(a, b) {
    if (a === b) return "Same city — no transfer needed.";
    const k1 = a + "|" + b, k2 = b + "|" + a;
    if (ROUTES[k1]) return ROUTES[k1];
    if (ROUTES[k2]) return ROUTES[k2];
    const macau = a === "mo" || b === "mo" ? " Macau has no high-speed rail station: trains run to Zhuhai, then you walk across the Gongbei–Border Gate crossing (allow 30–60 min)." : "";
    const A = CITIES[a], B = CITIES[b];
    const d = km(A.stay.ll, B.stay.ll);
    const name = `${A.name} → ${B.name}`;
    if (d < 400) return `${name}: high-speed train, roughly ${(d * 1.2 / 220 + 0.4).toFixed(1)} h. Search on Trip.com or 12306.` + macau;
    if (d < 1000) return `${name}: high-speed train ~${(d * 1.25 / 250 + 0.5).toFixed(0)} h, or fly ~${(d / 650 + 0.6).toFixed(1)} h plus airport time. Compare on Trip.com.` + macau;
    return `${name}: fly (~${(d / 700 + 0.6).toFixed(1)} h in the air). Trains exist but take most of a day.` + macau;
  }
  const crossesBorder = (a, b) => CITIES[a].region !== CITIES[b].region;

  /* Halal food nearest a point */
  function eatNear(city, ll, n = 2) {
    const located = city.halal.filter((h) => h.ll).map((h) => ({ ...h, d: km(ll, h.ll) })).sort((a, b) => a.d - b.d).slice(0, n);
    const general = city.halal.filter((h) => !h.ll);
    return { located, general, far: !located.length || located[0].d > 4 };
  }

  /* ---------- Australians & Sydney ---------- */
  const isAU = () => state.passport === "au";
  const fromSyd = () => state.home === "syd";
  // Nights spent in each unbroken stretch of the mainland (each HK/Macau visit ends a stretch)
  function mainlandStretches() {
    const out = []; let cur = 0;
    state.stops.forEach((st) => {
      if (CITIES[st.city].region === "mainland") cur += st.nights;
      else if (cur) { out.push(cur); cur = 0; }
    });
    if (cur) out.push(cur);
    return out;
  }
  function sydLine(id, dir) {
    const f = SYD_FLIGHTS[id];
    if (!f) return "";
    return dir === "in"
      ? `<b>From Sydney:</b> ${esc(f.text)} Arrive at ${esc(f.airport)}. China is 2 h behind Sydney (3 h during Australian daylight saving), so jet lag is minimal.`
      : `<b>Back to Sydney:</b> ${esc(f.text)} Fly out of ${esc(f.airport)}.`;
  }

  /* ---------- itinerary engine ---------- */
  function prefsFrom(s) {
    const types = new Set();
    s.types.forEach((t) => {
      const def = TRIP_TYPES.find((x) => x.id === t);
      (def && def.tags ? def.tags : [t]).forEach((x) => types.add(x));
    });
    const stop = new Set(["with", "that", "this", "some", "like", "want", "have", "trip", "and", "the", "more", "lots", "very"]);
    const words = (s.other || "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !stop.has(w));
    return { types, words, pace: s.pace, fullTotal: 0 };
  }

  function pick(ctx, slot, prev, o = {}) {
    const { city, used, sel, prefs, dow } = ctx;
    const pool = city.places.filter((p) => {
      if (used.has(p.id)) return false;
      if (dow != null && p.cl && p.cl.includes(dow)) return false;
      if (slot === "m") return p.s.includes("m") || (o.allowFull && p.s.includes("full"));
      return p.s.includes(slot);
    });
    const scored = pool.map((p) => {
      const chosen = sel.has(p.id);
      const match = p.t.filter((t) => prefs.types.has(t)).length;
      let sc = (chosen ? 1000 : 0) + (p.r || 1) * 9 + match * 8;
      if (prefs.words.length) {
        const hay = (p.n + " " + p.d + " " + p.t.join(" ")).toLowerCase();
        if (prefs.words.some((w) => hay.includes(w))) sc += 14;
      }
      const dist = km(prev.ll, p.ll);
      sc -= Math.min(dist, 40) * (o.near ? 2.2 : 0.5);
      if (p.s.includes("full") && !chosen && !match) sc -= 10;
      if (o.near && p.x) sc -= 30;
      return { p, sc };
    }).sort((a, b) => b.sc - a.sc);
    return [scored[0] && scored[0].p, scored[1] && scored[1].p];
  }

  function activity(ctx, part, p, alt, prev) {
    const city = ctx.city;
    const matched = TRIP_TYPES.filter((t) => (t.tags || [t.id]).some((x) => p.t.includes(x)) && ctx.prefs.types.has((t.tags || [t.id])[0])).map((t) => t.label);
    const why = ctx.sel.has(p.id) ? ["pick", "Your pick"] : p.r === 3 ? ["top", "★ Top rated"] : matched.length ? ["rec", "Recommended · " + matched.slice(0, 2).join(", ")] : ["rec", "Recommended"];
    const slot = { part, type: "act", p, alt, why, how: getThere(prev, p, city) };
    if (part === "m" || part === "full") slot.eat = { label: part === "full" ? "Lunch (halal)" : "Lunch nearby (halal)", ...eatNear(city, p.ll) };
    if (part === "n") slot.eat = { label: "Dinner nearby (halal)", ...eatNear(city, p.ll) };
    return slot;
  }

  function buildPlan(s) {
    const prefs = prefsFrom(s);
    const startDate = s.start ? new Date(s.start + "T00:00:00") : null;
    const usedByCity = {};
    const days = [];
    const warnings = [];
    const stopCtx = s.stops.map((st) => {
      const city = CITIES[st.city];
      usedByCity[st.city] = usedByCity[st.city] || new Set();
      return { id: st.city, city, used: usedByCity[st.city], sel: new Set(st.places), prefs, nights: st.nights, fullCount: 0 };
    });

    const arriveId = s.arrive || stopCtx[0].id;
    const departId = s.depart || stopCtx[stopCtx.length - 1].id;
    if (arriveId !== stopCtx[0].id && km(CITIES[arriveId].stay.ll, stopCtx[0].city.stay.ll) > 700)
      warnings.push(`You land in ${CITIES[arriveId].name} but your first stop is ${stopCtx[0].city.name}, a long onward journey on day 1. Consider adding ${CITIES[arriveId].name} as your first stop, or changing your arrival city.`);
    if (departId !== stopCtx[stopCtx.length - 1].id && km(CITIES[departId].stay.ll, stopCtx[stopCtx.length - 1].city.stay.ll) > 700)
      warnings.push(`Your last stop is ${stopCtx[stopCtx.length - 1].city.name} but you fly home from ${CITIES[departId].name}. Book the international flight for the evening, or travel there the day before.`);

    let dayIdx = 0;
    const dateFor = (i) => (startDate ? new Date(startDate.getTime() + i * 86400000) : null);

    stopCtx.forEach((ctx, si) => {
      for (let k = 0; k < ctx.nights; k++) {
        const kind = si === 0 && k === 0 ? "arrival" : k === 0 ? "transfer" : "full";
        const legFrom = si > 0 ? stopCtx[si - 1].id : arriveId;
        days.push(makeDay(ctx, kind, dateFor(dayIdx), si > 0 ? stopCtx[si - 1] : null, arriveId, k === 0 ? legTimesFor(s.stops[si], legFrom) : null));
        dayIdx++;
      }
    });
    const last = stopCtx[stopCtx.length - 1];
    days.push(makeDay(last, "depart", dateFor(dayIdx), null, departId));

    const F = s.flights || {};
    const inT = toMin(F.inTime), outT = toMin(F.outTime);
    if (inT != null && inT >= 21 * 60) warnings.push(`Your flight lands at ${F.inTime}, so day 1 is just getting to the hotel. Pre-book an airport transfer or note the DiDi pick-up point.`);
    if (outT != null && outT - INTL_BUFFER - (AIRPORT_MIN[departId] || 60) < 5 * 60) warnings.push(`Your flight home takes off at ${F.outTime}, so you'd leave the hotel in the small hours. Consider a hotel near the airport for the last night, and book the taxi the evening before.`);

    // Selected places that didn't fit
    stopCtx.forEach((ctx) => {
      const missed = [...ctx.sel].filter((id) => !ctx.used.has(id)).map((id) => ctx.city.places.find((p) => p.id === id)).filter(Boolean);
      if (missed.length) warnings.push(`${ctx.city.name}: no room for ${missed.map((p) => p.n).join(", ")}. Add a night there, or swap it for another pick (full-day trips need a full day, not an arrival or travel day).`);
    });
    return { days, warnings, stops: stopCtx, arriveId, departId };
  }

  /* ---------- times (all local, minutes after midnight) ---------- */
  const toMin = (t) => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const p = t.split(":"); return +p[0] * 60 + +p[1]; };
  const hhmm = (m) => { m = (((Math.round(m / 5) * 5) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  // Typical minutes from the city centre to its main airport
  const AIRPORT_MIN = { bj: 60, sh: 60, xa: 60, cd: 60, cq: 45, gl: 45, ys: 90, zjj: 60, fr: 90, hz: 50, su: 90, gz: 50, sz: 40, hk: 45, mo: 30 };
  const IMMIGRATION = 75; // landing → through immigration with bags
  const INTL_BUFFER = 180; // at the airport this long before an international take-off
  // Time to leave the hotel before a train/flight departs
  const legLead = (a, b) => modeEstimate(legMode(a, b), a, b).lead;
  // Door-to-door estimate between two cities for the chosen (or recommended) mode
  const legMinutes = (a, b) => modeEstimate(legMode(a, b), a, b).door;
  // Which parts of the day are still usable after you're ready, or before you must leave
  const freeAfter = (ready) => ({ m: ready <= 9 * 60 + 30, e: ready <= 16 * 60, n: ready <= 20 * 60 + 30 });
  const freeBefore = (leave) => ({ m: leave >= 12 * 60 + 30, e: leave >= 18 * 60 + 30, n: leave >= 22 * 60 });
  const partAt = (t) => (t < 12 * 60 + 30 ? "m" : t < 18 * 60 + 45 ? "e" : "n");
  // A stop's "getting here" times count only if they were entered for the same previous city
  const legTimesFor = (st, fromId) => (st && st.leg && st.leg.from === fromId ? st.leg : {});

  function travelSlot(fromId, toId, extra) {
    const from = CITIES[fromId], to = CITIES[toId];
    const li = legInfo(fromId, toId);
    return Object.assign({ part: "m", type: "travel", from, to, fromId, toId, leg: li, text: li.text || routeText(fromId, toId), border: crossesBorder(fromId, toId), arrive: to.arrive }, extra);
  }

  function makeDay(ctx, kind, date, prevCtx, flyId, legTimes) {
    const city = ctx.city;
    const hotel = hotelPoint(city);
    ctx.dow = date ? date.getDay() : null;
    const day = { kind, city, cityId: ctx.id, date, slots: [], friday: date && date.getDay() === 5 };
    const F = state.flights || {};
    let prev = hotel;
    let free = { m: true, e: true, n: true };

    if (kind === "arrival") {
      day.flyIn = flyId;
      const land = toMin(F.inTime);
      if (flyId === ctx.id) {
        const ready = land == null ? null : land + IMMIGRATION + (AIRPORT_MIN[flyId] || 60);
        day.slots.push({ part: land == null ? "m" : partAt(land), type: "arrive", text: city.arrive, city, flyIn: flyId, land, ready, flightNo: F.inNo, when: land == null ? null : "Lands " + hhmm(land) });
        free = ready == null ? { m: false, e: true, n: true } : freeAfter(ready);
      } else {
        const lt = legTimes || {};
        let dep = toMin(lt.dep), arr = toMin(lt.arr);
        const est = dep == null && arr == null;
        if (dep == null && land != null) dep = land + IMMIGRATION + 60 + (legMode(flyId, ctx.id) === "flight" ? 60 : legMode(flyId, ctx.id) === "car" ? 0 : 30);
        if (arr == null && dep != null) arr = dep + legMinutes(flyId, ctx.id) - legLead(flyId, ctx.id) - 40;
        day.slots.push({ part: land == null ? "m" : partAt(land), type: "arrive", via: true, city: CITIES[flyId], flyIn: flyId, land, flightNo: F.inNo, when: land == null ? null : "Lands " + hhmm(land),
          text: `Clear immigration and customs in ${CITIES[flyId].name}, then continue straight to ${city.name}.` });
        day.slots.push(travelSlot(flyId, ctx.id, { sameDay: true, part: dep == null ? "e" : partAt(dep), dep, arr, est, when: dep == null ? null : hhmm(dep) + " → " + hhmm(arr) }));
        free = arr == null ? { m: false, e: false, n: true } : freeAfter(arr + 60);
      }
    }

    if (kind === "transfer") {
      const lt = legTimes || {};
      const dep = toMin(lt.dep);
      let arr = toMin(lt.arr);
      const extra = { part: dep == null ? "m" : partAt(dep), dep, arr };
      if (dep != null) {
        const leave = dep - legLead(prevCtx.id, ctx.id);
        extra.leaveBy = leave;
        // Late departure: fit in a morning stop near the old hotel first
        if (freeBefore(leave).m) {
          const ph = hotelPoint(prevCtx.city);
          prevCtx.dow = ctx.dow;
          const [a, alt] = pick(prevCtx, "m", ph, { near: true });
          if (a) {
            prevCtx.used.add(a.id);
            const sl = activity(prevCtx, "m", a, alt, ph);
            sl.inCity = prevCtx.city; sl.when = "08:30 – " + hhmm(leave - 45);
            day.slots.push(sl);
            extra.collect = getThere(a, ph, prevCtx.city).text;
          }
        }
        if (arr == null) { arr = dep + legMinutes(prevCtx.id, ctx.id) - legLead(prevCtx.id, ctx.id) - 40; extra.est = true; }
      }
      if (dep != null) extra.when = hhmm(dep) + " → " + hhmm(arr);
      extra.arr = arr;
      day.slots.push(travelSlot(prevCtx.id, ctx.id, extra));
      free = arr == null ? { m: false, e: true, n: true } : freeAfter(arr + 60);
    }

    if (kind === "full") {
      ctx.fullCount++;
      ctx.prefs.fullTotal++;
      // On Fridays keep the morning close to a mosque so Jumu'ah fits in
      const mosque = day.friday && city.mosques.find((x) => x.ll);
      const [a, alt] = mosque ? pick(ctx, "m", { ll: mosque.ll }, { near: true, allowFull: true }) : pick(ctx, "m", prev, { allowFull: true });
      if (a) {
        ctx.used.add(a.id);
        const part = a.s.includes("full") ? "full" : "m";
        day.slots.push(activity(ctx, part, a, alt, prev));
        prev = a;
      }
    } else if ((kind === "arrival" || kind === "transfer") && free.m) {
      // Early arrival: a light morning stop near the hotel (bags can wait at reception)
      const [a, alt] = pick(ctx, "m", prev, { near: true });
      if (a) { ctx.used.add(a.id); day.slots.push(activity(ctx, "m", a, alt, prev)); prev = a; day.earlyBags = true; }
    }

    if (kind === "depart") {
      day.flyOut = flyId;
      const off = toMin(F.outTime);
      const via = flyId !== ctx.id;
      const leave = off == null ? null : via ? off - INTL_BUFFER - legMinutes(ctx.id, flyId) : off - INTL_BUFFER - (AIRPORT_MIN[flyId] || 60);
      // last day: an afternoon activity fits if you leave the hotel after 16:30
      const fb = leave == null ? { m: !via, e: false, n: false } : { m: leave >= 12 * 60 + 30, e: leave >= 16 * 60 + 30, n: leave >= 22 * 60 };
      ["m", "e", "n"].forEach((part) => {
        if (!fb[part]) return;
        const [a, alt] = pick(ctx, part, prev, { near: true });
        if (a) { ctx.used.add(a.id); day.slots.push(activity(ctx, part, a, alt, prev)); prev = a; }
      });
      const back = prev !== hotel ? getThere(prev, hotel, city).text : null;
      const lp = leave == null ? null : partAt(Math.max(leave, 0));
      if (via) day.slots.push(travelSlot(ctx.id, flyId, { toFlight: true, part: lp || "m", leaveBy: leave, collect: back, when: leave == null ? null : "Leave by " + hhmm(leave) }));
      day.slots.push({ part: lp || "e", type: "depart", text: CITIES[flyId].depart, flyOut: flyId, off, flightNo: F.outNo,
        leaveBy: via ? null : leave, collect: via ? null : back, airportMin: AIRPORT_MIN[flyId] || 60,
        when: off == null ? null : (via ? "" : "Leave " + hhmm(leave) + " · ") + "Take-off " + hhmm(off) });
      if (leave != null && leave < 5 * 60) day.earlyFlight = true;
      return day;
    }

    const hadFull = day.slots.some((x) => x.part === "full");
    if (!hadFull && free.e) {
      const restDay = kind === "full" && ctx.prefs.pace === "relaxed" && ctx.prefs.fullTotal % 2 === 0;
      if (restDay) {
        day.slots.push({ part: "e", type: "rest" });
      } else {
        const [b, alt] = pick(ctx, "e", prev, { near: kind !== "full" });
        if (b) { ctx.used.add(b.id); day.slots.push(activity(ctx, "e", b, alt, prev)); prev = b; }
        else day.slots.push({ part: "e", type: "rest" });
      }
    }
    if (free.n) {
      const [c, alt] = pick(ctx, "n", prev, { near: kind !== "full" });
      if (c) { ctx.used.add(c.id); day.slots.push(activity(ctx, "n", c, alt, prev)); prev = c; }
      else day.slots.push({ part: "n", type: "free", text: city.night[(ctx.fullCount + day.slots.length) % city.night.length], eat: { label: "Dinner (halal)", ...eatNear(city, prev.ll) } });
    } else {
      day.slots.push({ part: "n", type: "free", late: true, when: "After check-in", text: "You arrive late: check in, grab a meal near the hotel and rest for tomorrow.", eat: { label: "Late meal near the hotel (halal)", ...eatNear(city, stayLL(city)) } });
    }
    day.back = prev !== hotel ? getThere(prev, hotel, city) : null;
    return day;
  }

  /* Put the arrival city first, the departure city last, and order the rest by shortest hops */
  function arrangeStops() {
    if (!state.optimise || state.keepOrder || state.stops.length < 2) return false;
    const before = state.stops.map((x) => x.city).join();
    const rest = state.stops.slice();
    const take = (id, fromEnd) => {
      const i = fromEnd ? rest.map((x) => x.city).lastIndexOf(id) : rest.findIndex((x) => x.city === id);
      return i >= 0 ? rest.splice(i, 1)[0] : null;
    };
    const head = state.arrive ? take(state.arrive) : null;
    const tail = state.depart && rest.length ? take(state.depart, true) : null;
    // Try every order of the middle stops (≤ 8, so at most 40,320) and keep the shortest.
    // Each crossing between the mainland and Hong Kong/Macau costs an extra 800 km so those stay together.
    const startId = head ? head.city : state.arrive || null;
    const endId = tail ? tail.city : state.depart || null;
    const leg = (a, b) => (a && b ? km(CITIES[a].stay.ll, CITIES[b].stay.ll) + (CITIES[a].region !== CITIES[b].region ? 800 : 0) + (a === "ys" && b === "gl" ? 300 : 0) : 0);
    const cost = (seq) => { let c = 0, prevId = startId; seq.forEach((x) => { c += leg(prevId, x.city); prevId = x.city; }); return c + leg(prevId, endId); };
    let best = rest.slice();
    if (rest.length <= 8) {
      let bestCost = Infinity;
      const permute = (arr, k) => {
        if (k === arr.length) { const c = cost(arr); if (c < bestCost) { bestCost = c; best = arr.slice(); } return; }
        for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; permute(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
      };
      permute(rest.slice(), 0);
    }
    const ordered = (head ? [head] : []).concat(best, tail ? [tail] : []);
    state.stops = ordered;
    return ordered.map((x) => x.city).join() !== before;
  }
  let reordered = false;

  /* ---------- form ---------- */
  function renderForm() {
    $("#days").value = state.days;
    $("#start").value = state.start || "";
    $("#citySel").innerHTML = '<option value="">Choose a city…</option>' +
      Object.entries(CITIES).map(([id, c]) => `<option value="${id}">${esc(c.name)} ${c.zh}</option>`).join("");
    $("#types").innerHTML = TRIP_TYPES.map((t) => `<label class="toggle"><input type="checkbox" id="type-${t.id}" value="${t.id}" ${state.types.includes(t.id) ? "checked" : ""}><span>${esc(t.label)}</span></label>`).join("") +
      `<label class="toggle"><input type="checkbox" id="type-other" value="other" ${state.other ? "checked" : ""}><span>Other…</span></label>`;
    $("#otherText").hidden = !state.other && !$("#type-other").checked;
    $("#otherText").value = state.other || "";
    document.querySelector(`input[name=pace][value=${state.pace}]`).checked = true;
    document.querySelector(`input[name=budget][value=${state.budget}]`).checked = true;
    const cityOpts = (first) => `<option value="">${first}</option>` + Object.entries(CITIES).map(([id, c]) => `<option value="${id}">${esc(c.name)} ${c.zh}</option>`).join("");
    $("#arriveSel").innerHTML = cityOpts("Same as my first city");
    $("#departSel").innerHTML = cityOpts("Same as my last city");
    $("#arriveSel").value = state.arrive || "";
    $("#departSel").value = state.depart || "";
    $("#optimise").checked = !!state.optimise;
    const fl = state.flights || {};
    $("#inTime").value = fl.inTime || ""; $("#inNo").value = fl.inNo || "";
    $("#outTime").value = fl.outTime || ""; $("#outNo").value = fl.outNo || "";
    document.querySelector(`input[name=passport][value=${state.passport}]`).checked = true;
    document.querySelector(`input[name=home][value=${state.home}]`).checked = true;
    renderStops();
  }

  function renderStops() {
    const el = $("#stops");
    if (!state.stops.length) { el.innerHTML = '<p class="hint">No cities yet. Add your first city above.</p>'; renderTally(); return; }
    el.innerHTML = state.stops.map((st, i) => {
      const c = CITIES[st.city];
      const opts = c.places.filter((p) => !st.places.includes(p.id)).map((p) => `<option value="${p.id}">${p.custom ? "✳️ " : ""}${esc(p.n)}${p.s.includes("full") ? " (full day)" : ""}</option>`).join("");
      const chips = st.places.map((id) => {
        const p = c.places.find((x) => x.id === id);
        return p ? `<span class="chip${p.custom ? " own" : ""}">${p.custom ? "✳️ " : ""}${esc(p.n)}<button type="button" data-act="unplace" data-i="${i}" data-id="${id}" aria-label="Remove ${esc(p.n)}">×</button></span>` : "";
      }).join("");
      return `<div class="stop">
        <div class="stop-head"><span class="num">${String(i + 1).padStart(2, "0")}</span><strong>${esc(c.name)}</strong><span class="han">${c.zh}</span>
          <button type="button" class="icon-btn" data-act="up" data-i="${i}" aria-label="Move ${esc(c.name)} earlier" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="icon-btn" data-act="down" data-i="${i}" aria-label="Move ${esc(c.name)} later" ${i === state.stops.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="icon-btn" data-act="remove" data-i="${i}" aria-label="Remove ${esc(c.name)}">✕</button></div>
        <label class="nights" for="nights-${i}">Nights <input type="number" id="nights-${i}" min="1" max="30" value="${st.nights}" data-act="nights" data-i="${i}"></label>
        ${legRow(st, i)}
        ${hotelRow(st, i)}
        <div class="row"><select id="place-${i}" data-act="place" data-i="${i}" aria-label="Add a place in ${esc(c.name)}"><option value="">Add a place to see…</option>${opts}</select></div>
        ${ownPlaceRow(i, c)}
        ${chips ? `<div class="chips">${chips}</div><div><button type="button" class="btn small" data-act="addtop" data-i="${i}">＋ Add top picks</button></div>` : `<p class="hint suggest">No places chosen, so we'll plan the top-rated ones for your trip style, e.g. ${topPicks(st.city, 3).map((p) => esc(p.n.split(/[:(]/)[0].trim())).join(", ")}. <button type="button" class="btn small" data-act="addtop" data-i="${i}">Add top picks</button></p>`}
      </div>`;
    }).join("");
    renderTally();
    renderOutLeg();
  }

  /* ---------- the traveller's own places ---------- */
  // Saved per city in state.customPlaces and merged into that city's places so the planner treats them like any other
  function applyCustomPlaces() {
    const cp = state.customPlaces || {};
    Object.keys(cp).forEach((cid) => {
      const city = CITIES[cid];
      if (!city) return;
      cp[cid].forEach((p) => { if (!city.places.some((q) => q.id === p.id)) city.places.push(p); });
    });
  }
  function removeCustomPlace(cid, pid) {
    const cp = state.customPlaces && state.customPlaces[cid];
    if (cp) state.customPlaces[cid] = cp.filter((p) => p.id !== pid);
    const city = CITIES[cid];
    if (city) city.places = city.places.filter((p) => p.id !== pid);
  }
  const ownResults = {};
  function ownPlaceRow(i, c) {
    return `<div class="ownplace">
      <span class="hint lbl">✳️ Add your own place in ${esc(c.name)} — a sight, shop, café, restaurant, friend's address…</span>
      <div class="hotelfind"><input type="text" id="ownq-${i}" placeholder="Place name or map link" aria-label="Your own place in ${esc(c.name)}"><button type="button" class="btn small" data-act="ownfind" data-i="${i}">Find</button></div>
      <div class="ownopts">
        <label class="hint" for="owndur-${i}">Time there</label>
        <select id="owndur-${i}"><option value="1">1 hour</option><option value="2" selected>2 hours</option><option value="3">3 hours</option><option value="4">Half day</option><option value="full">Full day</option></select>
        <label class="hint" for="ownwhen-${i}">When</label>
        <select id="ownwhen-${i}"><option value="any">Any time</option><option value="m">Morning</option><option value="e">Afternoon</option><option value="n">Evening</option></select>
      </div>
      <div class="hotelres" id="ownres-${i}" aria-live="polite"></div>
    </div>`;
  }
  function addOwnPlace(i, info) {
    const st = state.stops[i], c = CITIES[st.city];
    if (info.ll && km(info.ll, c.stay.ll) > 150) { toast(`That spot is ${Math.round(km(info.ll, c.stay.ll))} km from ${c.name}. Check it's the right place.`); return; }
    const dur = $("#owndur-" + i).value, when = $("#ownwhen-" + i).value;
    const H = { 1: "1 h", 2: "2 h", 3: "3 h", 4: "Half day (4 h)", full: "Full day" }[dur];
    const p = {
      id: c.id + "-u" + Date.now().toString(36), n: info.name, zh: "", t: ["custom"],
      s: dur === "full" ? ["full"] : when === "any" ? ["m", "e", "n"] : [when],
      h: H, c: "Your own pick — check prices locally", ll: info.ll || c.stay.ll, m: info.ll ? nearestMetro(c, info.ll) : null,
      d: info.addr ? `Your own addition: ${info.addr}.` : "Your own addition.",
      tip: info.ll ? "" : "No map pin, so travel times are estimated from the city centre. Paste the place's map link to make them exact.",
      x: info.ll && km(info.ll, c.stay.ll) > 25 ? "Outside the city centre: about " + Math.round(km(info.ll, c.stay.ll)) + " km away. A DiDi or car is easiest." : undefined,
      r: 2, custom: true,
    };
    state.customPlaces = state.customPlaces || {};
    (state.customPlaces[c.id] = state.customPlaces[c.id] || []).push(p);
    c.places.push(p);
    st.places.push(p.id);
    persist(); renderStops();
    if (lastPlan) generate(false);
    toast(`Added “${p.n}” to ${c.name}. It's in your plan — find it in the hour-by-hour timeline.`);
  }
  function findOwnPlace(i) {
    const c = CITIES[state.stops[i].city];
    const q = ($("#ownq-" + i).value || "").trim();
    const box = $("#ownres-" + i);
    if (!q) { toast("Type the place's name, or paste its coordinates."); return; }
    const ll = parseLatLng(q);
    if (ll) { addOwnPlace(i, { name: nameFromLink(q, "My place (map pin)"), ll }); return; }
    const noPin = `<button type="button" class="btn small hotelpick" data-act="ownnopin" data-i="${i}">Add “${esc(q)}” without a map pin<br><span class="hint">Times will be estimated from the city centre</span></button>`;
    if (isShortMapLink(q)) { box.innerHTML = SHORT_LINK_HELP + nearPicker(i, "own", c, ""); return; }
    if (window.NO_PRINT) { box.innerHTML = `<p class="hint">Searching isn't possible inside the Claude preview.</p>` + COORD_TIP + nearPicker(i, "own", c, q) + noPin; return; }
    box.innerHTML = `<p class="hint">Searching OpenStreetMap near ${esc(c.name)}…</p>`;
    geoSearch(c, q, (rows, why) => {
      if (!rows || !rows.length) { box.innerHTML = (why ? `<p class="hint">${why}</p>` : notFoundMsg(q, c, "places")) + COORD_TIP + nearPicker(i, "own", c, q) + noPin; return; }
      ownResults[i] = rows;
      box.innerHTML = `<p class="hint">Pick the right place:</p>` + rows.map((r, k) => `<button type="button" class="btn small hotelpick" data-act="ownpick" data-i="${i}" data-k="${k}"><b>${esc(r.name)}</b><br><span class="hint">${esc(r.addr)} · ${km(r.ll, c.stay.ll).toFixed(1)} km from the centre</span></button>`).join("") + nearPicker(i, "own", c, q) + noPin;
    });
  }


  /* ---------- "Your hotel" on each city card ---------- */
  const hotelOpen = {}, hotelResults = {};
  function hotelRow(st, i) {
    const c = CITIES[st.city], h = userHotel(c), open = hotelOpen[c.id] || (h && h.src !== "list");
    const listOpts = c.hotels.map((x, k) => (x.ll ? `<option value="list:${k}" ${h && h.src === "list" && h.name === x.n ? "selected" : ""}>${TIER[x.tier]} · ${esc(x.n)}</option>` : "")).join("");
    const mt = h ? nearestMetro(c, h.ll) : null;
    return `<div class="hotelrow">
      <label class="hint lbl" for="hotel-${i}">🏨 Your hotel in ${esc(c.name)}:</label>
      <select id="hotel-${i}" data-act="hotelsel" data-i="${i}">
        <option value="" ${!h && !open ? "selected" : ""}>Not booked yet — plan around ${esc(c.stay.area)}</option>
        <optgroup label="Suggested hotels">${listOpts}</optgroup>
        <option value="other" ${open && !(h && h.src === "list") ? "selected" : ""}>${h && h.src !== "list" ? "📍 " + esc(h.name) : "Another hotel… (search or map link)"}</option>
      </select>
      ${open ? `<div class="hotelfind"><input type="text" id="hotelq-${i}" placeholder="Hotel name, address or map link" aria-label="Find your hotel in ${esc(c.name)}"><button type="button" class="btn small" data-act="hotelfind" data-i="${i}">Find</button></div><div class="hotelres" id="hotelres-${i}" aria-live="polite"></div>` : ""}
      ${h ? `<p class="hint hotelset">📍 Planning from <b>${esc(h.name)}</b>${h.src === "near" ? ` (placed near ${esc(h.near)} — approximate; paste its coordinates for exact times)` : ""}${mt ? " · nearest metro " + esc(mt) : " · no metro close by, so DiDi/taxi times are used"} · ${km(h.ll, c.stay.ll).toFixed(1)} km from ${esc(c.stay.area)} · <a href="https://maps.apple.com/?ll=${h.ll[0]},${h.ll[1]}&q=${encodeURIComponent(h.name)}" target="_blank" rel="noopener">check the pin ↗</a></p>` : ""}
    </div>`;
  }
  // Coordinates from pasted text: "39.91, 116.41", Google "@39.91,116.41,15z", Apple "ll=39.91,116.41", Amap "116.41,39.91"
  function parseLatLng(text) {
    const pin = String(text).match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/); // Google's exact place pin
    if (pin) { const a = +pin[1], b = +pin[2]; if (a > 15 && a < 56 && b > 70 && b < 140) return [a, b]; }
    const m = String(text).match(/(-?\d{1,3}\.\d{2,})\s*,\s*(-?\d{1,3}\.\d{2,})/);
    if (!m) return null;
    let a = +m[1], b = +m[2];
    if (a > 70 && a < 140 && b > 15 && b < 56) { const x = a; a = b; b = x; }
    return a > 15 && a < 56 && b > 70 && b < 140 ? [a, b] : null;
  }
  // Share links that hide the location behind a redirect (the browser can't follow it)
  const isShortMapLink = (q) => /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple\/p\/|surl\.amap\.com|j\.map\.baidu\.com)/i.test(q);
  const COORD_TIP = `<p class="hint"><b>Most reliable:</b> in Google Maps or Apple Maps, press and hold on the exact spot (the hotel's entrance). The coordinates appear, e.g. <i>39.9195, 116.4105</i> — tap to copy them and paste here. Or open the link in your browser and copy the long address from the address bar.</p>`;
  const SHORT_LINK_HELP = `<p class="hint"><b>That's a short share link</b> (like maps.app.goo.gl/…). It doesn't contain the location — it only points to Google, and a web page can't follow it. Instead:</p>` + COORD_TIP;
  // Put a hotel or place near a known landmark when it can't be found
  function nearPicker(i, kind, c, q) {
    const opts = [`<option value="stay">${esc(c.stay.area)} (recommended area)</option>`]
      .concat(c.places.filter((p) => !p.custom && !p.x).map((p) => `<option value="${p.id}">${esc(p.n.split(/[:(]/)[0].trim())}</option>`)).join("");
    return `<div class="nearpick"><label class="hint" for="${kind}near-${i}">Or put ${q ? "“" + esc(q) + "”" : "it"} near (approximate):</label>
      <select id="${kind}near-${i}">${opts}</select><button type="button" class="btn small" data-act="${kind}near" data-i="${i}">Use this</button></div>`;
  }
  function nearChoice(i, kind) {
    const c = CITIES[state.stops[i].city], v = $("#" + kind + "near-" + i).value;
    const p = v === "stay" ? null : c.places.find((x) => x.id === v);
    return { ll: p ? p.ll : c.stay.ll, label: p ? p.n.split(/[:(]/)[0].trim() : c.stay.area };
  }
  // OpenStreetMap search near the city, then a wider search if nothing turns up
  function geoSearch(c, q, cb) {
    const [la, lo] = c.stay.ll;
    const base = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en";
    const near = base + "&bounded=1&viewbox=" + [lo - 0.8, la + 0.8, lo + 0.8, la - 0.8].join(",") + "&q=" + encodeURIComponent(q);
    const wide = base + "&q=" + encodeURIComponent(q + ", " + c.name + ", China");
    let done = false;
    const finish = (rows, why) => { if (done) return; done = true; cb(rows, why); };
    setTimeout(() => finish(null, "The search took too long."), 15000);
    const get = (u) => fetch(u, { headers: { Accept: "application/json" } }).then((r) => r.json());
    const tidy = (rows) => (rows || []).map((r) => ({ name: r.name || String(r.display_name).split(",")[0], addr: String(r.display_name).split(",").slice(0, 4).join(","), ll: [+r.lat, +r.lon] })).filter((r) => km(r.ll, c.stay.ll) < 150);
    get(near).then((rows) => { const a = tidy(rows); return a.length ? a : new Promise((res) => setTimeout(res, 1100)).then(() => get(wide)).then(tidy); })
      .then((a) => finish(a, null))
      .catch(() => finish(null, "Couldn't reach the map search (it needs an internet connection)."));
  }
  const notFoundMsg = (q, c, what) => `<p class="hint">No match for “${esc(q)}” on OpenStreetMap near ${esc(c.name)}. Many ${what} in China aren't listed there, or are listed under another name — try the brand name, the Chinese name, or the street.</p>`;

  // A place name from a pasted map link: Apple "?q=Name", Google ".../place/Name/@..."
  function nameFromLink(text, fallback) {
    const t = String(text);
    let m = t.match(/[?&]q=([^&#]+)/);
    if (m) { const v = decodeURIComponent(m[1].replace(/\+/g, " ")).trim(); if (v && !/^[-\d.,\s]+$/.test(v)) return v; }
    m = t.match(/\/place\/([^/@?]+)/);
    if (m) { const v = decodeURIComponent(m[1].replace(/\+/g, " ")).trim(); if (v && !parseLatLng(v)) return v; }
    const plain = t.replace(/https?:\/\/\S+/g, "").replace(/-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/g, "").trim();
    return plain || fallback;
  }
  function setHotel(i, h) {
    const c = CITIES[state.stops[i].city];
    const d = km(h.ll, c.stay.ll);
    if (d > 150) { toast(`That spot is ${Math.round(d)} km from ${c.name}. Check it's the right place, or paste the hotel's map link.`); return; }
    state.hotels = state.hotels || {};
    state.hotels[c.id] = h;
    hotelOpen[c.id] = false;
    persist(); renderStops();
    if (d > 40) toast(`Saved, but it's ${Math.round(d)} km from central ${c.name}: double-check the pin.`);
    if (lastPlan) { generate(false); if (d <= 40) toast(`Plan updated: times and directions in ${c.name} now start from ${h.name}.`); }
  }
  function findHotel(i) {
    const c = CITIES[state.stops[i].city];
    const q = ($("#hotelq-" + i).value || "").trim();
    const box = $("#hotelres-" + i);
    if (!q) { toast("Type the hotel's name or address, or paste its coordinates."); return; }
    const ll = parseLatLng(q);
    if (ll) { setHotel(i, { name: nameFromLink(q, "My hotel (map pin)"), ll, src: "pin" }); return; }
    if (isShortMapLink(q)) { box.innerHTML = SHORT_LINK_HELP + nearPicker(i, "hotel", c, ""); return; }
    if (window.NO_PRINT) { box.innerHTML = `<p class="hint">Searching isn't possible inside the Claude preview.</p>` + COORD_TIP + nearPicker(i, "hotel", c, q); return; }
    box.innerHTML = `<p class="hint">Searching OpenStreetMap…</p>`;
    geoSearch(c, q, (rows, why) => {
      if (!rows || !rows.length) { box.innerHTML = (why ? `<p class="hint">${why}</p>` : notFoundMsg(q, c, "hotels")) + COORD_TIP + nearPicker(i, "hotel", c, q); return; }
      hotelResults[i] = rows;
      box.innerHTML = `<p class="hint">Pick your hotel:</p>` + rows.map((r, k) => `<button type="button" class="btn small hotelpick" data-act="hotelpick" data-i="${i}" data-k="${k}"><b>${esc(r.name)}</b><br><span class="hint">${esc(r.addr)} · ${km(r.ll, c.stay.ll).toFixed(1)} km from ${esc(c.stay.area)}</span></button>`).join("") + nearPicker(i, "hotel", c, q);
    });
  }


  // How you get to this stop (from the previous stop, or from the arrival airport): mode + optional times
  function modeSelect(id, fromId, toId, current, extraAttrs) {
    const opts = modesFor(fromId, toId), rec = recommendedMode(fromId, toId);
    return `<select id="${id}" ${extraAttrs} aria-label="How you'll travel from ${esc(CITIES[fromId].name)} to ${esc(CITIES[toId].name)}">
      <option value="">${state.optimise ? `★ Recommend for me (${MODE[rec].label.toLowerCase()})` : "How will you travel? (not chosen)"}</option>
      ${opts.map((m) => `<option value="${m}" ${current === m ? "selected" : ""}>${MODE[m].icon} ${MODE[m].label}${m === rec ? " — recommended" : ""}</option>`).join("")}</select>`;
  }
  function legRow(st, i) {
    const fromId = i > 0 ? state.stops[i - 1].city : state.arrive && state.arrive !== st.city ? state.arrive : null;
    if (!fromId) return "";
    const lt = legTimesFor(st, fromId);
    return `<div class="row legrow"><span class="hint lbl">Getting here from ${esc(CITIES[fromId].name)}:</span>
      ${modeSelect("legmode-" + i, fromId, st.city, lt.mode, `data-act="legmode" data-i="${i}" data-from="${fromId}"`)}
      <span class="pair"><label class="hint" for="legdep-${i}">leaves</label><input type="time" id="legdep-${i}" data-act="legdep" data-i="${i}" data-from="${fromId}" value="${esc(lt.dep || "")}"></span>
      <span class="pair"><label class="hint" for="legarr-${i}">arrives</label><input type="time" id="legarr-${i}" data-act="legarr" data-i="${i}" data-from="${fromId}" value="${esc(lt.arr || "")}"></span></div>`;
  }
  // Last leg, when you fly home from a city that isn't your last stop
  function renderOutLeg() {
    const el = $("#outLegRow");
    if (!el) return;
    const last = state.stops.length ? state.stops[state.stops.length - 1].city : null;
    if (!last || !state.depart || state.depart === last) { el.innerHTML = ""; return; }
    const ol = state.outLeg && state.outLeg.from === last ? state.outLeg : {};
    el.innerHTML = `<div class="row legrow"><span class="hint lbl">Getting from ${esc(CITIES[last].name)} to ${esc(CITIES[state.depart].name)} for your flight:</span>
      ${modeSelect("outLegMode", last, state.depart, ol.mode, `data-act="outlegmode" data-from="${last}"`)}</div>`;
  }

  function renderTally() {
    const nights = state.stops.reduce((a, s) => a + (+s.nights || 0), 0);
    const need = state.days - 1;
    const t = $("#tally");
    if (!state.stops.length) { t.className = "tally"; t.innerHTML = "Add a city to start."; return; }
    if (nights === need) { t.className = "tally ok"; t.innerHTML = `<span>${nights} nights · ${state.days} days</span><span>✓ Fits</span>`; return; }
    const html = `<span>${nights} nights set, ${need} needed for ${state.days} days</span><button type="button" class="btn small" data-act="fit">Fit nights to days</button>`;
    t.className = "tally bad";
    // Don't replace the button while it's being clicked (the days field's change event fires first)
    if (t.innerHTML !== html) t.innerHTML = html;
  }

  function topPicks(cid, n) {
    const types = prefsFrom(state).types;
    return CITIES[cid].places.slice().sort((a, b) => ((b.r || 1) * 9 + b.t.filter((t) => types.has(t)).length * 8) - ((a.r || 1) * 9 + a.t.filter((t) => types.has(t)).length * 8)).slice(0, n);
  }

  function fitNights() {
    const need = Math.max(state.stops.length, state.days - 1);
    let total = state.stops.reduce((a, s) => a + s.nights, 0);
    // Grow or shrink the longest/shortest stops until the total matches
    while (total < need) { const s = state.stops.reduce((a, b) => (b.nights < a.nights ? b : a)); s.nights++; total++; }
    while (total > need) { const s = state.stops.reduce((a, b) => (b.nights > a.nights ? b : a)); if (s.nights <= 1) break; s.nights--; total--; }
    if (state.days - 1 < state.stops.length) state.days = state.stops.length + 1;
    $("#days").value = state.days;
    persist(); renderStops();
  }

  function persist() { save("form", state); isExample = false; }

  function readForm() {
    state.days = Math.max(2, Math.min(45, parseInt($("#days").value, 10) || 2));
    state.start = $("#start").value;
    state.types = TRIP_TYPES.map((t) => t.id).filter((id) => $("#type-" + id).checked);
    state.other = $("#type-other").checked ? $("#otherText").value.trim() : "";
    state.pace = document.querySelector("input[name=pace]:checked").value;
    state.budget = document.querySelector("input[name=budget]:checked").value;
    state.passport = document.querySelector("input[name=passport]:checked").value;
    state.home = document.querySelector("input[name=home]:checked").value;
    state.arrive = $("#arriveSel").value;
    state.depart = $("#departSel").value;
    state.optimise = $("#optimise").checked;
    state.flights = { inTime: $("#inTime").value, inNo: $("#inNo").value.trim().toUpperCase(), outTime: $("#outTime").value, outNo: $("#outNo").value.trim().toUpperCase() };
  }

  function bindForm() {
    $("#addCity").addEventListener("click", () => {
      const id = $("#citySel").value;
      if (!id) { $("#citySel").focus(); return; }
      state.stops.push({ city: id, nights: 2, places: [] });
      $("#citySel").value = "";
      persist(); renderStops();
    });
    $("#planner").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return;
      const i = +b.dataset.i, act = b.dataset.act;
      if ((act === "up" || act === "down") && state.optimise && !state.keepOrder) { state.keepOrder = true; toast("Your city order is kept; transport is still recommended. Tick the box again to re-sort the cities."); }
      if (act === "up" && i > 0) [state.stops[i - 1], state.stops[i]] = [state.stops[i], state.stops[i - 1]];
      else if (act === "down" && i < state.stops.length - 1) [state.stops[i + 1], state.stops[i]] = [state.stops[i], state.stops[i + 1]];
      else if (act === "addtop") {
        const st = state.stops[i];
        const want = Math.min(2 + st.nights, 6);
        const picks = topPicks(st.city, 20).filter((p) => !st.places.includes(p.id) && (!p.s.includes("full") || st.nights > 1));
        const add = picks.slice(0, Math.max(1, want - st.places.length)).map((p) => p.id);
        if (!add.length) { toast("All the top picks for " + CITIES[st.city].name + " are already in your list."); return; }
        st.places = st.places.concat(add);
        toast("Added: " + add.map((id) => CITIES[st.city].places.find((p) => p.id === id).n.split(/[:(]/)[0].trim()).join(", "));
      }
      else if (act === "remove") state.stops.splice(i, 1);
      else if (act === "unplace") {
        state.stops[i].places = state.stops[i].places.filter((x) => x !== b.dataset.id);
        if (/-u[0-9a-z]+$/.test(b.dataset.id) && !state.stops.some((st) => st.places.includes(b.dataset.id))) removeCustomPlace(state.stops[i].city, b.dataset.id);
      }
      else if (act === "fit") { fitNights(); return; }
      else if (act === "hotelfind") { findHotel(i); return; }
      else if (act === "ownfind") { findOwnPlace(i); return; }
      else if (act === "hotelnear" || act === "ownnear") {
        const kind = act === "hotelnear" ? "hotel" : "own";
        const typed = ($("#" + (kind === "hotel" ? "hotelq-" : "ownq-") + i).value || "").trim();
        const name = typed && !/^https?:/i.test(typed) ? typed : kind === "hotel" ? "My hotel" : "My place";
        const n = nearChoice(i, kind);
        if (kind === "hotel") setHotel(i, { name, ll: n.ll, src: "near", near: n.label });
        else addOwnPlace(i, { name, ll: n.ll, addr: "placed near " + n.label + " (approximate)" });
        return;
      }
      else if (act === "ownpick") { const r = (ownResults[i] || [])[+b.dataset.k]; if (r) addOwnPlace(i, r); return; }
      else if (act === "ownnopin") { const q = ($("#ownq-" + i).value || "").trim(); if (q) addOwnPlace(i, { name: q, ll: null }); return; }
      else if (act === "hotelpick") { const r = (hotelResults[i] || [])[+b.dataset.k]; if (r) setHotel(i, { name: r.name, ll: r.ll, src: "search" }); return; }
      else return;
      persist(); renderStops();
    });
    $("#planner").addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.act === "place" && t.value) { state.stops[+t.dataset.i].places.push(t.value); persist(); renderStops(); return; }
      if (t.dataset.act === "hotelsel") {
        const i = +t.dataset.i, c = CITIES[state.stops[i].city];
        if (t.value === "") { if (state.hotels) delete state.hotels[c.id]; hotelOpen[c.id] = false; persist(); renderStops(); if (lastPlan) generate(false); return; }
        if (t.value === "other") { hotelOpen[c.id] = true; renderStops(); const q = $("#hotelq-" + i); if (q) q.focus(); return; }
        const k = +t.value.split(":")[1], x = c.hotels[k];
        setHotel(i, { name: x.n, ll: x.ll, src: "list", k });
        return;
      }
      if (t.dataset.act === "legdep" || t.dataset.act === "legarr" || t.dataset.act === "legmode") {
        const st = state.stops[+t.dataset.i];
        if (!st.leg || st.leg.from !== t.dataset.from) st.leg = { from: t.dataset.from };
        st.leg[t.dataset.act === "legdep" ? "dep" : t.dataset.act === "legarr" ? "arr" : "mode"] = t.value;
        persist(); return;
      }
      if (t.dataset.act === "outlegmode") { state.outLeg = { from: t.dataset.from, mode: t.value }; persist(); return; }
      if (t.dataset.act === "nights") { state.stops[+t.dataset.i].nights = Math.max(1, Math.min(30, parseInt(t.value, 10) || 1)); persist(); renderTally(); return; }
      if (t.id === "arriveSel" || t.id === "departSel" || t.id === "optimise") {
        readForm();
        if (t.id === "optimise") state.keepOrder = false;
        if (arrangeStops()) toast("Cities re-ordered to start and end at your airports.");
        persist(); renderStops(); return;
      }
      if (t.id === "type-other") { $("#otherText").hidden = !t.checked; if (t.checked) $("#otherText").focus(); }
      readForm(); persist(); renderTally();
    });
    $("#days").addEventListener("input", () => { readForm(); renderTally(); });
    $("#planner").addEventListener("submit", (e) => {
      e.preventDefault();
      readForm();
      if (!state.stops.length) { toast("Add at least one city first."); $("#citySel").focus(); return; }
      const nights = state.stops.reduce((a, s) => a + s.nights, 0);
      if (nights !== state.days - 1) { toast(`Your nights add up to ${nights} but ${state.days} days needs ${state.days - 1}. Use “Fit nights to days” or adjust.`); $("#tally").scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      reordered = arrangeStops();
      persist(); renderStops();
      generate(true);
    });
  }

  /* ---------- rendering ---------- */
  let currentTab = load("tab") || "plan";
  let lastPlan = null;

  function fmtDate(d) { return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""; }
  function mapLinks(p, city) {
    const q = encodeURIComponent(p.n.split(/[:(&]/)[0].trim() + " " + city.name);
    const zh = encodeURIComponent(p.zh || p.n);
    return `<div class="maplinks"><a href="https://maps.apple.com/?q=${q}&sll=${p.ll[0]},${p.ll[1]}" target="_blank" rel="noopener">Apple Maps ↗</a>${city.region === "mainland" ? `<a href="https://uri.amap.com/search?keyword=${zh}" target="_blank" rel="noopener">Amap ↗</a>` : `<a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Google Maps ↗</a>`}</div>`;
  }

  function eatHTML(eat) {
    if (!eat) return "";
    const items = eat.located.map((h) => `<li><b>${esc(h.n)}</b> <span class="dist">${h.d < 1 ? Math.round(h.d * 1000) + " m" : h.d.toFixed(1) + " km"}</span> — ${esc(h.note)}</li>`);
    eat.general.forEach((h) => items.push(`<li><b>${esc(h.n)}</b> — ${esc(h.note)}</li>`));
    if (eat.far) items.push(`<li>Nothing certified close by: look for a <span class="han">清真</span> sign (Lanzhou noodle shops are everywhere in the mainland), or bring snacks.</li>`);
    return `<div class="eat"><b>${esc(eat.label)}</b><ul>${items.join("")}</ul></div>`;
  }

  // Side-by-side options for a leg with no mode chosen
  function legOptionsHTML(a, b) {
    const rec = recommendedMode(a, b);
    return `<div class="opts"><table><thead><tr><th>Option</th><th>Door to door</th><th>Approx. cost</th></tr></thead><tbody>
      ${modesFor(a, b).map((m) => { const e = modeEstimate(m, a, b); return `<tr><td>${MODE[m].icon} ${MODE[m].label}${m === rec ? ' <span class="badge top">recommended</span>' : ""}</td><td>${dur(e.door)}</td><td>${esc(e.cost)}</td></tr>`; }).join("")}
    </tbody></table></div>`;
  }

  function slotHTML(s, day) {
    const city = day.city;
    const when = SLOT[s.part];
    const head = `<div class="slot-when"><b>${when.label}</b><span>${esc(s.when || when.time)}</span></div>`;
    let body = "";
    if (s.type === "act") {
      const p = s.p;
      const pc = s.inCity || city;
      body = `${s.inCity ? `<p class="timing"><b>Before you leave ${esc(s.inCity.name)}:</b> check out after breakfast and leave your bags at reception.</p>` : ""}
        <div class="how"><b class="k">${esc(s.how.mode)}</b>${s.how.text}</div>
        <p class="act-name">${esc(p.n)}${p.zh ? `<span class="han">${esc(p.zh)}</span>` : ""} <span class="badge ${s.why[0]}">${esc(s.why[1])}</span></p>
        <p class="act-desc">${esc(p.d)}</p>
        <div class="kv"><span>Time needed <b>${esc(p.h)}</b></span><span>Cost <b>${esc(p.c)}</b></span>${p.m ? `<span>Nearest metro <b>${esc(p.m)}</b></span>` : ""}</div>
        ${p.tip ? `<p class="tip">${esc(p.tip)}</p>` : ""}
        ${guideTip(pc, p)}
        ${mapLinks(p, pc)}
        ${s.alt ? `<p class="alt">Prefer something else? <b>${esc(s.alt.n)}</b> — ${esc(s.alt.d.split(". ")[0].replace(/\.$/, ""))}.</p>` : ""}
        ${day.friday && (s.part === "m" || s.part === "full") ? jumuah(pc, p.ll) : ""}
        ${eatHTML(s.eat)}`;
    } else if (s.type === "arrive") {
      const fl = s.flightNo ? `Flight <b>${esc(s.flightNo)}</b> ` : "Your flight ";
      const timing = s.land == null
        ? `<span class="timing">Add your landing time in the form (step 2) and the day is planned around it.</span>`
        : `<span class="timing">${fl}lands at <b>${hhmm(s.land)}</b>. Allow about ${IMMIGRATION} min for immigration and bags.${s.ready != null ? ` With the ~${AIRPORT_MIN[s.flyIn] || 60} min ride into town you'll reach the hotel at about <b>${hhmm(s.ready)}</b>.` : ""}</span>
          ${s.ready != null && s.ready < 14 * 60 ? `<span class="timing">Hotel check-in is usually from 14:00. Ask for early check-in when you book, or leave your bags at reception and head out.</span>` : ""}`;
      body = s.via
        ? `<div class="travel"><b class="k">Land in ${esc(s.city.name)}</b>${timing}${fromSyd() ? `<span>${sydLine(s.flyIn, "in")}</span>` : ""}<span>${esc(s.text)}</span></div>`
        : `<div class="travel"><b class="k">Arrive & check in</b>${timing}${fromSyd() ? `<span>${sydLine(s.flyIn, "in")}</span>` : ""}<span>${esc(s.text)}</span><span>Check in ${userHotel(city) ? "at" : "to your hotel in"} <b>${esc(stayName(city))}</b>, rest, and change money/test Alipay if you haven't.</span></div>`;
    } else if (s.type === "travel") {
      body = `<div class="travel"><b class="k">${s.toFlight ? "To your flight" : s.sameDay ? "Onward the same day" : "Travel day"} · ${esc(s.from.name)} → ${esc(s.to.name)}</b>
        ${s.dep != null ? `<span class="timing">${s.est ? `Estimated${s.leg && !s.leg.chosen ? " (assuming " + MODE[s.leg.rec].label.toLowerCase() + ")" : ""}: departs` : "Departs"} <b>${hhmm(s.dep)}</b>, arrives <b>${hhmm(s.arr)}</b>${s.est ? " — add your booked times in the form for an exact plan" : ""}.${s.leaveBy != null && !s.toFlight ? ` Leave the hotel by <b>${hhmm(s.leaveBy)}</b>.` : ""}</span>` : !s.toFlight ? `<span class="timing">No times entered — add your departure and arrival times on the ${esc(s.to.name)} card in the form for an exact plan.</span>` : ""}
        ${s.toFlight && s.leaveBy != null ? `<span class="timing">To make your flight home, leave ${esc(s.from.name)} by <b>${hhmm(s.leaveBy)}</b> (estimated door to door, with ${INTL_BUFFER / 60} h at the airport).</span>` : ""}
        ${s.collect ? `<span><b>Collect your bags first:</b> ${s.collect}</span>` : ""}
        ${s.toFlight ? `<span>Check out early and leave at least 3 h at the airport before your international flight.</span>` : !s.collect && !s.sameDay ? `<span>Check out after breakfast.</span>` : ""}
        ${s.leg && s.leg.auto
          ? `<span><b>★ Recommended for you: ${MODE[s.leg.chosen].icon} ${MODE[s.leg.chosen].label}.</b> ${esc(s.leg.reason)}</span><span>${esc(s.text)}</span>
             <details class="opts-more"><summary>Compare other options</summary>${legOptionsHTML(s.fromId, s.toId)}<span class="hint">Change it with “Getting here” on the ${esc(s.toFlight ? "“Fly home from” section" : s.to.name + " card")}.</span></details>`
          : s.leg && s.leg.chosen
          ? `<span><b>${MODE[s.leg.chosen].icon} ${MODE[s.leg.chosen].label}:</b> ${esc(s.text)}</span>`
          : `<span><b>How you'll travel isn't chosen yet.</b> Pick it on the ${esc(s.toFlight ? "“Fly home from” section" : s.to.name + " card")} in the form. Until then, timings assume the usual choice (${MODE[(s.leg || {}).rec || "train"].label.toLowerCase()}).</span>${legOptionsHTML(s.fromId, s.toId)}`}
        ${s.border ? `<span><b>Border crossing:</b> passport out. ${isAU() ? (s.to.region === "mainland" ? "Australians: entering the mainland starts a fresh visa-free stay of up to 30 days." : s.to.region === "hk" ? "Australians: visa-free in Hong Kong for up to 90 days." : "Australians: visa-free entry to Macau.") : "Leaving or entering the mainland uses one visa entry — see Before you go."}</span>` : ""}
        ${s.toFlight ? "" : `<span><b>On arrival:</b> ${esc(s.arrive)}</span>
        <span>Check in ${userHotel(s.to) ? "at" : "to your hotel in"} <b>${esc(stayName(s.to))}</b>.</span>`}</div>
        ${s.toFlight || (s.arr != null && s.arr >= 16 * 60) ? "" : eatHTML({ label: s.sameDay || (s.arr != null && s.arr >= 14 * 60) ? "First meal on arrival (halal)" : "Lunch on arrival (halal)", ...eatNear(s.to, stayLL(s.to)) })}`;
    } else if (s.type === "depart") {
      const fl = s.flightNo ? `Flight <b>${esc(s.flightNo)}</b> ` : "Your flight ";
      const timing = s.off == null
        ? `<span class="timing">Add your take-off time in the form (step 2) and the last day is planned around it.</span>`
        : `<span class="timing">${fl}takes off at <b>${hhmm(s.off)}</b>. Be at the airport by <b>${hhmm(s.off - INTL_BUFFER)}</b>${s.leaveBy != null ? ` — leave the hotel by <b>${hhmm(s.leaveBy)}</b> (about ${s.airportMin} min to the airport)` : ""}.</span>`;
      body = `<div class="travel"><b class="k">Departure</b>${timing}${s.collect ? `<span><b>Collect your bags first:</b> ${s.collect}</span>` : ""}<span>${day.flyOut === day.cityId ? "Check out (usually by 12:00; ask the hotel to hold bags). " : ""}${esc(s.text)}</span>${fromSyd() ? `<span>${sydLine(s.flyOut, "out")}</span>` : ""}${fromSyd() && isAU() ? `<span><b>Landing in Sydney:</b> declare all food, plant and animal products (many Chinese snacks contain meat, egg or seeds). Duty-free allowance: A$900 of goods, 2.25 L alcohol, 25 cigarettes.</span>` : ""}</div>`;
    } else if (s.type === "rest") {
      body = `<p class="act-name">Free time & rest</p><p class="act-desc">Keep this block open: nap, pray, do laundry, or revisit somewhere you liked. A relaxed pace keeps a 2-week trip enjoyable.</p>`;
    } else if (s.type === "free") {
      body = `<p class="act-name">${s.late ? "Late arrival" : "Easy evening"}</p><p class="act-desc">${esc(s.text)}</p>${eatHTML(s.eat)}`;
    }
    return `<div class="slot"${s.type === "act" ? ` data-pid="${s.p.id}"` : ""}>${head}<div class="slot-what">${body}</div></div>`;
  }

  function jumuah(city, ll) {
    const m = city.mosques.filter((x) => x.ll).map((x) => ({ ...x, d: km(ll, x.ll) })).sort((a, b) => a.d - b.d)[0];
    const anyM = m || city.mosques[0];
    if (!anyM) return `<div class="note info"><b class="tag">Jumu'ah</b><span>It's Friday. There's no well-known mosque listed for ${esc(city.name)}; search 清真寺 in Amap. Check prayer times in Muslim Pro.</span></div>`;
    const far = m && m.d > 10 ? ` This trip is far from it: to attend Jumu'ah, swap this day with another in ${esc(city.name)}, or pray Dhuhr where you are (travellers' concession).` : " Finish the morning by about 12:00.";
    return `<div class="note info"><b class="tag">Jumu'ah</b><span>It's Friday: ${esc(anyM.n)}${m ? ` (${m.d < 1 ? "a few minutes' walk" : m.d.toFixed(1) + " km away"})` : ""}. The khutbah usually starts around 12:30–13:30; check the time locally.${far}</span></div>`;
  }

  const KIND = { arrival: "Arrival", transfer: "Travel day", full: "", depart: "Departure" };
  function dayTitle(day) {
    const acts = day.slots.filter((s) => s.type === "act").map((s) => s.p.n.split(/[:(]/)[0].trim());
    if (day.kind === "arrival" && day.flyIn !== day.cityId) return `Land in ${CITIES[day.flyIn].name}, on to ${day.city.name}` + (acts.length ? ` · ${acts[0]}` : "");
    if (day.kind === "arrival") return `Arrive in ${day.city.name}` + (acts.length ? ` · ${acts[0]}` : "");
    if (day.kind === "transfer") return `To ${day.city.name}` + (acts.length ? ` · ${acts.join(" & ")}` : "");
    if (day.kind === "depart" && day.flyOut !== day.cityId) return `${day.city.name} → ${CITIES[day.flyOut].name}, then fly home`;
    if (day.kind === "depart") return `Last morning in ${day.city.name}, then home`;
    return acts.join(" · ") || `${day.city.name} at your own pace`;
  }

  /* ---------- the day's timeline: timed, balanced, and editable by the traveller ---------- */
  const TL_ICON = { breakfast: "🍳", sight: "📍", meal: "🍽", cafe: "☕", shop: "🛍", travel: "🚄", flight: "✈", hotel: "🏨", rest: "🛌", free: "🌙", prayer: "🕌", custom: "✳️" };
  const TL_ADD = [["custom:cafe", "☕ Café / coffee / tea"], ["custom:meal", "🍽 Restaurant or meal (type a name)"], ["custom:shop", "🛍 Shopping"], ["custom:rest", "🛌 Rest / free time"], ["custom:custom", "✳️ Something else"]];
  const r5 = (m) => Math.round(m / 5) * 5;
  // "3–4 h" → 3.5, "45 min" → 0.75, "Full day" → 8
  function hoursOf(h) {
    const t = String(h || "").toLowerCase();
    if (/full day/.test(t)) return 8;
    const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (!nums.length) return 1.5;
    const v = nums.length > 1 && /[–-]/.test(t) ? (nums[0] + nums[1]) / 2 : nums[0];
    return /min/.test(t) && !/\bh\b/.test(t) ? v / 60 : v;
  }
  function cafeTip(city) {
    if (city.region === "hk") return "Pacific Coffee, a cha chaan teng for milk tea, or a café near the sight.";
    if (city.region === "mo") return "A Portuguese-style café for an egg tart (ask about lard) and coffee.";
    return "Luckin or Manner coffee, a local tea house, or a 清真 bakery for snacks.";
  }
  const dayKey = (day, i) => `${i}|${day.cityId}|${day.kind}`;

  // Build the suggested timeline for a day from its planned slots
  function buildTimeline(day) {
    const items = [], city = day.city;
    let t = null, ateDinner = false, lastLL = null;
    const push = (o) => { o.id = "a" + items.length; items.push(o); if (o.ll) lastLL = o.ll; return o; };
    const firstEat = (eat) => (eat && eat.located && eat.located[0]) || null;
    const dinner = (eat) => {
      if (ateDinner) return;
      const ds = r5(Math.max(t || 18 * 60 + 30, 18 * 60 + 15));
      if (t != null && ds - t >= 75) push({ k: "shop", title: "Free time — shopping or a stroll nearby", start: r5(t + 10), end: r5(ds - 15), note: "Or head back to the hotel to rest before dinner." });
      const e = firstEat(eat);
      push({ k: "meal", title: e ? "Dinner — " + e.n : "Dinner (halal)", start: ds, end: ds + 60, note: e ? e.note : city.halalTip, ll: e && e.ll });
      t = ds + 60; ateDinner = true;
    };
    day.slots.forEach((s) => {
      if (s.type === "arrive") {
        if (s.land != null) {
          push({ k: "flight", title: `${s.flightNo ? s.flightNo + " lands" : "Flight lands"} in ${s.city.name}`, start: s.land, end: s.land + IMMIGRATION, note: "Immigration, bags and customs." });
          if (!s.via) { push({ k: "hotel", title: `To the hotel (${stayName(city)})`, ll: stayLL(city), start: s.land + IMMIGRATION, end: s.ready, note: s.ready < 14 * 60 ? "Check-in is usually from 14:00 — leave your bags at reception." : "Check in." }); t = s.ready; }
          else t = s.land + IMMIGRATION;
        } else { push({ k: "hotel", title: "Arrive, check in and rest", start: 9 * 60, end: 12 * 60 + 30, note: "Add your landing time in step 2 to plan this exactly." }); t = 13 * 60 + 15; }
        return;
      }
      if (s.type === "travel") {
        const mode = (s.leg && (s.leg.chosen || s.leg.assumed)) || "train";
        const e = modeEstimate(mode, s.fromId, s.toId);
        let dep = s.dep, arr = s.arr;
        if (s.toFlight) {
          dep = s.leaveBy != null ? s.leaveBy : r5(Math.max(t || 9 * 60, 9 * 60));
          push({ k: "travel", icon: MODE[mode].icon, title: `${MODE[mode].label}: ${s.from.name} → ${s.to.name} for your flight`, start: dep, end: dep + e.door - 30, note: s.collect ? "Collect your bags from the hotel first." : "" });
          t = dep + e.door - 30;
          return;
        }
        if (dep == null) { dep = r5(Math.max(t || 9 * 60, 8 * 60 + 30) + e.lead); arr = dep + e.door - e.lead - 40; }
        else if (arr == null) arr = dep + e.door - e.lead - 40;
        const leave = s.leaveBy != null ? s.leaveBy : dep - e.lead;
        if (!s.sameDay && e.lead > 0) push({ k: "hotel", title: `Check out${s.collect ? " (collect your bags)" : ""} and go to the ${mode === "flight" ? "airport" : mode === "train" ? "station" : mode === "boat" ? "pier" : "pick-up point"}`, start: leave, end: dep });
        push({ k: "travel", icon: MODE[mode].icon, title: `${MODE[mode].label}: ${s.from.name} → ${s.to.name}`, start: dep, end: arr, note: s.dep == null || s.est ? "Estimated — add your booked times on the " + s.to.name + " card." : "" });
        push({ k: "hotel", title: `Check in — ${stayName(s.to)}`, start: arr + 20, end: arr + 60, ll: stayLL(s.to) });
        t = arr + 60;
        return;
      }
      if (s.type === "act") {
        const p = s.p, actCity = s.inCity || city, hotel = hotelPoint(actCity);
        const durH = Math.min(hoursOf(p.h), s.part === "full" ? 9 : s.part === "n" ? 2.5 : 4);
        const base = s.inCity ? 9 * 60 : s.part === "full" ? 8 * 60 : s.part === "m" ? 9 * 60 : s.part === "e" ? 13 * 60 + 30 : 19 * 60 + 30;
        if (s.part === "n") dinner(s.eat);
        // travel time from wherever you actually are (hotel, lunch spot, last sight)
        const here = { ll: lastLL || hotel.ll, m: lastLL ? null : hotel.m };
        const g = getThere(here, p, actCity);
        let mins = g.mins != null ? g.mins : 20;
        const far = p.x && km(here.ll, p.ll) > 12;
        if (far) {
          // day trips out of town get their own travel blocks there and back
          const dep = r5(Math.max(t == null ? (s.part === "full" ? 7 * 60 + 30 : base - mins) : t + 5, s.part === "full" ? 7 * 60 + 30 : 0));
          push({ k: "travel", icon: "🚐", title: "Travel to " + p.n.split(/[:(]/)[0].trim(), start: dep, end: dep + mins, note: firstSentence(p.x) });
          t = dep + mins; mins = 0;
        }
        const start = r5(Math.max(base, (t == null ? base : t) + mins));
        const end = r5(start + durH * 60);
        push({ k: "sight", title: p.n, start, end, pid: p.id, ll: p.ll, note: far ? (s.part === "full" ? "Bring lunch and water — halal food is rare out here." : "") : mins < 3 ? "Right next to the previous stop." : `${g.mode} ~${mins} min from the previous stop.`, why: s.why ? s.why[1] : "" });
        t = end;
        if (far) {
          const back = getThere(p, hotel, actCity).mins || mins;
          push({ k: "travel", icon: "🚐", title: "Back to " + actCity.name, start: r5(t + 10), end: r5(t + 10 + back), ll: hotel.ll });
          t = r5(t + 10 + back);
        }
        if (s.part === "m") {
          if (day.friday) {
            const mq = (city.mosques.filter((x) => x.ll).map((x) => ({ x, d: km(p.ll, x.ll) })).sort((a, b) => a.d - b.d)[0] || {}).x || city.mosques[0];
            if (mq) { const ps = r5(Math.max(t + 20, 12 * 60 + 30)); push({ k: "prayer", title: "Jumu'ah — " + mq.n, start: ps, end: ps + 60, note: "Check the khutbah time locally.", ll: mq.ll }); t = ps + 60; }
          }
          const e = firstEat(s.eat);
          const ls = r5(Math.max(t + 10, 11 * 60 + 45));
          push({ k: "meal", title: e ? "Lunch — " + e.n : "Lunch (halal)", start: ls, end: ls + 60, note: e ? e.note : "Look for a 清真 noodle shop nearby.", ll: e && e.ll });
          t = ls + 60;
        }
        if (s.part === "e" && t <= 17 * 60) { push({ k: "cafe", title: "Coffee or tea break", start: r5(t + 10), end: r5(t + 40), note: cafeTip(city) }); t = r5(t + 40); }
        return;
      }
      if (s.type === "rest") { const st = r5(Math.max(t || 14 * 60, 13 * 60 + 30)); push({ k: "rest", title: "Free time & rest", start: st, end: st + 150, note: "Nap, pray, do laundry or revisit somewhere you liked." }); t = st + 150; return; }
      if (s.type === "free") {
        if (!s.late) dinner(s.eat);
        const st = r5(Math.max(t || 19 * 60 + 30, s.late ? (t || 21 * 60) : 19 * 60 + 30));
        push({ k: s.late ? "hotel" : "free", title: s.late ? "Check in, a late meal and rest" : "Easy evening", start: st, end: st + 90, note: s.text });
        t = st + 90;
        return;
      }
      if (s.type === "depart") {
        if (s.off != null) {
          if (s.leaveBy != null) push({ k: "hotel", title: "Collect your bags and leave for the airport", start: s.leaveBy, end: s.leaveBy + s.airportMin, note: s.collect ? "Back to the hotel first: " + String(s.collect).replace(/<[^>]+>/g, "") : "" });
          push({ k: "flight", title: "At the airport: check in, security and immigration", start: s.off - INTL_BUFFER, end: s.off - 30 });
          push({ k: "flight", title: `${s.flightNo ? s.flightNo + " takes" : "Take"} off — ${CITIES[s.flyOut].name} → home`, start: s.off, end: s.off });
        } else {
          const st = r5(Math.max(t || 12 * 60, 12 * 60));
          push({ k: "hotel", title: "Check out and head to the airport", start: st, end: st + (AIRPORT_MIN[s.flyOut] || 60), note: "Add your take-off time in step 2 to plan this exactly." });
        }
      }
    });
    if (day.back && t != null && !items.some((x) => x.k === "flight" && /off/.test(x.title))) push({ k: "hotel", title: "Back to the hotel", start: r5(t + 5), end: r5(t + 5 + (day.back.mins || 20)), note: String(day.back.text).replace(/<[^>]+>/g, "") });
    // Breakfast before the first planned item (not on arrival day)
    if (day.kind !== "arrival" && items.length) {
      const first = Math.min.apply(null, items.map((x) => x.start));
      if (first >= 7 * 60 + 15) {
        const bs = r5(Math.max(first - 60, 7 * 60));
        push({ k: "breakfast", title: "Breakfast", start: bs, end: Math.max(bs + 30, r5(first - 15)), note: city.region === "mainland" ? "Hotel breakfasts are rarely halal-certified: stick to eggs, bread, fruit and congee, or find a 清真 noodle or bun shop." : "Plenty of cafés nearby; ask about halal options." });
      }
    }
    items.forEach((x) => { x.start = Math.round(x.start); x.end = Math.round(Math.max(x.end, x.start)); });
    return items.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  // The day's timeline: the traveller's edited version if there is one, else the suggestion
  function timelineFor(day, i) {
    const ed = state.edits && state.edits[dayKey(day, i)];
    return ed ? ed.map((x) => Object.assign({}, x)) : buildTimeline(day);
  }
  const isEdited = (day, i) => !!(state.edits && state.edits[dayKey(day, i)]);
  function saveTimeline(i, items) {
    const day = lastPlan.days[i];
    state.edits = state.edits || {};
    state.edits[dayKey(day, i)] = items.sort((a, b) => a.start - b.start || a.end - b.end);
    persist();
  }

  let editingDay = null;
  let lastPrintArgs = null;

  function timelineHTML(i) {
    const day = lastPlan.days[i], items = timelineFor(day, i), city = day.city;
    const slotPids = new Set(day.slots.filter((s) => s.type === "act").map((s) => s.p.id));
    const head = `<div class="tl-head"><h5>Your day, hour by hour</h5>${isEdited(day, i) ? '<span class="badge pick">edited by you</span>' : '<span class="hint">suggested — edit anything</span>'}
      ${editingDay === i ? "" : `<button type="button" class="btn small" data-tledit="${i}">✏️ Edit this day</button>`}</div>`;
    if (editingDay === i) return head + timelineEditor(i, items, city);
    let prevEnd = null, prevLL = null;
    const rows = items.map((x) => {
      let pre = "";
      if (prevEnd != null && x.start - prevEnd >= 60) pre = `<li class="tl-gap">Free time · ${dur(x.start - prevEnd)}</li>`;
      const overlap = prevEnd != null && x.start < prevEnd - 1;
      const p = x.pid ? findPlace(city, x.pid) : null;
      const extra = p && !slotPids.has(p.id) ? `<div class="tl-more">${esc(firstSentence(p.d))} <span class="hint">${esc(p.h)} · ${esc(p.c)}${p.m ? " · Metro " + esc(p.m) : ""}</span>${mapLinks(p, city)}</div>` : "";
      const hop = x.ll && prevLL && x.k !== "sight" && x.k !== "travel" && !x.ask ? (() => { const g = getThere({ ll: prevLL }, { ll: x.ll }, city); return g.mins ? ` <span class="hint">· ${esc(g.mode)} ~${g.mins} min</span>` : ""; })() : "";
      prevEnd = Math.max(prevEnd || 0, x.end);
      if (x.ll) prevLL = x.ll;
      return pre + `<li class="tl-item k-${x.k}${overlap ? " overlap" : ""}"><span class="tl-time">${hhmm(x.start)}${x.end > x.start ? "–" + hhmm(x.end) : ""}</span><span class="tl-icon" aria-hidden="true">${x.icon || TL_ICON[x.k] || "•"}</span>
        <span class="tl-body"><b>${esc(x.title)}</b>${x.why ? ` <span class="badge ${/pick/i.test(x.why) ? "pick" : /top/i.test(x.why) ? "top" : "rec"}">${esc(x.why)}</span>` : ""}${hop}${overlap ? ' <span class="badge pick">overlaps the previous item</span>' : ""}
        ${x.note ? `<span class="tl-note">${esc(x.note)}</span>` : ""}${extra}</span></li>`;
    }).join("");
    return head + `<ol class="tl-list">${rows}</ol>`;
  }
  const findPlace = (city, pid) => city.places.find((p) => p.id === pid);

  function timelineEditor(i, items, city) {
    const day = lastPlan.days[i];
    const used = new Set(items.map((x) => x.pid).filter(Boolean));
    const sights = city.places.filter((p) => !used.has(p.id)).map((p) => `<option value="place:${p.id}">📍 ${esc(p.n.length > 38 ? p.n.split(/[:(]/)[0].trim() : p.n)}${p.r === 3 ? " ★" : ""}</option>`).join("");
    const halal = city.halal.map((h, k) => `<option value="halal:${k}">🍽 ${esc(h.n)}</option>`).join("");
    const rows = items.map((x) => `<div class="tl-row" data-day="${i}" data-id="${x.id}">
        <input type="time" step="300" value="${hhmm(x.start)}" data-tl="start" aria-label="Start time">
        <span aria-hidden="true">–</span>
        <input type="time" step="300" value="${hhmm(x.end)}" data-tl="end" aria-label="End time">
        <span class="tl-icon" aria-hidden="true">${x.icon || TL_ICON[x.k] || "•"}</span>
        <input type="text" value="${esc(x.title)}" data-tl="title" aria-label="What">
        <button type="button" class="icon-btn" data-tldel="${x.id}" aria-label="Remove ${esc(x.title)}">✕</button>
        <input type="text" class="tl-notein" value="${esc(x.note || "")}" data-tl="note" placeholder="Note (optional)" aria-label="Note">
      </div>`).join("");
    const lastEnd = items.length ? Math.max.apply(null, items.map((x) => x.end)) : 9 * 60;
    return `<div class="tl-edit" data-day="${i}">
      <p class="hint">Change times, rename or remove anything, or add your own. Items sort by start time. “Fix overlaps” moves anything that clashes to start after the item before it, keeping each item's length.</p>
      ${rows}
      <div class="tl-add">
        <b>Add to ${esc(city.name)} · ${day.date ? fmtDate(day.date) : "day " + (i + 1)}</b>
        <select id="tlAddWhat-${i}" aria-label="What to add">
          <optgroup label="Sights in ${esc(city.name)}">${sights}</optgroup>
          <optgroup label="Halal food in ${esc(city.name)}">${halal}</optgroup>
          <optgroup label="Your own">${TL_ADD.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</optgroup>
        </select>
        <input type="text" id="tlAddName-${i}" placeholder="Name (for your own items)" aria-label="Name">
        <span class="pair"><label class="hint" for="tlAddStart-${i}">from</label><input type="time" step="300" id="tlAddStart-${i}" value="${hhmm(Math.min(lastEnd + 15, 22 * 60))}"></span>
        <span class="pair"><label class="hint" for="tlAddEnd-${i}">to</label><input type="time" step="300" id="tlAddEnd-${i}" value=""></span>
        <button type="button" class="btn small" data-tladd="${i}">+ Add</button>
      </div>
      <div class="actions"><button type="button" class="btn small" data-tlflow="${i}">↧ Fix overlaps</button><button type="button" class="btn small" data-tlreset="${i}">↺ Reset day</button><button type="button" class="btn small print-btn" data-tldone="${i}">✓ Done</button></div>
    </div>`;
  }

  // Redraw one day after an edit, plus everything that summarises it
  function refreshDay(i) {
    const el = document.getElementById("tl-" + i);
    if (el) el.innerHTML = timelineHTML(i);
    const day = lastPlan.days[i];
    const pids = new Set(timelineFor(day, i).map((x) => x.pid).filter(Boolean));
    document.querySelectorAll(`#day-${i + 1} .slot[data-pid]`).forEach((sl) => (sl.hidden = !pids.has(sl.dataset.pid)));
    const g = $("#glanceBox");
    if (g) g.innerHTML = glanceHTML(lastPlan);
    if (lastPrintArgs) buildPrintView(lastPlan, lastPrintArgs);
    addAUD(el);
  }

  function editTimeline(e) {
    const t = e.target;
    const row = t.closest(".tl-row");
    if (row && t.dataset.tl) {
      const i = +row.dataset.day, items = timelineFor(lastPlan.days[i], i), it = items.find((x) => x.id === row.dataset.id);
      if (!it) return false;
      const f = t.dataset.tl;
      if (f === "start" || f === "end") {
        const m = toMin(t.value);
        if (m == null) return true;
        const len = it.end - it.start;
        if (f === "start") { it.start = m; it.end = m + Math.max(len, 0); } // moving the start moves the whole item
        else it.end = Math.max(m, it.start);
      } else it[f] = t.value;
      if (f === "title") delete it.why;
      saveTimeline(i, items);
      if (f === "start" || f === "end") refreshDay(i);
      else { const g = $("#glanceBox"); if (g) g.innerHTML = glanceHTML(lastPlan); if (lastPrintArgs) buildPrintView(lastPlan, lastPrintArgs); }
      return true;
    }
    return false;
  }

  function clickTimeline(e) {
    const b = e.target.closest("[data-tledit],[data-tldone],[data-tldel],[data-tladd],[data-tlflow],[data-tlreset]");
    if (!b) return false;
    if (b.dataset.tledit != null) { editingDay = +b.dataset.tledit; refreshDay(editingDay); return true; }
    if (b.dataset.tldone != null) { const i = +b.dataset.tldone; editingDay = null; refreshDay(i); toast("Saved. Your changes appear in the summary, printout and offline copy."); return true; }
    const i = +(b.dataset.tladd || b.dataset.tlflow || b.dataset.tlreset || b.closest(".tl-row, .tl-edit").dataset.day);
    const day = lastPlan.days[i], city = day.city;
    let items = timelineFor(day, i);
    if (b.dataset.tldel != null) items = items.filter((x) => x.id !== b.dataset.tldel);
    if (b.dataset.tlflow != null) {
      // keep the order, each item's length and any gaps you left; just push overlapping items later
      let tt = null;
      items.sort((a, b) => a.start - b.start || a.end - b.end).forEach((x) => { const len = x.end - x.start; if (tt != null && x.start < tt && x.k !== "flight") x.start = tt; x.end = x.start + len; tt = Math.max(tt || 0, x.end); });
    }
    if (b.dataset.tlreset != null) {
      delete state.edits[dayKey(day, i)]; state.asks = (state.asks || []).filter((a) => a.key !== dayKey(day, i)); persist(); renderAskHistory(); refreshDay(i); toast("Day reset to the suggested plan."); return true;
    }
    if (b.dataset.tladd != null) {
      const what = $("#tlAddWhat-" + i).value, name = $("#tlAddName-" + i).value.trim();
      const start = toMin($("#tlAddStart-" + i).value);
      if (start == null) { toast("Pick a start time for the new item."); return true; }
      let it;
      if (what.indexOf("place:") === 0) {
        const p = findPlace(city, what.slice(6));
        it = { k: "sight", title: p.n, pid: p.id, ll: p.ll, start, end: start + Math.round(Math.min(hoursOf(p.h), 4) * 60), note: p.tip ? firstSentence(p.tip) : "" };
      } else if (what.indexOf("halal:") === 0) {
        const h = city.halal[+what.slice(6)];
        it = { k: "meal", title: (start < 11 * 60 ? "Breakfast — " : start < 16 * 60 ? "Lunch — " : "Dinner — ") + h.n, ll: h.ll, start, end: start + 60, note: h.note };
      } else {
        const k = what.split(":")[1];
        const lens = { cafe: 30, meal: 60, shop: 60, rest: 60, custom: 60 };
        const names = { cafe: "Coffee or tea break", meal: "Meal", shop: "Shopping", rest: "Rest / free time", custom: "My plan" };
        it = { k, title: name || names[k], start, end: start + lens[k], note: name && k !== "custom" ? "" : "" };
      }
      const endIn = toMin($("#tlAddEnd-" + i).value);
      if (endIn != null && endIn > start) it.end = endIn;
      it.id = "u" + Date.now().toString(36);
      items.push(it);
    }
    saveTimeline(i, items);
    refreshDay(i);
    return true;
  }

  /* ---------- "Change my plan": type a request, see it worked out, add it to the day ---------- */
  // Plain-text understanding runs in the page (works offline, on GitHub Pages and in the standalone file).
  // On the claude.ai page, requests it can't read can also be sent to Claude, which returns the same command.
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const WEEKDAY = [/\bsun(day)?\b/, /\bmon(day)?\b/, /\btue(s|sday)?\b/, /\bwed(nesday)?\b/, /\bthu(rs|rsday)?\b/, /\bfri(day)?\b/, /\bsat(urday)?\b/];
  const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const GENERIC = new Set("the and with from town city mountain mountains temple park museum street old lake river tower towers palace great national scenic area night market view bridge garden gardens hall road west east north south ancient centre center square new tour trip visit day half full".split(" "));
  const norm = (s) => String(s || "").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9一-鿿]+/g, " ").trim();
  const MEAL_WIN = { breakfast: [7 * 60 + 30, 8 * 60 + 30], lunch: [12 * 60, 13 * 60], dinner: [18 * 60 + 30, 19 * 60 + 30] };
  const PART_WIN = { morning: [9 * 60, 12 * 60 + 30], afternoon: [13 * 60 + 30, 17 * 60 + 30], evening: [17 * 60, 21 * 60 + 30], night: [19 * 60, 22 * 60], "half day": [13 * 60, 18 * 60], "full day": [8 * 60, 18 * 60 + 30] };

  // "5pm", "5:30 pm", "17:00", "10" → {m, ap}
  function clockOf(str) {
    const m = String(str).trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
    if (!m) return null;
    let h = +m[1];
    const min = m[2] ? +m[2] : 0, ap = m[3] ? m[3][0] : null;
    if (h > 23 || min > 59) return null;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return { m: h * 60 + min, ap, bare: !ap && !m[2] };
  }
  // A bare hour like "5" or "10" means the afternoon/evening unless it's 8–11
  const settle = (c, other) => {
    if (!c || c.ap || c.m >= 12 * 60) return c;
    if (other && other.ap === "p" && c.m + 720 < other.m + (other.m < 12 * 60 ? 720 : 0)) return Object.assign({}, c, { m: c.m + 720 });
    if (c.m < 8 * 60) return Object.assign({}, c, { m: c.m + 720 });
    return c;
  };

  // Which day of the trip the request is about
  function parseDay(t, plan) {
    const days = plan.days;
    const byDate = (y, mo, d) => days.findIndex((x) => x.date && x.date.getMonth() === mo && x.date.getDate() === d && (y == null || x.date.getFullYear() === y));
    let m = t.match(/\bday\s*(\d{1,2})\b/);
    if (m) { const i = +m[1] - 1; return { i: i >= 0 && i < days.length ? i : -1, said: "day " + m[1], cut: m[0] }; }
    m = t.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?" + MON_RE + "\\b(?:\\s+(\\d{4}))?")) || null;
    let mm = t.match(new RegExp("\\b" + MON_RE + "\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?"));
    if (m || mm) {
      const d = m ? +m[1] : +mm[2], mo = MON[(m ? m[2] : mm[1]).slice(0, 3)], y = (m ? m[3] : mm[3]) ? +(m ? m[3] : mm[3]) : null;
      if (!days[0].date) return { i: -2, said: (m || mm)[0], cut: (m || mm)[0] };
      return { i: byDate(y, mo, d), said: (m || mm)[0], cut: (m || mm)[0] };
    }
    m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      if (!days[0].date) return { i: -2, said: m[0], cut: m[0] };
      return { i: byDate(m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null, +m[2] - 1, +m[1]), said: m[0], cut: m[0] };
    }
    m = t.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/);
    if (m) {
      if (!days[0].date) return { i: -2, said: m[0], cut: m[0] };
      return { i: days.findIndex((x) => x.date.getDate() === +m[1]), said: m[0], cut: m[0] };
    }
    if (/\b(first|arrival) day\b/.test(t)) return { i: 0, said: "the first day" };
    if (/\b(last|final|departure) day\b/.test(t)) return { i: days.length - 1, said: "the last day" };
    for (let w = 0; w < 7; w++) {
      if (WEEKDAY[w].test(t)) {
        if (!days[0].date) return { i: -2, said: t.match(WEEKDAY[w])[0] };
        return { i: days.findIndex((x) => x.date.getDay() === w), said: t.match(WEEKDAY[w])[0] };
      }
    }
    return null;
  }

  // Start/end times, a length ("4 hr"), or a part of the day
  function parseTimes(t) {
    const out = { start: null, end: null, len: null, part: null };
    let s = " " + t.replace(/\b(onwards?|o'?clock|ish|approx(imately)?|around|about|roughly)\b/g, " ") + " ";
    const lm = s.match(/\b(\d+(?:\.\d+)?|half an?|an?|one|two|three|four|five|six|seven|eight)\s*-?\s*(h|hr|hrs|hour|hours)\b/);
    if (lm) { out.len = Math.round((/half/.test(lm[1]) ? 0.5 : NUMW[lm[1]] || parseFloat(lm[1])) * 60); s = s.replace(lm[0], " "); }
    const mn = s.match(/\b(\d{2,3})\s*(min|mins|minutes)\b/);
    if (mn && !out.len) { out.len = +mn[1]; s = s.replace(mn[0], " "); }
    const T = "(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?)";
    const rg = s.match(new RegExp("(?:from|between|starting(?: at)?|at)?\\s*" + T + "\\s*(?:-|–|—|to|till|til|until|and|through)\\s*" + T + "(?![\\d/])"));
    let a = null, b = null;
    if (rg) { a = clockOf(rg[1]); b = clockOf(rg[2]); if (a && b && (a.ap || b.ap || !a.bare || !b.bare || /from|between|till|until/.test(rg[0]))) { a = settle(a, b); b = settle(b, a); if (b.m <= a.m && !b.ap && b.m + 720 < 1440) b = Object.assign({}, b, { m: b.m + 720 }); } else { a = b = null; } }
    if (!a) {
      const sm = s.match(new RegExp("\\b(?:from|at|starting(?: at)?|start at|leave at|leaving at)\\s+" + T + "(?![\\d/])")) || s.match(/\b(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))\b/);
      if (sm) a = settle(clockOf(sm[1]));
      const em = s.match(new RegExp("\\b(?:till|til|until|to|by|back by|finish(?:ing)? (?:at|by))\\s+" + T + "(?![\\d/])"));
      if (em) b = settle(clockOf(em[1]), a);
      if (a && b && b.m <= a.m) b = null;
    }
    if (a) out.start = a.m;
    if (b) out.end = b.m;
    if (/\bfull[ -]?day\b|\bwhole day\b|\bday[ -]?trip\b|\ball day\b/.test(t)) out.part = "full day";
    else if (/\bhalf[ -]?day\b/.test(t)) out.part = "half day";
    else if (/\bmorning\b/.test(t)) out.part = "morning";
    else if (/\bafternoon\b/.test(t)) out.part = "afternoon";
    else if (/\b(evening|sunset)\b/.test(t)) out.part = "evening";
    else if (/\b(night|tonight|after dark)\b/.test(t)) out.part = "night";
    return out;
  }

  // Cities named in the text, in the order they appear
  function citiesIn(t) {
    const found = [];
    Object.keys(CITIES).forEach((id) => {
      const c = CITIES[id];
      const names = [norm(c.name), norm(c.name).replace(/ (town|city)$/, ""), c.zh].concat(c.alias || []);
      if (id === "xa") names.push("xian");
      if (id === "hk") names.push("hongkong");
      names.forEach((n) => {
        if (!n || n.length < 3) return;
        const at = (" " + t + " ").indexOf(" " + n + " ") >= 0 ? (" " + t + " ").indexOf(" " + n + " ") : (/[一-鿿]/.test(n) ? t.indexOf(n) : -1);
        if (at >= 0 && !found.some((f) => f.id === id)) found.push({ id, at, n });
      });
    });
    return found.sort((x, y) => x.at - y.at);
  }

  // How well a name matches the text: distinctive words count most
  function nameScore(name, zh, t) {
    if (zh && t.indexOf(zh) >= 0) return 100;
    const main = norm(String(name).split(/[:(—–]/)[0]);
    if (main.length > 5 && (" " + t + " ").indexOf(" " + main + " ") >= 0) return 50 + main.length;
    const words = main.split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w));
    let score = 0, distinct = 0, generic = 0;
    words.forEach((w) => {
      if ((" " + t + " ").indexOf(" " + w + " ") < 0 && !(w.length >= 6 && t.indexOf(w) >= 0)) return;
      if (GENERIC.has(w)) { generic++; score += 1; } else { distinct++; score += w.length; }
    });
    return distinct ? score : generic >= 2 ? score : 0;
  }
  function bestPlace(t, cityIds) {
    let best = null;
    cityIds.forEach((cid, rank) => {
      CITIES[cid].places.forEach((p) => {
        const sc = nameScore(p.n, p.zh, t) - rank * 0.5;
        if (sc >= 5 && (!best || sc > best.score)) best = { p, cid, score: sc };
      });
    });
    return best;
  }
  function bestHalal(t, city) {
    let best = null;
    city.halal.forEach((h, k) => { const sc = nameScore(h.n, null, t); if (sc >= 5 && (!best || sc > best.score)) best = { h, k, score: sc }; });
    return best;
  }

  // Read a request into a command; never throws
  function parseAsk(text, plan) {
    const raw = String(text || "").trim();
    const t = norm(raw.replace(/(\d)[.](\d{2})\b/g, "$1:$2")).replace(/(\d) (\d{2}) ?(am|pm)?\b/g, (all, h, mi, ap) => h + ":" + mi + (ap ? ap : ""));
    const tt = raw.toLowerCase().replace(/[’']/g, "");
    const cmd = { raw, action: null, day: null, start: null, end: null, len: null, part: null, city: null, from: null, pid: null, halal: null, mode: null, title: null, meal: null, said: {} };
    if (!t) return cmd;
    const d = parseDay(tt, plan);
    if (d) { cmd.day = d.i; cmd.said.day = d.said; }
    const tm = parseTimes(tt.replace(d && d.cut ? d.cut : "\u0000", " "));
    Object.assign(cmd, { start: tm.start, end: tm.end, len: tm.len, part: tm.part });
    if (/\b(high[ -]?speed|bullet|hsr|train|rail)\b/.test(t)) cmd.mode = "train";
    else if (/\b(car|taxi|didi|driver|drive|cab)\b/.test(t)) cmd.mode = "car";
    else if (/\b(bus|coach|minibus)\b/.test(t)) cmd.mode = "bus";
    else if (/\b(ferry|boat|cruise)\b/.test(t)) cmd.mode = "boat";
    else if (/\b(fly|flight|plane)\b/.test(t)) cmd.mode = "flight";
    if (/\bbreakfast\b/.test(t)) cmd.meal = "breakfast"; else if (/\blunch\b/.test(t)) cmd.meal = "lunch"; else if (/\b(dinner|supper)\b/.test(t)) cmd.meal = "dinner";
    const remove = /\b(remove|delete|cancel|drop|skip|take out|get rid of|dont want|do not want|no more)\b/.test(t);
    const free = /\b(free time|free|rest|relax|chill|nap|nothing planned|keep .* free|downtime|day off)\b/.test(t);
    const cs = citiesIn(t);
    const fromM = t.match(/\bfrom ([a-z一-鿿 ]+?)(?: to | into | for |$)/);
    if (fromM) { const fc = citiesIn(fromM[1])[0]; if (fc) cmd.from = fc.id; }
    // the day decides where you're starting from, unless the text says otherwise
    let dayIdx = cmd.day != null && cmd.day >= 0 ? cmd.day : null;
    const others = cs.filter((c) => c.id !== cmd.from);
    if (cmd.day == null && (others.length || cmd.from)) {
      // no date: use a full day in the city you'd start from (or the nearest stop)
      const base = cmd.from || nearestStop(plan, others.length ? others[others.length - 1].id : cmd.from);
      dayIdx = pickDay(plan, base, others.length ? others[others.length - 1].id : null);
      if (dayIdx != null) { cmd.day = dayIdx; cmd.said.day = "auto"; }
    }
    const here = dayIdx != null ? plan.days[dayIdx].cityId : null;
    const destC = others.filter((c) => c.id !== here).pop();
    const searchIds = [destC ? destC.id : here].concat(Object.keys(CITIES).filter((id) => id !== (destC ? destC.id : here) && plan.stops.some((s) => s.id === id))).filter(Boolean);
    const bp = bestPlace(t, searchIds);
    if (remove) {
      cmd.action = "remove";
      cmd.title = raw.replace(/^(please\s+)?(remove|delete|cancel|drop|skip|take out|get rid of)\s+/i, "").replace(/\b(on|from)\b.*$/i, "").trim();
      return cmd;
    }
    if (bp) { cmd.pid = bp.p.id; cmd.city = bp.cid; }
    else if (destC) cmd.city = destC.id;
    if (cmd.city && cmd.city !== here) cmd.action = "outing";
    else if (cmd.pid) cmd.action = "place";
    else if (here) {
      const bh = bestHalal(t, CITIES[here]);
      if (bh && (cmd.meal || /\b(eat|food|restaurant|halal|noodle|meal)\b/.test(t))) { cmd.action = "meal"; cmd.halal = bh.k; cmd.meal = cmd.meal || "dinner"; }
      else if (cmd.meal) cmd.action = "meal";
      else if (free) cmd.action = "free";
    }
    if (!cmd.action && (cmd.start != null || cmd.part) && dayIdx != null) {
      cmd.action = "custom";
      cmd.title = cleanTitle(raw, d);
    }
    return cmd;
  }
  // "Add a cooking class on day 3 from 2 to 4pm" → "Cooking class"
  function cleanTitle(raw, d) {
    let x = " " + raw + " ";
    if (d && d.said && d.said !== "auto") x = x.split(d.said).join(" ").split(d.said.replace(/^./, (c) => c.toUpperCase())).join(" ");
    x = x.replace(/\b(from|between|at|till|until|to|by|and|starting)?\s*\d{1,2}([:.]\d{2})?\s*(am|pm)?(\s*(-|–|to|till|until|and)\s*\d{1,2}([:.]\d{2})?\s*(am|pm)?)?\b/gi, " ")
      .replace(/\b(please|add|put|include|schedule|book|i want to|i'd like to|id like to|can you|could you|on|in the|onwards?|morning|afternoon|evening|tonight|night)\b/gi, " ")
      .replace(/\s+/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim();
    return x ? x.charAt(0).toUpperCase() + x.slice(1) : "My plan";
  }
  // A place's tip, unless it's about going early and the visit is later in the day
  const tipFor = (p, st) => (p.tip && !(st >= 12 * 60 && /\b(go early|early morning|before (about )?\d|at opening|morning)\b/i.test(firstSentence(p.tip))) ? firstSentence(p.tip) : "");
  // The stop nearest a city (for requests that don't give a date)
  function nearestStop(plan, cid) {
    if (!cid) return null;
    const ids = plan.stops.map((s) => s.id);
    if (ids.indexOf(cid) >= 0) return cid;
    return ids.slice().sort((a, b) => km(CITIES[a].stay.ll, CITIES[cid].stay.ll) - km(CITIES[b].stay.ll, CITIES[cid].stay.ll))[0];
  }
  // A day based in `base`: prefer full days with the fewest sights
  function pickDay(plan, base, dest) {
    let best = null;
    plan.days.forEach((d, i) => {
      if (d.cityId !== base || d.kind === "depart") return;
      const sights = timelineFor(d, i).filter((x) => x.k === "sight").length;
      const score = (d.kind === "full" ? 0 : 5) + sights;
      if (dest === base) return;
      if (!best || score < best.score) best = { i, score };
    });
    return best ? best.i : null;
  }

  /* ---------- working the command out against the day ---------- */
  const FIXED = (x) => x.k === "flight" || (x.k === "travel" && /→/.test(x.title) && !x.ask);
  // Travel there and back for one mode, from the hotel
  function outingLeg(mode, A, B, hotel) {
    const key = A.id + "|" + B.id, o = OUTINGS[key];
    if (mode === "train" && o && o.train) {
      const tr = o.train, toSt = getThere(hotel, { n: tr.from.n, zh: tr.from.zh, ll: tr.from.ll }, A);
      const acc = Math.max(10, toSt.mins || 0);
      return { mode, out: acc + tr.wait + tr.ride + tr.to.mins, back: tr.to.mins + 15 + tr.ride + acc, ride: tr.ride, lastBack: toMin(tr.lastBack), lastOut: toMin(tr.lastOut), firstOut: toMin(tr.firstOut), acc, tr,
        cost: `${tr.fare} train + ${tr.to.fare} taxi each way, plus ${A.cur}${String(toSt.text).match(/[¥$]\s?(\d+)/) ? String(toSt.text).match(/[¥$]\s?(\d+)/)[1] : "20–60"} to the station`,
        outText: `${A.ride === "DiDi" ? "DiDi" : "Taxi"} ~${acc} min to ${tr.from.n} (<span class="han">${tr.from.zh}</span>), be there ${tr.wait} min early, high-speed train ~${tr.ride} min to ${tr.to.n} (<span class="han">${tr.to.zh}</span>), then taxi ~${tr.to.mins} min (~${tr.to.fare}) into town.`,
        note: tr.note };
    }
    if (mode === "train" && !modesFor(A.id, B.id).includes("train")) return null;
    if (mode === "car" && o && o.car) {
      const e = modeEstimate("car", A.id, B.id);
      return { mode, out: o.car.mins, back: o.car.mins, ride: o.car.mins, cost: e.cost + " each way", outText: `Private car with driver, about ${dur(o.car.mins)} each way.`, note: o.car.note };
    }
    if (modesFor(A.id, B.id).indexOf(mode) < 0) return null;
    const e = modeEstimate(mode, A.id, B.id);
    return { mode, out: e.door, back: e.door, ride: e.ride, cost: e.cost + " each way", outText: firstSentence(String(modeText(mode, A.id, B.id)).replace(/<[^>]+>/g, "")), note: "" };
  }

  // Everything needed to show (and then add) the change; nothing is saved here
  function workOut(cmd, plan) {
    const r = { ok: false, cmd, items: [], removed: [], trimmed: [], notes: [], warns: [], alts: [], summary: "" };
    if (!cmd.action) { r.err = "nothing"; return r; }
    if (cmd.day === -2) { r.err = "Add a start date in step 1 to plan by date — or say “day 7” instead."; return r; }
    if (cmd.day == null || cmd.day < 0) {
      if (cmd.day === -1) { r.err = `${cmd.said.day ? "“" + cmd.said.day + "” isn't" : "That day isn't"} one of your trip days (${fmtDate(plan.days[0].date)} – ${fmtDate(plan.days[plan.days.length - 1].date)}).`; return r; }
      r.err = "Which day? Add a date (e.g. “on 28 Dec”) or a day number (“day 7”).";
      return r;
    }
    const i = cmd.day, day = plan.days[i], A = day.city, hotel = hotelPoint(A);
    r.i = i;
    const items = timelineFor(day, i);
    r.where = `Day ${i + 1}${day.date ? " · " + fmtDate(day.date) : ""} · ${A.name}`;
    if (cmd.said.day === "auto") r.notes.push(`No date given, so I picked day ${i + 1}${day.date ? " (" + fmtDate(day.date) + ")" : ""} in ${A.name}. Add a date to choose another.`);
    if (cmd.from && cmd.from !== A.id) r.warns.push(`On day ${i + 1} you're staying in ${A.name}, not ${CITIES[cmd.from].name}, so this is planned from ${A.name}.`);

    const make = (o) => Object.assign({ ask: 1 }, o);
    if (cmd.action === "remove") {
      const q = norm(cmd.title);
      const hit = items.filter((x) => !FIXED(x) && q && (norm(x.title).indexOf(q) >= 0 || nameScore(x.title, null, q) >= 5 || nameScore(q, null, norm(x.title)) >= 5));
      if (!hit.length) { r.err = `I couldn't find “${cmd.title}” on day ${i + 1}. That day has: ${items.filter((x) => !FIXED(x)).map((x) => x.title).join(" · ")}.`; return r; }
      r.removed = hit; r.start = Math.min.apply(null, hit.map((x) => x.start)); r.end = Math.max.apply(null, hit.map((x) => x.end));
      r.summary = `Remove ${hit.map((x) => "“" + x.title + "”").join(", ")} from day ${i + 1}`;
      r.ok = true;
      return r;
    }
    // the time window
    let s = cmd.start, e = cmd.end;
    const win = cmd.part ? PART_WIN[cmd.part] : cmd.meal ? MEAL_WIN[cmd.meal] : null;
    const defLen = cmd.action === "outing" ? null : cmd.action === "place" ? Math.round(Math.min(hoursOf(findPlace(CITIES[cmd.city || A.id], cmd.pid).h), 4) * 60) : cmd.action === "meal" ? 60 : cmd.action === "free" ? 120 : 60;
    if (s == null && e == null && win) { s = win[0]; e = win[1]; if (cmd.len && cmd.part) e = s + cmd.len; }
    if (s != null && e == null) e = cmd.len ? s + cmd.len : cmd.part && win[1] > s ? win[1] : defLen ? s + defLen : null;
    if (s == null && e == null && cmd.action === "place") {
      // a place with no time: its best time of day (full-day trips start early)
      const P = findPlace(A, cmd.pid), best = (P.s || ["m"])[0];
      s = best === "full" ? 8 * 60 : best === "e" ? 13 * 60 + 30 : best === "n" ? 19 * 60 + 30 : 9 * 60;
      e = best === "full" ? 18 * 60 : s + defLen;
      r.notes.push(`No time given, so it's planned ${best === "full" ? "as a full-day trip" : best === "e" ? "for the afternoon" : best === "n" ? "for the evening" : "for the morning"} — the best time for it. Add a time to move it.`);
    }
    if (s == null && e != null) s = cmd.len ? e - cmd.len : defLen ? e - defLen : null;
    if (cmd.action === "outing" && (s == null || e == null)) {
      // an outing with no time: half a day in the afternoon, or what fits the length asked for
      s = s != null ? s : 13 * 60;
      e = e != null ? e : s + (cmd.len || 5 * 60);
      r.notes.push(`No time given, so this starts at ${hhmm(s)}. Say “from 9am” or “in the evening” to move it.`);
    }
    if (s == null) {
      // place or meal with no time: the first gap long enough, else the evening
      const need = defLen || 60, sorted = items.slice().sort((a, b) => a.start - b.start);
      let t0 = 9 * 60;
      for (let k = 0; k <= sorted.length; k++) {
        const nxt = k < sorted.length ? sorted[k].start : 22 * 60;
        if (nxt - t0 >= need + 20 && t0 >= 9 * 60) { s = r5(t0 + 10); break; }
        if (k < sorted.length) t0 = Math.max(t0, sorted[k].end);
      }
      if (s == null) s = 19 * 60;
      e = s + need;
      r.notes.push(`No time given, so it goes in the first free gap, ${hhmm(s)}–${hhmm(e)}.`);
    }
    if (cmd.len && cmd.start != null && cmd.end != null && Math.abs(cmd.end - cmd.start - cmd.len) > 20) r.notes.push(`You said ${dur(cmd.len)} but ${hhmm(cmd.start)}–${hhmm(cmd.end)} is ${dur(cmd.end - cmd.start)}; I've used the times.`);
    s = r5(s); e = r5(e);
    if (e <= s) { r.err = "The end time is before the start time."; return r; }
    r.start = s; r.end = e;

    if (cmd.pid) {
      // already planned?
      for (let k = 0; k < plan.days.length; k++) {
        const hit = timelineFor(plan.days[k], k).find((x) => x.pid === cmd.pid);
        if (!hit) continue;
        if (k === i) { r.err = `${hit.title} is already on day ${i + 1} (${hhmm(hit.start)}–${hhmm(hit.end)}). To move it, change its times with “Edit this day”, or remove it first.`; return r; }
        r.warns.push(`${hit.title} is also on day ${k + 1}. Type “remove ${hit.title.split(/[:(&]/)[0].trim()} on day ${k + 1}” afterwards if you only want it once.`);
        break;
      }
    }
    const clash = items.filter((x) => FIXED(x) && x.start < e && x.end > s);
    if (clash.length) { r.err = `That clashes with ${clash.map((x) => "“" + x.title + "” (" + hhmm(x.start) + "–" + hhmm(x.end) + ")").join(" and ")}, which can't move. Pick another time or day.`; return r; }

    if (cmd.action === "outing") {
      const B = CITIES[cmd.city];
      const cands = [];
      const asked = cmd.mode;
      ["train", "car", "bus", "boat", "flight"].forEach((m) => { const L = outingLeg(m, A, B, hotel); if (L) cands.push(L); });
      if (!cands.length) { r.err = `There's no practical way to get from ${A.name} to ${B.name} and back for a few hours.`; return r; }
      cands.sort((x, y) => x.out + x.back - (y.out + y.back));
      let L = asked ? cands.find((c) => c.mode === asked) : null;
      if (asked && !L) r.warns.push(`${MODE[asked].label} doesn't run between ${A.name} and ${B.name}; using ${MODE[cands[0].mode].label.toLowerCase()} instead.`);
      const train = cands.find((c) => c.mode === "train");
      L = L || (train && train.out + train.back <= cands[0].out + cands[0].back + 40 ? train : cands[0]);
      const other = cands.find((c) => c.mode !== L.mode);
      const total = e - s;
      if (L.out + L.back > 0.8 * total + 30 && L.out + L.back >= 5 * 60) { r.err = `${B.name} is about ${dur(L.out)} each way from ${A.name}${L.mode === "flight" ? " including airport time" : ""} — too far for a ${dur(total)} outing. Add ${B.name} as its own stop in step 3 instead.`; return r; }
      let backMode = L, backStart = Math.floor((e - L.back) / 5) * 5, arrive = Math.ceil((s + L.out) / 5) * 5;
      // the last train back
      if (L.mode === "train" && L.lastBack != null) {
        const trainBack = backStart + L.tr.to.mins + 15;
        if (trainBack > L.lastBack) {
          const carL = outingLeg("car", A, B, hotel);
          const lateLeave = L.lastBack - L.tr.to.mins - 15;
          r.warns.push(`The last train back from ${L.tr.to.n} leaves around ${hhmm(L.lastBack)} (check 12306). To finish at ${hhmm(e)} you'd need to leave town by ${hhmm(backStart)}, which misses it${carL ? " — so the way back is by private car" : ""}. Or leave Furong by ${hhmm(lateLeave)} to catch it.`.replace("Furong", B.name));
          if (carL) { backMode = carL; backStart = Math.floor((e - carL.back) / 5) * 5; }
        }
      }
      if (L.mode === "train" && L.lastOut != null && s + L.acc + L.tr.wait > L.lastOut) { r.err = `The last trains to ${L.tr.to.n} leave around ${hhmm(L.lastOut)}; start earlier or go by car.`; return r; }
      let there = backStart - arrive;
      // not enough time there: offer to start earlier or finish later
      const want = Math.max(150, cmd.pid ? Math.round(hoursOf(findPlace(B, cmd.pid).h) * 60) : 150);
      if (there < want) {
        const earlier = r5(s - (want - there));
        if (earlier >= 7 * 60 && !items.some((x) => FIXED(x) && x.start < s && x.end > earlier)) r.alts.push({ label: `Start at ${hhmm(earlier)} instead (${dur(want)} in ${B.name})`, start: earlier, end: e });
        if (L.mode === "train" && L.lastBack != null) {
          // finish so that leaving town still catches the last train
          const lateEnd = Math.floor((L.lastBack - L.tr.to.mins - 15 + L.back) / 5) * 5;
          if (lateEnd > e && lateEnd - L.back - arrive > there + 20) r.alts.push({ label: `Catch the last train back (~${hhmm(L.lastBack)}), at the hotel ~${hhmm(lateEnd)} — ${dur(lateEnd - L.back - arrive)} in ${B.name}`, start: s, end: lateEnd });
        } else if (e + (want - there) <= 24 * 60 - 30) r.alts.push({ label: `Finish at ${hhmm(r5(e + (want - there)))} instead`, start: s, end: r5(e + (want - there)) });
      }
      if (there < 45) { r.err = `Getting to ${B.name} and back takes about ${dur(L.out + backMode.back)} from ${stayName(A)}, leaving only ${Math.max(0, there)} min there. Try a longer window.`; return r; }
      if (there < want) r.warns.push(`That leaves about ${dur(there)} in ${B.name}. ${r.alts.length ? "Options below give you more time." : ""}`);
      r.leg = L; r.other = other; r.backMode = backMode;
      r.items.push(make({ k: "travel", icon: MODE[L.mode].icon, title: `${MODE[L.mode].label} to ${B.name}`, start: s, end: arrive, note: String(L.outText).replace(/<[^>]+>/g, "") + " " + L.cost + ".", ll: B.stay.ll }));
      // what to do there: the place asked for (or the top sights), a halal meal if there is one, the view after dark
      const picks = cmd.pid ? [findPlace(B, cmd.pid)] : B.places.filter((p) => p.r === 3).concat(B.places.filter((p) => p.r !== 3)).slice(0, 3);
      const mealAt = arrive <= 19 * 60 + 30 && backStart >= 18 * 60 + 30 ? "dinner" : arrive <= 13 * 60 && backStart >= 12 * 60 + 30 ? "lunch" : null;
      const winter = day.date && (day.date.getMonth() > 8 || day.date.getMonth() < 3);
      const dark = !!(B.night && B.night.length) && backStart >= (winter ? 18 * 60 : 19 * 60 + 15);
      const halalB = (B.halal || []).find((h) => h.ll), halalA = (A.halal || [])[0];
      let nightLen = dark ? Math.min(60, Math.max(30, Math.round(there * 0.35))) : 0;
      let mealLen = mealAt && halalB ? 60 : 0;
      let sightAvail = there - nightLen - mealLen;
      if (sightAvail < 40 && mealLen) { mealLen = 0; sightAvail = there - nightLen; }
      if (sightAvail < 30 && dark) { nightLen = there; sightAvail = 0; }
      let t = arrive;
      picks.forEach((p, k) => {
        const left = sightAvail - (t - arrive);
        if (left < (k ? 45 : 25)) return;
        const st = r5(t + (k ? 10 : 0));
        const en = r5(st + Math.min(Math.round(hoursOf(p.h) * 60), left - (k ? 10 : 0)));
        if (en - st < 25) return;
        r.items.push(make({ k: "sight", title: p.n, pid: p.id, ll: p.ll, start: st, end: en, note: [p.c, tipFor(p, st)].filter(Boolean).join(" · ") }));
        t = en;
      });
      if (mealLen) {
        const ms = Math.ceil(Math.max(t, mealAt === "dinner" ? 17 * 60 + 30 : 11 * 60 + 45) / 5) * 5, me = Math.min(ms + 60, backStart - nightLen);
        if (me - ms >= 30) { r.items.push(make({ k: "meal", title: `${mealAt === "dinner" ? "Dinner" : "Lunch"} — ${halalB.n}`, start: ms, end: me, ll: halalB.ll, note: halalB.note })); t = me; }
      }
      const dusk = winter ? 17 * 60 + 45 : 19 * 60 + 15;
      if (nightLen && backStart - t >= 25) {
        const ns = Math.max(r5(t), Math.min(dusk, backStart - 30));
        if (ns - t >= 30) r.items.push(make({ k: "free", title: `Free time in ${B.name}`, start: r5(t), end: ns, note: "Wander the lanes, a snack or souvenirs while it gets dark." }));
        r.items.push(make({ k: "sight", title: "After dark: " + String(B.night[0]).replace(/\.$/, ""), start: ns, end: backStart, ll: B.stay.ll, note: "" })); t = backStart;
      }
      else if (backStart - t >= 30) r.items.push(make({ k: "free", title: `Free time in ${B.name}`, start: r5(t), end: backStart, note: "Wander the lanes, a snack or souvenirs." }));
      // no halal food at the destination: eat before you go if the day has room, and say what to do there
      if (mealAt && !halalB) {
        const ms = r5(s - 70), me = s - 10;
        const soft = (x) => ["free", "rest", "shop", "cafe"].indexOf(x.k) >= 0;
        const near = items.filter((x) => x.end > ms && x.start < me);
        const busy = near.some((x) => !soft(x));
        const eatA = (A.halal || []).find((h) => h.ll) || halalA;
        if (!busy && eatA && ms >= (mealAt === "dinner" ? 15 * 60 + 30 : 11 * 60)) {
          near.forEach((x) => { if (x.start < ms && ms - x.start >= 20) r.trimmed.push({ x, end: ms }); else r.removed.push(x); });
          r.items.unshift(make({ k: "meal", title: `Early ${mealAt} (halal) — ${eatA.n}`, start: ms, end: me, ll: eatA.ll || null, note: `${B.name} has no halal restaurants we know of, so eat before you leave. ${eatA.note || ""}`.trim() }));
        }
        r.notes.push(`Halal food in ${B.name}: ${B.halalTip || "very limited."} Carry snacks; if you eat there, show the halal card (Phrases tab)${(B.dishes || [])[0] ? " — e.g. " + String(B.dishes[0]).split("—")[0].trim() + ", " + String(B.dishes[0]).split("—").slice(1).join("—").trim() : ""}.`);
      }
      r.there = there;
      r.items.push(make({ k: "travel", icon: MODE[backMode.mode].icon, title: `${MODE[backMode.mode].label} back to ${stayName(A)}`, start: backStart, end: e, ll: hotel.ll,
        note: backMode.mode === "train" ? `Taxi ~${backMode.tr.to.mins} min to ${backMode.tr.to.n}, train ~${backMode.ride} min, then ~${backMode.acc} min to your hotel.` : backMode.note || "" }));
      if (L.note) r.notes.push(L.note);
      if (other) r.notes.push(`Alternative: ${MODE[other.mode].label.toLowerCase()}, about ${dur(other.out)} there and ${dur(other.back)} back (${other.cost}). ${L.out + L.back <= other.out + other.back ? MODE[L.mode].label + " is quicker door to door." : asked === L.mode ? "You asked for the " + MODE[L.mode].label.toLowerCase() + "." : MODE[L.mode].label + " is a little slower door to door but much cheaper, and doesn't depend on finding a driver for the return."}`);
      r.summary = `${B.name} outing ${hhmm(s)}–${hhmm(e)} (${dur(there)} there) on day ${i + 1} by ${MODE[L.mode].label.toLowerCase()}${backMode !== L ? " (back by car)" : ""}`;
    } else if (cmd.action === "place") {
      const p = findPlace(A, cmd.pid), g = getThere(hotel, p, A);
      if (p.x && km(hotel.ll, p.ll) > 12) {
        const go = g.mins || 60;
        if (e - s < go * 2 + 60) r.warns.push(`${p.n} is about ${dur(go)} each way from ${stayName(A)} — ${dur(e - s)} leaves little time there.`);
        r.items.push(make({ k: "travel", icon: "🚐", title: "Travel to " + p.n.split(/[:(]/)[0].trim(), start: s, end: s + go, note: firstSentence(p.x) }));
        r.items.push(make({ k: "sight", title: p.n, pid: p.id, ll: p.ll, start: s + go, end: Math.max(s + go + 30, e - go), note: p.c }));
        r.items.push(make({ k: "travel", icon: "🚐", title: "Back to " + A.name, start: Math.max(s + go + 30, e - go), end: e, ll: hotel.ll }));
      } else r.items.push(make({ k: "sight", title: p.n, pid: p.id, ll: p.ll, start: s, end: e, note: [p.c, tipFor(p, s)].filter(Boolean).join(" · ") }));
      const eat = (A.halal || []).filter((h) => h.ll).map((h) => ({ h, d: km(p.ll, h.ll) })).sort((a, b) => a.d - b.d)[0];
      if (eat) r.notes.push(`Nearest halal food: ${eat.h.n} (~${eat.d.toFixed(1)} km).`);
      if (day.date && p.cl && p.cl.indexOf(day.date.getDay()) >= 0) r.warns.push(`${p.n} is usually closed on ${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][day.date.getDay()]} — pick another day.`);
      if ((p.s || []).indexOf("n") < 0 && (p.s || []).length && s >= 18 * 60) r.warns.push(`${p.n} is a daytime visit — it may be closed by ${hhmm(s)}.`);
      r.summary = `${p.n.split(/[:(]/)[0].trim()} ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    } else if (cmd.action === "meal") {
      const h = cmd.halal != null ? A.halal[cmd.halal] : null;
      const word = cmd.meal === "breakfast" ? "Breakfast" : cmd.meal === "lunch" ? "Lunch" : "Dinner";
      r.items.push(make({ k: "meal", title: h ? word + " — " + h.n : word + " (halal)", start: s, end: e, ll: h ? h.ll : null, note: h ? h.note : A.halalTip }));
      if (!h) r.notes.push(`Halal options in ${A.name}: ${A.halal.slice(0, 3).map((x) => x.n).join(" · ")}.`);
      r.summary = `${word} ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    } else if (cmd.action === "free") {
      r.items.push(make({ k: "free", title: "Free time", start: s, end: e, note: "Kept free at your request." }));
      r.summary = `Free time ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    } else {
      const title = cmd.title ? cmd.title.charAt(0).toUpperCase() + cmd.title.slice(1) : "My plan";
      r.items.push(make({ k: "custom", title, start: s, end: e, note: "" }));
      r.summary = `“${title}” ${hhmm(s)}–${hhmm(e)} on day ${i + 1}`;
    }
    // what makes way: items inside the window go, ones that run into it are shortened
    {
      items.forEach((x) => {
        if (cmd.action === "meal" && x.k === (cmd.meal === "breakfast" ? "breakfast" : "meal") && Math.abs(x.start - s) <= 150) { r.removed.push(x); return; }
        if (FIXED(x) || x.end <= s || x.start >= e) return;
        if (x.start < s && s - x.start >= 20) r.trimmed.push({ x, end: s });
        else r.removed.push(x);
      });
    }
    const seen = {};
    r.removed = r.removed.filter((x) => !seen[x.id] && (seen[x.id] = 1));
    r.trimmed = r.trimmed.filter((tr) => !seen[tr.x.id] && (seen[tr.x.id] = 1));
    r.ok = true;
    return r;
  }

  // Apply a worked-out change to the day and remember how to undo it
  function applyAsk(r) {
    const day = lastPlan.days[r.i], key = dayKey(day, r.i);
    const before = state.edits && state.edits[key] ? JSON.parse(JSON.stringify(state.edits[key])) : null;
    let items = timelineFor(day, r.i);
    const gone = new Set(r.removed.map((x) => x.id));
    items = items.filter((x) => !gone.has(x.id));
    r.trimmed.forEach((tr) => { const x = items.find((y) => y.id === tr.x.id); if (x) x.end = tr.end; });
    const stamp = Date.now().toString(36);
    r.items.forEach((x, k) => items.push(Object.assign({}, x, { id: "q" + stamp + k })));
    saveTimeline(r.i, items);
    state.asks = (state.asks || []).concat([{ id: stamp, key, day: r.i, text: r.cmd.raw, summary: r.summary, before }]).slice(-20);
    persist();
    refreshDay(r.i);
    const el = document.getElementById("day-" + (r.i + 1));
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1800); }
  }
  function undoAsk(id) {
    const list = state.asks || [], a = list.find((x) => x.id === id);
    if (!a) return;
    const later = list.filter((x) => x.key === a.key && x.id > a.id);
    if (later.length) { toast("Undo the later change to that day first."); return; }
    state.edits = state.edits || {};
    if (a.before) state.edits[a.key] = a.before; else delete state.edits[a.key];
    state.asks = list.filter((x) => x.id !== id);
    persist();
    if (lastPlan && lastPlan.days[a.day] && dayKey(lastPlan.days[a.day], a.day) === a.key) refreshDay(a.day);
    renderAskHistory();
    toast("Undone.");
  }

  /* ---------- the box ---------- */
  let askDraft = "", askTimer = null, askResult = null, askSample = null, askBusy = null;
  try { askDraft = load("askDraft") || ""; } catch (e) { askDraft = ""; }
  if (window.claude && typeof window.claude.use === "function") {
    try { window.claude.use("sample").then((s) => { askSample = s || null; if (askSample) renderAskPreview(); }, () => {}); } catch (e) { /* not available */ }
  }
  function askExamples(plan) {
    const ex = [];
    const d0 = plan.days.findIndex((d) => d.kind === "full");
    const label = (i) => (plan.days[i].date ? "on " + plan.days[i].date.getDate() + " " + MONTHS[plan.days[i].date.getMonth()] : "on day " + (i + 1));
    Object.keys(OUTINGS).forEach((k) => {
      const [a, b] = k.split("|");
      const di = plan.days.findIndex((d) => d.cityId === a && d.kind === "full");
      if (di >= 0 && !plan.stops.some((s) => s.id === b)) ex.push(`Add a trip from ${CITIES[a].name} to ${CITIES[b].name} ${label(di)} from 3pm till 10pm`);
    });
    if (d0 >= 0) {
      const c = plan.days[d0].city, used = new Set(timelineFor(plan.days[d0], d0).map((x) => x.pid));
      const p = c.places.find((x) => !used.has(x.id) && !x.x);
      if (p) ex.push(`Add ${p.n.split(/[:(]/)[0].trim()} ${label(d0)} afternoon`);
      ex.push(`Keep the evening ${label(d0)} free`);
      const h = c.halal.find((x) => x.ll);
      if (h) ex.push(`Dinner at ${h.n.split(/[:(]/)[0].trim()} ${label(d0)} at 7pm`);
    }
    return ex.slice(0, 4);
  }
  function askHTML(plan) {
    return `<section class="ask panel" id="askBox" aria-labelledby="askH">
      <h3 id="askH">✍️ Change my plan</h3>
      <p class="hint">Type what you'd like, in your own words. You'll see how it fits — transport, timings, halal food and what it replaces — before you add it.</p>
      <div class="ask-row"><textarea id="askIn" rows="2" placeholder="e.g. Add a 4-hour trip from Zhangjiajie to Furong Town on 28 Dec from 5pm to 10pm" aria-label="Your change">${esc(askDraft)}</textarea>
      <button type="button" class="btn print-btn" id="askGo">Work it out</button></div>
      <div class="ask-ex">${askExamples(plan).map((x) => `<button type="button" class="btn small" data-askex="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <div id="askOut" aria-live="polite"></div>
      <div id="askHist"></div>
    </section>`;
  }
  function askPreviewHTML(r) {
    if (!r) return "";
    if (!r.ok) {
      if (r.err === "nothing") return `<p class="ask-msg">I couldn't tell what to add yet. Name a place or city, a day (“28 Dec” or “day 7”) and a time (“5pm to 10pm”, “afternoon”).${askSample ? ` <button type="button" class="btn small" id="askClaude">Ask Claude to read it</button>` : ""}</p>`;
      return `<p class="ask-msg warn">${esc(r.err)}${askSample && r.cmd && (r.cmd.day == null || r.cmd.day < 0) ? "" : ""}</p>` + (askSample && /Which day|couldn't find/.test(r.err) ? `<p><button type="button" class="btn small" id="askClaude">Ask Claude to read it</button></p>` : "");
    }
    const rows = r.items.map((x) => `<li class="tl-item k-${x.k}"><span class="tl-time">${hhmm(x.start)}–${hhmm(x.end)}</span><span class="tl-icon" aria-hidden="true">${x.icon || TL_ICON[x.k] || "•"}</span><span class="tl-body"><b>${esc(x.title)}</b>${x.note ? `<span class="tl-note">${esc(x.note)}</span>` : ""}</span></li>`).join("");
    const gone = r.removed.map((x) => `${esc(x.title)} (${hhmm(x.start)})`).concat(r.trimmed.map((tr) => `${esc(tr.x.title)} shortened to end ${hhmm(tr.end)}`));
    return `<div class="ask-card">
      <div class="ask-where"><b>${esc(r.where)}</b> · ${hhmm(r.start)}–${hhmm(r.end)}${r.cmd.action === "remove" ? "" : ` · ${esc(r.summary.split(" on day")[0])}`}</div>
      ${r.warns.map((w) => `<p class="ask-msg warn">⚠️ ${esc(w)}</p>`).join("")}
      ${rows ? `<ol class="tl-list">${rows}</ol>` : ""}
      ${gone.length ? `<p class="hint"><b>${r.cmd.action === "remove" ? "Removes" : "Makes way by removing"}:</b> ${gone.join(" · ")}</p>` : ""}
      ${r.notes.map((n) => `<p class="hint">${esc(n)}</p>`).join("")}
      <div class="actions"><button type="button" class="btn primary ask-add" id="askAdd">✓ ${r.cmd.action === "remove" ? "Remove it" : "Add to day " + (r.i + 1)}</button>${r.alts.map((a, k) => `<button type="button" class="btn small" data-askalt="${k}">${esc(a.label)}</button>`).join("")}</div>
    </div>`;
  }
  function renderAskPreview() {
    const box = $("#askOut");
    if (!box) return;
    const txt = ($("#askIn") || {}).value || "";
    if (!txt.trim()) { box.innerHTML = ""; askResult = null; return; }
    if (!askResult || askResult.cmd.raw !== txt.trim()) askResult = workOut(parseAsk(txt, lastPlan), lastPlan);
    box.innerHTML = askPreviewHTML(askResult);
    addAUD(box);
  }
  function renderAskHistory() {
    const h = $("#askHist");
    if (!h) return;
    const list = (state.asks || []).slice().reverse();
    h.innerHTML = list.length ? `<h4>Your changes</h4><ul class="ask-hist">${list.map((a) => `<li><span>${esc(a.summary)}</span> <button type="button" class="btn small" data-askundo="${a.id}">↺ Undo</button></li>`).join("")}</ul>` : "";
  }
  // Ask Claude (claude.ai page only) to turn the text into the same command
  function askClaude() {
    const txt = ($("#askIn") || {}).value || "";
    if (!askSample || !txt.trim() || askBusy) return;
    const box = $("#askOut");
    box.innerHTML = `<p class="ask-msg">Asking Claude… <button type="button" class="btn small" id="askStop">Stop</button></p>`;
    const ctl = new AbortController(); askBusy = ctl;
    const plan = lastPlan;
    const days = plan.days.map((d, i) => `${i + 1}: ${d.date ? isoDate(d.date) + " " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.date.getDay()] : "no date"}, staying in ${d.city.name} (${d.cityId})`).join("\n");
    const cityIds = Object.keys(CITIES).map((id) => `${id}=${CITIES[id].name}`).join(", ");
    const near = plan.stops.map((s) => s.id).concat(Object.keys(OUTINGS).map((k) => k.split("|")[1]));
    const places = near.filter((v, k, a) => a.indexOf(v) === k).map((cid) => `${CITIES[cid].name}: ` + CITIES[cid].places.map((p) => `${p.id}=${p.n.split(/[:(]/)[0].trim()}`).join("; ")).join("\n");
    const prompt = `A traveller is editing a China trip itinerary. Turn their request into ONE JSON command for the page to plan.
Trip days (day number: date, where they sleep):
${days}
City ids: ${cityIds}
Known places (id=name):
${places}

Reply with only a JSON object:
{"action": "outing"|"place"|"meal"|"free"|"custom"|"remove"|"none", "day": <trip day number>, "start": "HH:MM" or null, "end": "HH:MM" or null, "city": <city id for a trip to another city, else null>, "place": <place id or null>, "mode": "train"|"car"|"bus"|"boat"|"flight"|null, "meal": "breakfast"|"lunch"|"dinner"|null, "title": <short title for custom items, or the item to remove>, "question": <if you can't tell, one short question for the traveller, else null>}
Use "outing" for a few hours in a different city from where they sleep that day. Use 24-hour times; "5pm onwards till 10pm" is 17:00–22:00.

Request: ${txt.trim()}`;
    askSample.json(prompt, { modelTier: "quick", signal: ctl.signal }).then((j) => {
      askBusy = null;
      if (!j || typeof j !== "object" || j.action === "none" || !j.action) { box.innerHTML = `<p class="ask-msg">${esc((j && j.question) || "Claude couldn't tell what to change. Try naming the place, day and time.")}</p>`; return; }
      const cmd = { raw: txt.trim(), action: String(j.action), day: j.day != null ? +j.day - 1 : null, start: toMin(j.start), end: toMin(j.end), len: null, part: null, city: j.city && CITIES[j.city] ? j.city : null, from: null,
        pid: null, halal: null, mode: MODE[j.mode] ? j.mode : null, title: j.title ? String(j.title) : null, meal: MEAL_WIN[j.meal] ? j.meal : null, said: {} };
      if (j.place) Object.keys(CITIES).forEach((cid) => { const p = CITIES[cid].places.find((x) => x.id === j.place); if (p) { cmd.pid = p.id; cmd.city = cid; } });
      if (cmd.day != null && (cmd.day < 0 || cmd.day >= plan.days.length)) cmd.day = -1;
      if (cmd.action === "outing" && cmd.city && cmd.day >= 0 && plan.days[cmd.day].cityId === cmd.city) cmd.action = cmd.pid ? "place" : "custom";
      if (cmd.action === "place" && cmd.pid && cmd.day >= 0 && plan.days[cmd.day].cityId !== cmd.city) cmd.action = "outing";
      if (["outing", "place", "meal", "free", "custom", "remove"].indexOf(cmd.action) < 0) cmd.action = null;
      askResult = workOut(cmd, plan);
      box.innerHTML = `<p class="hint">Read by Claude.</p>` + askPreviewHTML(askResult);
      addAUD(box);
    }, (err) => {
      askBusy = null;
      const code = err && err.code;
      if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared" || code === "capability_disabled" || code === "capability_removed") { askSample = null; box.innerHTML = `<p class="ask-msg">Claude isn't available here — try naming the place, day and time.</p>`; return; }
      if (code === "cancelled") { renderAskPreview(); return; }
      box.innerHTML = `<p class="ask-msg warn">${code === "rate_limited" ? "Too many requests just now — try again in a minute." : "Claude couldn't answer just now."} <button type="button" class="btn small" id="askClaude">Try again</button></p>`;
    });
  }
  function bindAsk() {
    const out = $("#out");
    out.addEventListener("input", (e) => {
      if (e.target.id !== "askIn") return;
      askDraft = e.target.value; save("askDraft", askDraft);
      clearTimeout(askTimer);
      askTimer = setTimeout(renderAskPreview, 250);
    });
    out.addEventListener("keydown", (e) => {
      if (e.target.id === "askIn" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); clearTimeout(askTimer); askResult = null; renderAskPreview(); }
    });
    out.addEventListener("click", (e) => {
      const b = e.target.closest("#askGo, #askAdd, #askClaude, #askStop, [data-askex], [data-askalt], [data-askundo]");
      if (!b) return;
      if (b.id === "askGo") { clearTimeout(askTimer); askResult = null; renderAskPreview(); return; }
      if (b.id === "askClaude") { askClaude(); return; }
      if (b.id === "askStop") { if (askBusy) askBusy.abort(); return; }
      if (b.dataset.askex != null) { const t = $("#askIn"); t.value = b.dataset.askex; askDraft = t.value; save("askDraft", askDraft); askResult = null; renderAskPreview(); t.focus(); return; }
      if (b.dataset.askundo != null) { undoAsk(b.dataset.askundo); return; }
      if (b.dataset.askalt != null && askResult) {
        const a = askResult.alts[+b.dataset.askalt];
        const cmd = Object.assign({}, askResult.cmd, { start: a.start, end: a.end, part: null, len: null, said: Object.assign({}, askResult.cmd.said, { day: askResult.cmd.said.day === "auto" ? "picked" : askResult.cmd.said.day }) });
        askResult = workOut(cmd, lastPlan);
        $("#askOut").innerHTML = askPreviewHTML(askResult);
        addAUD($("#askOut"));
        return;
      }
      if (b.id === "askAdd" && askResult && askResult.ok) {
        const r = askResult;
        applyAsk(r);
        const t = $("#askIn"); t.value = ""; askDraft = ""; save("askDraft", "");
        askResult = null;
        $("#askOut").innerHTML = `<p class="ask-msg good">✓ ${esc(r.summary)}. Undo it below any time.</p>`;
        renderAskHistory();
        toast("Added to day " + (r.i + 1) + " — the summary, printout and PDF include it.");
      }
    });
  }

  /* ---------- weather: typical (climate averages) for each date, or a live forecast within ~2 weeks ---------- */
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const isoDate = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const climateNotes = (cid) => { const c = CLIMATE[cid] || {}; return c.notes || (c.same && CLIMATE[c.same].notes) || []; };
  // Monthly averages sit mid-month; days in between are blended with the neighbouring month
  function typicalFor(cid, date) {
    const c = CLIMATE[cid];
    if (!c || !date) return null;
    const m = date.getMonth(), dim = new Date(date.getFullYear(), m + 1, 0).getDate();
    const pos = (date.getDate() - 15) / dim, f = Math.abs(pos), m2 = pos >= 0 ? (m + 1) % 12 : (m + 11) % 12;
    const mix = (a) => a[m] * (1 - f) + a[m2] * f;
    return { hi: mix(c.hi), lo: mix(c.lo), rain: mix(c.rain) / 30, mountain: !!c.mountain };
  }
  const forecastCache = {};
  const wxIcon = (code) => (code === 0 ? "☀️" : code <= 2 ? "🌤" : code === 3 ? "☁️" : code === 45 || code === 48 ? "🌫" : code >= 71 && code <= 77 ? "❄️" : code >= 95 ? "⛈" : code >= 80 ? "🌦" : code >= 51 ? "🌧" : "🌤");
  const climIcon = (t) => (t.lo <= -3 ? "🥶" : t.rain >= 0.45 ? "🌦" : t.hi >= 30 ? "☀️" : t.hi <= 8 ? "🧥" : "🌤");
  function weatherFor(cid, date) {
    if (!date) return null;
    const f = forecastCache[cid + "|" + isoDate(date)];
    const mountain = !!(CLIMATE[cid] && CLIMATE[cid].mountain);
    if (f) return { src: "forecast", hi: f.hi, lo: f.lo, rain: f.pp / 100, icon: wxIcon(f.code), mountain };
    const t = typicalFor(cid, date);
    return t ? Object.assign({ src: "typical", icon: climIcon(t) }, t) : null;
  }
  const deg = (v) => Math.round(v) + "°C";
  const rainWords = (p) => (p >= 0.6 ? "rain likely" : p >= 0.35 ? "showers possible" : p >= 0.15 ? "small chance of rain" : "rain unlikely");
  // What to wear for a day's high, low and chance of rain
  function attire(hi, lo, rain) {
    const out = [];
    if (hi >= 30) out.push("light, loose, breathable clothes (thin long sleeves keep you covered and cool)", "sun hat, sunglasses and SPF 50");
    else if (hi >= 24) out.push("light clothes", "a thin layer for air-conditioning and evenings");
    else if (hi >= 17) out.push("long sleeves", "a light jacket or cardigan");
    else if (hi >= 10) out.push("a sweater or fleece", "a medium jacket");
    else if (hi >= 4) out.push("a warm coat", "layers with a thermal top", "a scarf");
    else out.push("a down jacket", "thermal underwear", "hat, gloves and scarf");
    if (lo <= 0 && hi >= 4) out.push("gloves and a hat for mornings and evenings");
    if (rain >= 0.4) out.push("a compact umbrella or rain jacket", "quick-dry shoes");
    else if (rain >= 0.2) out.push("a compact umbrella");
    return out;
  }
  const attireShort = (hi, lo, rain) => {
    const b = hi >= 30 ? "Light & breathable, sun hat" : hi >= 24 ? "Light clothes + thin layer" : hi >= 17 ? "Long sleeves + light jacket" : hi >= 10 ? "Sweater + jacket" : hi >= 4 ? "Warm coat, layers, scarf" : "Down jacket, thermals, hat & gloves";
    return b + (rain >= 0.4 ? " · rain gear" : rain >= 0.2 ? " · umbrella" : "");
  };
  // Extra items for what's planned that day
  function dayExtras(day) {
    const ps = day.slots.filter((s) => s.type === "act").map((s) => s.p), out = [];
    if (ps.some((p) => p.t.indexOf("adventure") >= 0 || p.t.indexOf("nature") >= 0 || p.s.indexOf("full") >= 0)) out.push("grippy walking shoes");
    if (ps.some((p) => /mosque/i.test(p.n))) out.push("modest clothes for the mosque (women: headscarf, arms and legs covered)");
    if (ps.some((p) => /cruise|boat|ferry|raft/i.test(p.n))) out.push("a light layer for the breeze on the water");
    return out;
  }
  function wxData(day) {
    const w = weatherFor(day.cityId, day.date);
    if (!w) return null;
    return { w, am: w.lo + 0.35 * (w.hi - w.lo), night: w.lo + 0.25 * (w.hi - w.lo), wear: attire(w.hi, w.lo, w.rain).concat(dayExtras(day)) };
  }
  function wxLine(day) {
    const x = wxData(day);
    if (!x) return `<div class="wx muted"><span class="wx-ic">🌤</span><span>Add a start date (step 1) to see the expected weather and what to wear each day.</span></div>`;
    const w = x.w;
    return `<div class="wx"><span class="wx-ic" aria-hidden="true">${w.icon}</span><span><b>${w.src === "forecast" ? "Forecast" : "Typical"} for ${fmtDate(day.date)} in ${esc(day.city.name)}:</b> morning ~${deg(x.am)}, afternoon ~${deg(w.hi)}, night ~${deg(x.night)} · ${rainWords(w.rain)}${w.mountain ? " · up to 5°C cooler on the peaks" : ""}${w.src === "forecast" ? ' <span class="badge rec">live forecast</span>' : ""}<br><b>Wear:</b> ${esc(x.wear.join(", "))}.</span></div>`;
  }
  const wxPlain = (day) => { const x = wxData(day); return x ? `${x.w.src === "forecast" ? "Forecast" : "Typical"}: morning ~${deg(x.am)}, afternoon ~${deg(x.w.hi)}, night ~${deg(x.night)}, ${rainWords(x.w.rain)}. Wear: ${x.wear.join(", ")}.` : ""; };

  // Consecutive days in the same city
  function citySegments(plan) {
    const segs = [];
    plan.days.forEach((d) => { const last = segs[segs.length - 1]; if (last && last.cid === d.cityId) last.days.push(d); else segs.push({ cid: d.cityId, city: d.city, days: [d] }); });
    return segs;
  }
  function segWeather(seg) {
    const ws = seg.days.map((d) => weatherFor(d.cityId, d.date)).filter(Boolean);
    if (!ws.length) return null;
    const avg = (k) => ws.reduce((a, w) => a + w[k], 0) / ws.length;
    const lo = Math.min.apply(null, ws.map((w) => w.lo)), rain = Math.max.apply(null, ws.map((w) => w.rain));
    const extras = [];
    seg.days.forEach((d) => dayExtras(d).forEach((e) => { if (extras.indexOf(e) < 0) extras.push(e); }));
    return { hi: avg("hi"), lo, rain, forecast: ws.some((w) => w.src === "forecast"), mountain: ws[0].mountain, pack: attire(avg("hi"), lo, rain).concat(extras) };
  }

  function weatherHTML(plan) {
    const segs = citySegments(plan);
    const dated = !!state.start;
    const range = (seg) => seg.days.length > 1 ? `${fmtDate(seg.days[0].date)} – ${fmtDate(seg.days[seg.days.length - 1].date)}` : fmtDate(seg.days[0].date);
    const summary = dated ? `<section class="panel"><h3>Your trip at a glance</h3>
      <p class="hint">Typical weather for your dates from long-term averages${segs.some((s) => (segWeather(s) || {}).forecast) ? ", with live forecasts where your dates are within about two weeks" : ""}. Check a forecast a few days before you go.</p>
      <div class="tbl-wrap"><table class="wxsum"><thead><tr><th>City</th><th>Dates</th><th>Day / night</th><th>Rain</th><th>What to pack</th></tr></thead><tbody>
      ${segs.map((s) => { const w = segWeather(s); return w ? `<tr><td><b>${esc(s.city.name)}</b></td><td class="g-date">${range(s)}</td><td>${deg(w.hi)} / ${deg(w.lo)}${w.mountain ? '<br><span class="hint">peaks up to 5°C cooler</span>' : ""}</td><td>${rainWords(w.rain)}</td><td>${esc(w.pack.join(", "))}</td></tr>` : ""; }).join("")}
      </tbody></table></div></section>`
      : `<section class="panel"><h3>Your trip at a glance</h3><p>Add a <b>start date</b> in step 1 to see the weather for your dates, day by day, with what to wear. Until then, the tables below show each city month by month.</p></section>`;
    const tripMonths = (cid) => { const s = {}; plan.days.forEach((d) => { if (d.cityId === cid && d.date) s[d.date.getMonth()] = 1; }); return s; };
    const cities = segs.map((s) => s.cid).filter((v, i, a) => a.indexOf(v) === i);
    const panels = cities.map((cid) => {
      const c = CLIMATE[cid], tm = tripMonths(cid);
      if (!c) return "";
      return `<section class="panel"><h3>${esc(CITIES[cid].name)} <span class="han" style="color:var(--seal)">${CITIES[cid].zh}</span></h3>
        <ul>${climateNotes(cid).map(([ms, t]) => `<li><b>${ms.map((m) => MONTHS[m - 1]).join(", ")}:</b> ${esc(t)}</li>`).join("")}${c.mountain ? "<li><b>On the peaks:</b> up to 5°C cooler than in town, and often misty — bring an extra layer.</li>" : ""}</ul>
        <div class="tbl-wrap"><table class="wxmon"><thead><tr><th>Month</th><th>High / low</th><th>Rainy days</th><th>What to wear</th></tr></thead><tbody>
        ${c.hi.map((hi, m) => `<tr class="${tm[m] ? "trip" : ""}"><td><b>${MONTHS[m]}</b>${tm[m] ? ' <span class="badge pick">your trip</span>' : ""}</td><td>${hi}° / ${c.lo[m]}°C</td><td>${c.rain[m]}</td><td>${esc(attireShort(hi, c.lo[m], c.rain[m] / 30))}</td></tr>`).join("")}
        </tbody></table></div></section>`;
    }).join("");
    const always = `<section class="panel"><h3>Pack for every city</h3><ul>
      <li><b>Comfortable walking shoes</b> — you'll walk 15–25,000 steps a day; grippy soles for the Great Wall, Zhangjiajie or Huashan.</li>
      <li><b>Modest clothing</b> for mosques and temples: shoulders and knees covered; a headscarf for women in mosques.</li>
      <li><b>A light layer</b> even in summer — trains, malls and museums are strongly air-conditioned.</li>
      <li><b>A compact umbrella</b> — it doubles as a sunshade.</li>
      <li>Sunscreen, sunglasses, a refillable bottle, tissues and hand sanitiser.</li></ul>
      <p class="hint">Temperatures are long-term averages for each date (a typical day), not forecasts — real days can be several degrees warmer or colder.</p></section>`;
    return summary + panels + always;
  }

  // Live forecast (Open-Meteo, free, no key) when the trip starts within ~2 weeks
  const forecastAsked = {};
  function fetchForecasts(plan) {
    if (window.NO_PRINT || !plan || !state.start || typeof fetch !== "function") return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const soon = plan.days.filter((d) => d.date && (d.date - today) / 86400000 >= -1 && (d.date - today) / 86400000 <= 15);
    const cids = soon.map((d) => d.cityId).filter((v, i, a) => a.indexOf(v) === i && !forecastAsked[v]);
    if (!cids.length) return;
    let pending = cids.length, added = false;
    cids.forEach((cid) => {
      forecastAsked[cid] = true;
      const ll = CITIES[cid].stay.ll;
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=16`)
        .then((r) => r.json()).then((j) => {
          const d = j && j.daily;
          if (!d || !d.time) return;
          d.time.forEach((t, k) => { if (d.temperature_2m_max[k] != null) { forecastCache[cid + "|" + t] = { hi: d.temperature_2m_max[k], lo: d.temperature_2m_min[k], pp: d.precipitation_probability_max[k] || 0, code: d.weather_code[k] }; added = true; } });
        }).catch(() => { /* offline or blocked: averages stay */ })
        .then(() => { if (--pending === 0 && added && lastPlan === plan) generate(false); });
    });
  }

  // "At a glance": one row per day, built from each day's (possibly edited) timeline
  function glanceHTML(plan) {
    const show = { sight: 1, travel: 1, flight: 1, custom: 1, shop: 0, rest: 1, free: 1, prayer: 0, meal: 0, cafe: 0, breakfast: 0, hotel: 0 };
    const label = (x) => {
      if (x.k === "flight") return "✈ " + esc(x.title.replace(/^At the airport.*$/, "Airport"));
      if (x.k === "travel") return (x.icon || "→") + " " + esc(x.title.split(": ").pop());
      return esc(String(x.title).split(/[:(]/)[0].trim());
    };
    const rows = plan.days.map((d, i) => {
      const items = timelineFor(d, i).filter((x) => show[x.k] && !(x.k === "flight" && /^At the airport/.test(x.title)));
      const part = (lo, hi) => items.filter((x) => x.start >= lo && x.start < hi).map(label);
      const cont = (lo, hi) => items.filter((x) => x.start < lo && x.end > lo + 120 && x.k === "sight").map((x) => "↳ " + label(x));
      const cell = (arr) => (arr.length ? arr.join(" · ") : "—");
      const kind = KIND[d.kind] ? `<span class="kind-chip">${KIND[d.kind]}</span>` : "";
      return `<tr data-goto="day-${i + 1}" tabindex="0" role="link" aria-label="Go to day ${i + 1}">
        <td class="g-day"><b>${i + 1}</b></td>
        <td class="g-date">${d.date ? fmtDate(d.date) : "—"}</td>
        <td class="g-wx">${(() => { const w = weatherFor(d.cityId, d.date); return w ? `${w.icon} ${Math.round(w.hi)}° / ${Math.round(w.lo)}°` : "—"; })()}</td>
        <td><b>${esc(d.city.name)}</b>${kind}${isEdited(d, i) ? '<span class="kind-chip edited">edited</span>' : ""}</td>
        <td>${cell(part(0, 12 * 60 + 30))}</td><td>${cell(cont(12 * 60 + 30).concat(part(12 * 60 + 30, 18 * 60 + 30)))}</td><td>${cell(part(18 * 60 + 30, 24 * 60))}</td>
        <td class="g-sleep">${d.kind === "depart" ? "✈ Home" : esc(d.city.name)}</td></tr>`;
    }).join("");
    return `<section class="panel glance">
      <h3>At a glance</h3>
      ${state.start ? "" : `<p class="hint">Add a start date (step 1) to see the dates and weekdays here.</p>`}
      <div class="tbl-wrap"><table><thead><tr><th>Day</th><th>Date</th><th>Weather</th><th>City</th><th>Morning</th><th>Afternoon / evening</th><th>Night</th><th>Sleep in</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">Tap a day to jump to its hour-by-hour plan, where you can edit times and add or remove anything.</p>
    </section>`;
  }

  function generate(scroll) {
    readForm();
    const plan = buildPlan(state);
    lastPlan = plan;
    editingDay = null;
    plan.map = routeMapSVG(plan);
    lmap = null;
    const ids = state.stops.map((s) => s.city);
    const arrId = plan.arriveId, depId = plan.departId;
    const routeIds = [arrId, ...ids, depId];
    const hasMainland = routeIds.some((i) => CITIES[i].region === "mainland");
    const hasHK = routeIds.includes("hk"), hasMO = routeIds.includes("mo");

    // Summary
    const route = `<span class="n">✈ ${fromSyd() ? "Sydney" : ""}${arrId !== ids[0] ? (fromSyd() ? " → " : "") + esc(CITIES[arrId].name) : ""}</span><span class="arrow">→</span> ` +
      state.stops.map((s, i) => `${i ? '<span class="arrow">→</span>' : ""}<span class="stopname">${esc(CITIES[s.city].name)}</span><span class="n">${s.nights}N</span>`).join(" ") +
      ` <span class="arrow">→</span><span class="n">✈ ${depId !== ids[ids.length - 1] ? esc(CITIES[depId].name) + (fromSyd() ? " → " : "") : ""}${fromSyd() ? "Sydney" : ""}</span>`;
    const typeLabels = state.types.map((t) => TRIP_TYPES.find((x) => x.id === t).label).concat(state.other ? [state.other] : []);
    const b = BUDGET[state.budget];
    const startD = state.start ? new Date(state.start + "T00:00:00") : null;
    const endD = startD ? new Date(startD.getTime() + (state.days - 1) * 86400000) : null;

    const notes = [];
    if (isExample) notes.push(["info", "Example", "This is a sample 10-day trip. Change anything on the left and press <b>Build my itinerary</b>."]);
    if (reordered) notes.push(["info", "Route", `Cities re-ordered so you start in ${esc(CITIES[arrId].name)}, finish near ${esc(CITIES[depId].name)} and travel the shortest way between them. Untick “Recommend the best city order and transport” to keep your own order.`]);
    reordered = false;
    plan.warnings.forEach((w) => notes.push(["warn", "Check", esc(w)]));
    if (isAU() && hasMainland) {
      const longest = Math.max(0, ...mainlandStretches());
      if (longest > 30) notes.push(["warn", "Visa", `Your longest unbroken mainland stretch is <b>${longest} nights</b>. Australians get up to 30 days visa-free per entry, so either break it with a Hong Kong/Macau visit or apply for a tourist (L) visa.`]);
      else notes.push(["good", "Visa", `No visa needed: Australian passports get up to 30 days visa-free per mainland entry (tourism, business, family visits, transit). Your longest mainland stretch is ${longest} nights${hasHK || hasMO ? ", and each re-entry from Hong Kong/Macau starts a fresh 30 days" : ""}.`]);
      if (endD && endD > new Date("2026-12-31T23:59:59")) notes.push(["warn", "Visa", "The visa-free arrangement for Australians currently runs to <b>31 December 2026</b> and your trip goes past that date. Check Smartraveller for an extension before booking."]);
    }
    if (isAU() && hasHK) notes.push(["info", "Visa", "Hong Kong: Australians can stay up to 90 days without a visa."]);
    if (fromSyd()) {
      const a = SYD_FLIGHTS[arrId], z = SYD_FLIGHTS[depId];
      const same = arrId === depId;
      notes.push(["info", "Flights", `Book ${same ? "a return" : "a <b>multi-city</b>"} ticket: Sydney → ${esc(CITIES[arrId].name)}${a && a.direct ? " (nonstop)" : " (via a connection)"}${same ? " and back" : `, then ${esc(CITIES[depId].name)} → Sydney${z && z.direct ? " (nonstop)" : " (via a connection)"}`}. ${same ? "" : "Flying into one city and out of another avoids backtracking. "}Details are on Day 1 and the last day.`]);
    }
    {
      const fl = state.flights || {};
      const bits = [];
      if (fl.inTime) bits.push(`lands in ${esc(CITIES[arrId].name)} at <b>${esc(fl.inTime)}</b>${fl.inNo ? " (" + esc(fl.inNo) + ")" : ""}`);
      if (fl.outTime) bits.push(`flight home leaves ${esc(CITIES[depId].name)} at <b>${esc(fl.outTime)}</b>${fl.outNo ? " (" + esc(fl.outNo) + ")" : ""}`);
      if (bits.length) notes.push(["info", "Times", bits.join("; ").replace(/^./, (c) => c.toUpperCase()) + ". Day 1 and the last day are planned around these."]);
      else notes.push(["info", "Times", "Add your landing and take-off times (step 2), and train or flight times on each city card, to plan arrival and travel days to the hour."]);
    }
    if (!isAU() && hasMainland && (hasHK || hasMO)) {
      // Count mainland entries
      let entries = 0, inMain = false;
      routeIds.forEach((i) => { const m = CITIES[i].region === "mainland"; if (m && !inMain) entries++; inMain = m; });
      if (entries > 1) notes.push(["warn", "Visa", `Your route enters mainland China <b>${entries} times</b> (Hong Kong/Macau are outside the mainland's border). A single-entry visa is not enough: apply for a <b>double- or multiple-entry</b> visa, or reorder so Hong Kong/Macau come first or last.`]);
      else notes.push(["info", "Visa", "Hong Kong/Macau are separate immigration zones. Your route enters the mainland once, so a single-entry visa works (if you need a visa at all)."]);
    }
    if (startD) {
      const m = startD.getMonth();
      const touches = (mo, d1, d2) => { for (let i = 0; i < state.days; i++) { const x = new Date(startD.getTime() + i * 86400000); if (x.getMonth() === mo && x.getDate() >= d1 && x.getDate() <= d2) return true; } return false; };
      if (touches(9, 1, 7)) notes.push(["warn", "Holiday", "Your dates overlap China's National Day Golden Week (1–7 Oct): huge crowds, sold-out trains and higher hotel prices. Book everything early."]);
      if (touches(4, 1, 5)) notes.push(["warn", "Holiday", "Your dates overlap the May Day holiday (around 1–5 May): expect crowds and book trains as soon as sales open."]);
      if ([6, 7].includes(m)) notes.push(["info", "Weather", "July–August is hot, humid and rainy across most of China. Plan outdoor sights for early morning."]);
      if ([11, 0, 1].includes(m) && ids.includes("bj")) notes.push(["info", "Weather", "Beijing in winter is dry and often below 0 °C. Pack thermals for the Great Wall."]);
    }
    {
      const open = plan.map.legs.filter((l) => l.mode === "unset");
      const auto = plan.map.legs.filter((l) => legInfo(l.a.id, l.b.id).auto);
      if (auto.length) notes.push(["good", "Transport", `Recommended for you: ${auto.map((l) => esc(CITIES[l.a.id].name) + " → " + esc(CITIES[l.b.id].name) + " by " + MODE[l.mode].label.toLowerCase()).join("; ")}. Each travel day explains why and compares the alternatives; change any of them with “Getting here” on the city cards.`]);
      if (open.length) notes.push(["info", "Transport", `${open.length} of ${plan.map.legs.length} journeys between cities have no transport chosen yet (${open.map((l) => esc(CITIES[l.a.id].name) + " → " + esc(CITIES[l.b.id].name)).join(", ")}). Pick train, flight, coach, car or ferry on each city card — or tick “Recommend the best city order and transport” in step 2 and the planner will choose — until then each travel day lists the options with times and costs.`]);
    }
    {
      const ed = plan.days.filter((d, i) => isEdited(d, i)).length;
      if (ed) notes.push(["info", "Your edits", `${ed} day${ed > 1 ? "s have" : " has"} your own changes, kept even if you rebuild. Use “Reset day” on a day to go back to the suggestion.`]);
    }
    notes.push(["info", "Prices", `Local prices are followed by an approximate Australian-dollar amount, e.g. ¥100 ≈ A$${audFmt(100 * AUD_RATE["¥"])}. Rates: ${AUD_NOTE}. Card and Alipay rates include small fees, so budget a few percent more.`]);
    notes.push(["good", "Halal", "Every activity lists the nearest halal food we know of. Always confirm the green <span class=\"han\">清真</span> sign or certificate at the door — ownership changes."]);

    const hdr = `<div class="summary">
      <div class="eyebrow">${isExample ? "Example itinerary" : "Your itinerary"} · ${state.days} days${startD ? ` · ${fmtDate(startD)} – ${fmtDate(endD)}` : ""}</div>
      <h2>${esc(typeLabels.length ? typeLabels.join(", ") : "All-round")} trip through ${esc(state.stops.map((s) => CITIES[s.city].name).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</h2>
      <div class="route">${route}</div>
      <div class="map-wrap map-summary">${plan.map.svg}</div>
      <div class="map-legend">${plan.map.legend}<button type="button" class="btn small" data-tab="map">Open the map tab for street maps →</button></div>
      <div class="facts">
        <div class="fact"><b>${state.days} days / ${state.days - 1} nights</b><span>Length</span></div>
        <div class="fact"><b>${state.stops.length} ${state.stops.length === 1 ? "stop" : "stops"}</b><span>Cities</span></div>
        <div class="fact"><b>${b.day}</b><span>${b.label} / person / day${hasHK ? ` · HK ${b.hk}` : ""}</span></div>
        <div class="fact"><b>${state.pace === "relaxed" ? "Relaxed" : "Balanced"}</b><span>Pace</span></div>
      </div>
      <div class="notes">${notes.map(([k, t, h]) => `<div class="note ${k}"><b class="tag">${t}</b><span>${h}</span></div>`).join("")}</div>
      <div class="actions"><button type="button" class="btn print-btn" data-print>🖨 Print itinerary & info (${plan.days.length + 5} pages)</button><button type="button" class="btn print-btn" data-pdf>📄 Download PDF</button><button type="button" class="btn" data-save>⬇ Save offline copy</button><button type="button" class="btn" id="copyPlan">Copy itinerary as text</button></div>
    </div>`;

    const tabs = `<div class="tabs" role="tablist">
      ${[["plan", "Day by day"], ["map", "Map"], ["wx", "Weather & what to wear"], ["stay", "Hotels & halal food"], ["prep", "Before you go"], ["talk", "Phrases"]].map(([id, l]) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${currentTab === id}" aria-controls="pane-${id}" data-tab="${id}">${l}</button>`).join("")}
    </div>`;

    // Day by day
    let html = `<div id="glanceBox">${glanceHTML(plan)}</div>`, n = 0;
    plan.days.forEach((day, i) => {
      if (day.kind !== "full" && day.kind !== "depart") {
        const st = state.stops[n];
        html += `<div class="city-band"><h3>${esc(day.city.name)}</h3><span class="han">${day.city.zh}</span><span class="meta">${st ? st.nights + " night" + (st.nights > 1 ? "s" : "") : ""}</span></div>
          <p class="city-stay">${esc(day.city.intro)} <b>Stay:</b> ${userHotel(day.city) ? `<b>${esc(stayName(day.city))}</b> (your hotel) — all times and directions are worked out from it.` : `${esc(day.city.stay.area)}. ${esc(day.city.stay.why)} <i>Add your hotel on the ${esc(day.city.name)} card to plan from it.</i>`}</p>
          <p class="city-stay"><b>Top rated here:</b> ${day.city.places.filter((p) => p.r === 3).map((p) => plan.stops[n].used.has(p.id) ? `${esc(p.n)} <span style="color:var(--jade)">✓ in your plan</span>` : `${esc(p.n)} <i>(not in this plan — add a night)</i>`).join(" · ")}</p>`;
        n++;
      }
      html += `<article class="day" id="day-${i + 1}">
        <div class="day-num"><div class="stamp">${i + 1}</div><small>Day ${i + 1}${day.date ? "<br>" + fmtDate(day.date) : ""}</small></div>
        <div class="day-body"><h4 class="day-title">${esc(dayTitle(day))}${KIND[day.kind] ? `<span class="kind">${KIND[day.kind]}</span>` : ""}</h4>
          ${wxLine(day)}
          <div class="tl" id="tl-${i}">${timelineHTML(i)}</div>
          <h5 class="details-h">Details, directions & halal food</h5>
          ${day.slots.map((s) => slotHTML(s, day)).join("")}
          ${day.back && day.kind !== "depart" ? `<div class="back"><b>Back to the hotel:</b> ${day.back.text}</div>` : ""}
          ${googleDayLink(day) ? `<div class="maplinks"><a href="${googleDayLink(day)}" target="_blank" rel="noopener">🗺 Open this day's route in Google Maps ↗</a><a href="#" data-tab="map" data-mapday-open="${i}">See it on the map</a></div>` : ""}
        </div></article>`;
    });

    const out = $("#out");
    out.innerHTML = hdr + askHTML(plan) + tabs +
      `<div id="pane-plan" role="tabpanel" aria-labelledby="tab-plan" class="out" ${currentTab !== "plan" ? "hidden" : ""}><h2 class="print-only">Day-by-day itinerary</h2>${html}</div>
       <div id="pane-map" role="tabpanel" aria-labelledby="tab-map" class="out" ${currentTab !== "map" ? "hidden" : ""}><h2 class="print-only">Map</h2>${mapPaneHTML(plan)}</div>
       <div id="pane-wx" role="tabpanel" aria-labelledby="tab-wx" class="out" ${currentTab !== "wx" ? "hidden" : ""}><h2 class="print-only">Weather & what to wear</h2>${weatherHTML(plan)}</div>
       <div id="pane-stay" role="tabpanel" aria-labelledby="tab-stay" class="out" ${currentTab !== "stay" ? "hidden" : ""}><h2 class="print-only">Hotels, halal food & things to do</h2>${stayHTML(ids)}</div>
       <div id="pane-prep" role="tabpanel" aria-labelledby="tab-prep" class="out" ${currentTab !== "prep" ? "hidden" : ""}><h2 class="print-only">Before you go</h2>${prepHTML(routeIds, hasMainland, hasHK, hasMO)}</div>
       <div id="pane-talk" role="tabpanel" aria-labelledby="tab-talk" class="out" ${currentTab !== "talk" ? "hidden" : ""}><h2 class="print-only">Phrases</h2>${phrasesHTML(hasHK || hasMO)}</div>
       <p class="foot"><b>${esc(refreshLine())}</b> Prices, opening hours and visa rules change. Figures here are meant for planning; confirm bookings and entry rules on official sites before you travel. Directions are estimates from map distance — use Apple Maps or Amap on the day for live routes.</p>`;
    restoreChecks();
    plan.days.forEach((d, i) => { if (isEdited(d, i)) { const pids = new Set(timelineFor(d, i).map((x) => x.pid).filter(Boolean)); document.querySelectorAll(`#day-${i + 1} .slot[data-pid]`).forEach((sl) => (sl.hidden = !pids.has(sl.dataset.pid))); } });
    if (currentTab === "map") showStreetMap();
    addAUD($("#out"));
    fetchForecasts(plan);
    renderAskHistory();
    if (askDraft) renderAskPreview();
    lastPrintArgs = { ids, routeIds, arrId, depId, hasMainland, hasHK, hasMO, startD, endD, notes };
    buildPrintView(plan, lastPrintArgs);
    if (scroll) out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- your travel guide (guide-data.js) ---------- */
  const G_ON = typeof GUIDE !== "undefined";
  function guideFor(city) { return G_ON && city ? Object.values(GUIDE).find((g) => g.guideCity === city.name) : null; }
  function guideLink(label) { return G_ON && GUIDE_INFO.url && GUIDE_INFO.url.startsWith("http") ? `<a class="g-link" href="${esc(GUIDE_INFO.url)}" target="_blank" rel="noopener">${label}</a>` : ""; }
  function guideTip(city, p) {
    const g = guideFor(city); const t = g && g.tips[p.n];
    if (!t || !t.length) return "";
    return `<div class="g-tip"><b>📘 From your travel guide</b>${t.map((x) => `<span>${x.k !== "Guide" ? `<i class="g-cat">${esc(x.k)}</i> ` : ""}<b>${esc(x.n)}</b> — ${esc(x.t)}</span>`).join("")}</div>`;
  }
  function guidePanel(city) {
    const g = guideFor(city); if (!g) return "";
    const li = (a) => a.join("");
    const vcls = { "BEST PICK": "best", Good: "good", OK: "ok", Skip: "skip" };
    const short = g.shortlist.length ? `<h5>Your shortlist – checked</h5><div class="g-list">${li(g.shortlist.map((h) => `<div class="g-row"><span class="g-v ${vcls[h.verdict] || ""}">${h.verdict === "BEST PICK" ? "★ " : ""}${esc(h.verdict)}</span><b>${esc(h.n)}</b> <span class="hint">${esc(h.price)} · ${esc(h.score)}</span><span>📍 ${esc(h.near)}</span><span class="hint">${esc(h.note)}</span></div>`))}</div>` : "";
    return `<details class="g-box"><summary>📘 From your travel guide — ${esc(city.name)} ${guideLink("Open the full guide ↗")}</summary>
      ${short}
      <h5>Best hotel picks</h5><div class="g-list">${li(g.picks.map((h) => `<div class="g-row"><span class="g-v best">${esc(h.tier)}</span><b>${esc(h.n)}</b> <span class="hint">${esc(h.aud)} 2 adults · ${esc(h.fam)} with a child</span><span>${esc(h.why)}</span></div>`))}</div>
      <h5>Where to stay – by what's nearby</h5>${li(g.areas.map((a) => `<div class="g-area"><b>${esc(a.area)}</b> <span class="hint">${esc(a.best)}</span><span>🚶 ${esc(a.near)}</span><ul>${li(a.hotels.map((h) => `<li><b>${esc(h.n)}</b> <span class="hint">${esc(h.tier)} · ${esc(h.aud)}</span> — 📍 ${esc(h.near)}</li>`))}</ul></div>`))}
      <h5>Viral & Instagram-worthy</h5><ul>${li(g.viral.map((v) => `<li><i class="g-cat">${esc(v.cat)}</i> <b>${esc(v.n)}</b> <span class="hint">${esc(v.area)}</span> — ${esc(v.tip)}</li>`))}</ul>
      <h5>Instagram cafés</h5><ul>${li(g.cafes.map((c) => `<li><b>${esc(c.n)}</b> <span class="hint">${esc(c.area)}</span> — ${esc(c.why)}</li>`))}</ul>
      <h5>Shopping</h5><ul>${li(g.shopping.map((x) => `<li><b>${esc(x.n)}</b> — ${esc(x.d)}</li>`))}</ul>
      <h5>Halal food – what to order</h5><ul>${li(g.halal.map((h) => `<li><b>${esc(h.n)}</b> <span class="hint">${esc(h.area)}${h.addr ? " · " + esc(h.addr) : ""}</span>${h.order ? `<br>🍽 ${esc(h.order)}` : ""}</li>`))}</ul>
    </details>`;
  }

  function stayHTML(ids) {
    const uniq = ids.filter((v, i, a) => a.indexOf(v) === i);
    return uniq.map((id) => {
      const c = CITIES[id];
      const hotels = c.hotels.map((h) => `<div class="hotel ${h.tier === state.budget ? "pick" : ""}"><span class="tier">${TIER[h.tier]}${h.tier === state.budget ? " · your budget" : ""}</span><b>${esc(h.n)}</b><span>${esc(h.area)} — ${esc(h.note)}</span></div>`).join("");
      const halal = c.halal.map((h) => `<li><b>${esc(h.n)}</b> — ${esc(h.note)}</li>`).join("");
      const mosques = c.mosques.length ? `<h4>Mosques</h4><ul>${c.mosques.map((m) => `<li><b>${esc(m.n)}</b> — ${esc(m.note)}</li>`).join("")}</ul>` : `<h4>Mosques</h4><p>No major mosque listed here; search <span class="han">清真寺</span> in Amap and use Muslim Pro for prayer times and qibla.</p>`;
      return `<section class="panel">
        <h3>${esc(c.name)} <span class="han" style="color:var(--seal)">${c.zh}</span></h3>
        <p>${esc(c.intro)}</p>
        <h4>Best area to stay</h4><p><b>${esc(c.stay.area)}.</b> ${esc(c.stay.why)}</p>
        <h4>Hotels</h4><div class="hotels">${hotels}</div>
        ${guidePanel(c)}
        <p class="hint">Book on Trip.com, Booking.com or directly. In the mainland, a small number of hotels still cannot register foreign guests — Trip.com listings show this, and the hotel will register your passport with the police for you.</p>
        <h4>Top-rated things to do</h4><ul>${c.places.filter((p) => p.r >= 2).sort((a, b) => b.r - a.r).map((p) => `<li><b>${esc(p.n)}</b> <span style="color:var(--gold)">${"★".repeat(p.r)}</span> — ${esc(p.d.split(". ")[0].replace(/\.$/, ""))}. <span class="hint">${esc(p.h)} · ${esc(p.c)}</span></li>`).join("")}</ul>
        <h4>Halal food</h4><ul>${halal}</ul><p>${esc(c.halalTip)}</p>
        ${mosques}
        <h4>Dishes to try (ask for the halal version)</h4><ul>${c.dishes.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
        <h4>Getting around</h4><p>${esc(c.getAround)}</p>
        <h4>Arriving</h4><p>${esc(c.arrive)}</p>
        <h4>Leaving</h4><p>${esc(c.depart)}</p>
      </section>`;
    }).join("");
  }

  /* ---------- before you go ---------- */
  function checklistItems() {
    return [
      "Passport valid for 6+ months after your return, with 2 blank pages",
      isAU() ? "Confirm Australian visa-free entry still applies for your dates (Smartraveller); keep each mainland stretch to 30 days or less" : "Check visa-free / transit eligibility for your passport, or apply for a visa (double/multiple entry if you go via Hong Kong or Macau)",
      ...(isAU() ? ["Register your trip and subscribe to China and Hong Kong updates on Smartraveller", "Save the Consular Emergency Centre number: +61 2 6261 3305"] : []),
      fromSyd() ? "Book a multi-city flight from Sydney: into your first city, out of your last" : "Book flights in and out",
      "Book intercity trains (12306 opens sales ~15 days ahead; Trip.com takes earlier requests and auto-books)",
      "Book hotels and confirm they accept foreign passports",
      "Reserve timed tickets: Forbidden City, National Museum, Shaanxi History Museum, Terracotta Army, Panda Base, Shanghai Museum (most open 7 days ahead and need your passport number)",
      "Install Alipay and WeChat and link a Visa/Mastercard before you leave home (needs SMS to your home number)",
      "Buy a roaming eSIM / data plan so Google, WhatsApp and Instagram work in the mainland",
      "Buy travel insurance with medical evacuation; check it covers hiking, glass bridges, rafting",
      "Download offline maps and the offline Chinese pack in your translator app",
      "Save hotel names and addresses in Chinese (screenshot them)",
      "Tell your bank you're travelling; carry two cards from different networks (Visa + Mastercard)",
      "Carry ¥500–1,000 in cash for small shops and emergencies",
      isAU() ? "Plugs: Australian plugs fit most mainland sockets (Type I, 220 V); buy a Type G (UK) adapter for Hong Kong and Macau" : "Plug adapters: mainland uses Type A/C/I (220 V); Hong Kong and Macau use Type G (UK)",
      "Power bank with the Chinese 3C mark if flying domestically (others are refused at security)",
      "Copies of passport and visa: on paper and on your phone",
      "Prescription medicines in original packaging with a copy of the prescription",
      "Prayer mat, qibla app and halal snacks for remote days (Zhangjiajie, Guilin, Great Wall)",
    ];
  }

  function prepHTML(ids, hasMainland, hasHK, hasMO) {
    const checklist = checklistItems();
    return `
    <section class="panel">
      <h3>Visas & entry forms</h3>
      ${hasMainland && isAU() ? `<h4>Mainland China — Australian passport</h4>
      <ul>
        <li><b>No visa needed for up to 30 days per entry</b> for tourism, business, visiting family or friends, and transit. The arrangement currently runs until <b>31 December 2026</b> — check Smartraveller if you travel later.</li>
        <li>Each entry is counted separately, so leaving for Hong Kong or Macau and coming back starts a new 30 days.</li>
        <li>Work, study and journalism still need a visa. Border officers make the final call, so carry your return ticket and hotel bookings.</li>
        <li>Staying longer than 30 days in one go? Apply for a tourist (L) visa through the Chinese Visa Application Service Centre in Sydney (or Melbourne, Brisbane, Perth): fill in the online form at visaforchina.cn, then attend in person.</li>
        <li>Passport: valid for at least 6 months after you get home, with blank pages.</li>
        <li><b>Dual Australian–Chinese nationals:</b> China doesn't recognise dual nationality. Enter and leave on your Australian passport; if you also hold Chinese documents, Australian consular help may be limited. Read Smartraveller's dual-national advice before you go.</li>
      </ul>
      <h4>On arrival</h4>
      <ul>
        <li>Fill in the foreigner arrival card (paper cards at the airport, or pre-fill online via the National Immigration Administration's website/app where offered). Write your first hotel's address.</li>
        <li>Fingerprints and a photo are taken at immigration. Tell the officer you're visiting for tourism under visa-free entry.</li>
        <li>Hotels register you with the police automatically. Staying in a private home means registering at the local police station within 24 h.</li>
        <li>Carry your passport at all times: it's your ticket for trains, museums and many attractions.</li>
      </ul>` : ""}
      ${hasMainland && !isAU() ? `<h4>Mainland China — three ways in</h4>
      <ol>
        <li><b>Visa-free entry (up to 30 days).</b> China has rapidly expanded unilateral and mutual visa-free entry since 2023–2026 — it now covers most of Europe, Australia, New Zealand, Japan, South Korea, several Gulf, Latin American and ASEAN states (e.g. Malaysia, Singapore, Thailand, Saudi Arabia, UAE, Qatar). The list keeps changing: check your passport on the <b>National Immigration Administration</b> site (nia.gov.cn) or your local Chinese embassy site before booking.</li>
        <li><b>240-hour visa-free transit.</b> Citizens of 55 countries (including the US, UK, Canada and most of Europe) can stay up to 10 days if they fly <i>from</i> one country and leave <i>to a different</i> country or region (Hong Kong and Macau count). You need a confirmed onward ticket, must enter and leave through designated ports, and stay within the permitted provinces. Tell the airline at check-in you're using visa-free transit.</li>
        <li><b>Tourist (L) visa.</b> Everyone else (e.g. Indian, Pakistani, Bangladeshi, Nigerian passports) applies in advance:
          <ul>
            <li>Fill in the online application form (COVA) at <b>visaforchina.cn</b> (or the embassy portal for your country), print the form and confirmation page.</li>
            <li>Book an appointment at the Chinese Visa Application Service Center (CVASC) or embassy.</li>
            <li>Bring: passport (6+ months validity, 2 blank pages), one 33×48 mm photo on white, flight bookings in and out, hotel bookings or an itinerary (you can print this planner's itinerary), proof of funds if requested. Applicants aged 14–70 may need fingerprints.</li>
            <li>Processing is usually 4 working days (express available). Ask for <b>double or multiple entry</b> if you visit Hong Kong/Macau mid-trip.</li>
          </ul></li>
      </ol>
      <h4>On arrival</h4>
      <ul>
        <li>Fill in the foreigner arrival card (paper cards at the airport, or pre-fill online via the National Immigration Administration's website/app where offered). Have your first hotel's address ready.</li>
        <li>Fingerprints and a photo are taken at immigration.</li>
        <li>Hotels register you with the police automatically. If you stay in a private home, you must register at the local police station within 24 h.</li>
        <li>Carry your passport at all times: it's your ticket for trains, museums and many attractions.</li>
      </ul>` : ""}
      ${hasHK && isAU() ? `<h4>Hong Kong</h4><p>Australians: visa-free for up to 90 days. Passport must be valid for at least 1 month beyond your stay. No arrival card or health form.</p>` : ""}
      ${hasMO && isAU() ? `<h4>Macau</h4><p>Australians can visit without a visa (generally up to 30 days). Confirm on Smartraveller's Macau page.</p>` : ""}
      ${hasHK && !isAU() ? `<h4>Hong Kong</h4><p>Visa-free for 170+ nationalities (7–180 days). Indian passport holders must complete the free online <b>Pre-arrival Registration</b> first. Others needing a visa apply through the HK Immigration Department (immd.gov.hk). No arrival form or health declaration needed.</p>` : ""}
      ${hasMO && !isAU() ? `<h4>Macau</h4><p>Visa-free for most nationalities for 30–90 days; some get a visa on arrival. Check the Macau Public Security Police site (fsm.gov.mo).</p>` : ""}
      <div class="note ${isAU() ? "info" : "warn"}"><b class="tag">${isAU() ? "Good to know" : "Important"}</b><span>Hong Kong and Macau are outside mainland immigration. Going mainland → Hong Kong → mainland counts as two mainland entries${isAU() ? " — fine for Australians, since each visa-free entry gets its own 30 days" : ""}.</span></div>
    </section>

    ${fromSyd() ? flightsPanel(ids, lastPlan.arriveId, lastPlan.departId) : ""}
    ${isAU() ? ausPanel(ids) : ""}
    <section class="panel">
      <h3>Insurance</h3>
      <ul>
        ${isAU() ? "<li><b>Medicare doesn't cover you in China or Hong Kong</b> (Australia has no reciprocal health agreement with either). Smartraveller's line: if you can't afford travel insurance, you can't afford to travel.</li>" : ""}
        <li><b>Not usually required</b> for entry, but strongly recommended: international hospitals in big cities and all private care in Hong Kong are expensive.</li>
        <li>Look for: medical cover (aim for US$100,000+), emergency evacuation/repatriation, trip cancellation and delay, baggage and phone theft.</li>
        <li><b>Adventure add-on:</b> check that hiking (Huashan, Dragon's Back), rafting, glass bridges, climbing or bungee are covered — many basic policies exclude them.</li>
        <li>${isAU() ? "Australian options to compare: Cover-More, Allianz Travel, World Nomads, Fast Cover, or your credit card's complimentary cover (it usually only applies if you paid the trip on that card). Check pre-existing conditions are declared." : "Examples to compare: World Nomads, SafetyWing, Allianz Travel, or your credit card's cover."} Read the exclusions.</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Apps to install before you fly</h3>
      <p>Download everything at home: the Google Play store is blocked in the mainland.</p>
      <div class="apps">
        ${[
          ["must", "Alipay", "Pay almost anywhere (link a foreign Visa/Mastercard), metro QR codes, DiDi, attraction bookings. In English."],
          ["must", "WeChat", "Messaging, WeChat Pay and the mini programs museums use for bookings."],
          ["must", "Apple Maps (iPhone) or Amap 高德", "Accurate maps and public transport in the mainland. Amap has an English mode. Google Maps is unreliable there."],
          ["must", "DiDi", "Ride hailing in English (also inside Alipay). Shows the driver your destination in Chinese."],
          ["must", "Trip.com", "Trains, flights, hotels, attraction tickets in English; good customer service."],
          ["must", "A translator", "Microsoft Translator, Apple Translate or Baidu Translate (camera mode reads menus). Download the offline Chinese pack."],
          ["must", "Muslim Pro or Athan", "Prayer times, qibla and nearby mosques."],
          ["must", "Travel eSIM (Airalo, Holafly, Nomad…)", "Roaming data routes outside China's firewall, so Google, WhatsApp and Instagram work."],
          ["nice", "Railway 12306", "Official rail app (English). Cheapest tickets, no booking fee."],
          ["nice", "Dianping 大众点评", "China's Yelp. Search 清真 to find halal restaurants near you."],
          ["nice", "HalalTrip or Zabihah", "Crowd-sourced halal restaurant listings (best for Hong Kong)."],
          ["nice", "Pleco", "Chinese dictionary with handwriting input."],
          ...(ids.includes("hk") ? [["must", "MTR Mobile + Octopus", "Hong Kong metro routes; Octopus card works in Apple Wallet."]] : []),
          ["nice", "XE Currency", "Quick conversions: ¥, HK$ and MOP."],
        ].map(([k, n, d]) => `<div class="app"><span class="tag ${k}">${k === "must" ? "Essential" : "Useful"}</span><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join("")}
      </div>
    </section>

    <section class="panel">
      <h3>Money & payments</h3>
      <ul>
        <li><b>Mainland China is nearly cashless.</b> Alipay and WeChat Pay are accepted everywhere, from noodle shops to taxis. Link your foreign card in the app and verify with your passport.</li>
        <li>Fees: Alipay charges foreign cards nothing on payments up to ¥200 and 3% above that; WeChat Pay is similar. Your bank may add foreign transaction fees.</li>
        <li>Still carry some cash (¥500–1,000). ATMs at Bank of China, ICBC and airports accept Visa/Mastercard.</li>
        <li>International cards work in big hotels, malls and Trip.com, but rarely in small shops.</li>
        ${ids.includes("hk") ? "<li><b>Hong Kong:</b> HK$. Credit cards widely accepted; get an Octopus card for transport and convenience stores. Alipay HK and WeChat Pay HK work too.</li>" : ""}
        ${ids.includes("mo") ? "<li><b>Macau:</b> pataca (MOP). HK$ accepted almost everywhere at about 1:1 but change comes in MOP.</li>" : ""}
      </ul>
    </section>

    <section class="panel">
      <h3>Internet & phone</h3>
      <ul>
        <li>In the mainland, Google (Maps, Gmail, Translate), WhatsApp, Instagram, Facebook, YouTube and X are blocked.</li>
        <li>The easiest fix is a <b>roaming eSIM or your home plan's roaming</b>: the data is routed abroad, so these apps work. Install and activate before you fly.</li>
        <li>A local SIM (China Mobile/Unicom) is cheap but behind the firewall. VPNs are a legal grey area and often unreliable.</li>
        <li>Hong Kong and Macau have no restrictions.</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Tips for travelling in China</h3>
      <ul>
        <li><b>Avoid national holidays:</b> Chinese New Year (late Jan–Feb), 1–5 May, and Golden Week (1–7 Oct). Prices double, trains sell out.</li>
        <li><b>Best seasons:</b> April–May and September–early November. Summers are hot and wet; northern winters are freezing.</li>
        <li><b>Trains:</b> high-speed rail beats flying under ~5 h. Arrive 45–60 min early — there's ID and bag security. Many stations let foreigners scan their passport at the gates; otherwise use the staffed lane.</li>
        <li><b>Security checks</b> at every metro station, train station and big attraction. Keep liquids and lighters to a minimum.</li>
        <li><b>Book ahead:</b> top museums are free but need a timed reservation with your passport number; they open about 7 days before and go fast. Most museums close on <b>Mondays</b>.</li>
        <li><b>Taxis:</b> use DiDi or the official taxi queue; ignore drivers who approach you at stations and airports.</li>
        <li><b>Scams:</b> the 'tea house' or 'art student' scam in Beijing and Shanghai — friendly strangers invite you for tea, then a huge bill arrives. Politely decline.</li>
        <li><b>Toilets:</b> many are squat-style and lack paper. Carry tissues and hand sanitiser.</li>
        <li><b>Water:</b> don't drink tap water in the mainland; hotels provide bottled water or a kettle.</li>
        <li><b>Tipping</b> isn't expected in the mainland. Hong Kong restaurants add a 10% service charge.</li>
        <li><b>Bargaining</b> is normal at markets (start at 30–50% of the asking price), not in malls or shops with price tags.</li>
        <li><b>Respect:</b> avoid political topics; ask before photographing people; no photos inside some temple halls.</li>
        <li><b>Halal:</b> look for <span class="han">清真</span> on a green sign, often with Arabic script. Hui-run Lanzhou noodle shops are the most reliable fallback anywhere in the mainland. Restaurants serving alcohol are common even if the food is halal.</li>
        <li><b>Emergency numbers</b> — Mainland: police 110, ambulance 120, fire 119. Hong Kong & Macau: 999.</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Pre-departure checklist</h3>
      <p class="hint">Ticks are saved in this browser.</p>
      <ul class="checklist">${checklist.map((c, i) => `<li><input type="checkbox" id="chk-${i}" data-chk="${i}"><label for="chk-${i}"><span>${esc(c)}</span></label></li>`).join("")}</ul>
    </section>`;
  }

  function flightsPanel(ids, first, last) {
    const rows = Object.entries(SYD_FLIGHTS).filter(([id]) => ids.includes(id)).concat(
      Object.entries(SYD_FLIGHTS).filter(([id]) => !ids.includes(id) && SYD_FLIGHTS[id].direct));
    return `<section class="panel">
      <h3>Flights to and from Sydney</h3>
      <p>Suggested ticket: <b>Sydney → ${esc(CITIES[first].name)}</b>${first === last ? " and back" : `, returning <b>${esc(CITIES[last].name)} → Sydney</b> (book as a multi-city ticket on the airline site, Google Flights or Skyscanner)`}. Overnight flights from Sydney usually land in China early in the morning; flights home are often overnight, landing in Sydney in the morning.</p>
      <div class="tbl-wrap"><table><thead><tr><th>City</th><th>Airport</th><th>From Sydney</th></tr></thead><tbody>
        ${rows.map(([id, f]) => `<tr><td><b>${esc(CITIES[id].name)}</b>${id === first ? " · start" : ""}${id === last ? " · end" : ""}${!ids.includes(id) ? " · other nonstop option" : ""}</td><td>${esc(f.airport)}</td><td>${f.direct ? '<b style="color:var(--jade)">Nonstop</b> · ' : ""}${esc(f.text)}</td></tr>`).join("")}
      </tbody></table></div>
      <ul>
        <li>Nonstop cities from Sydney: Beijing, Shanghai, Guangzhou, Chengdu and Hong Kong. Everywhere else needs a connection or a train from one of these.</li>
        <li>Chinese carriers (China Southern, China Eastern, Air China, Sichuan) are usually cheapest and include onward domestic connections on one ticket. Cathay Pacific and Qantas serve Hong Kong.</li>
        <li>Ask the airline for a Muslim meal (MOML) when booking — at least 24–48 h before departure.</li>
        <li>Schedules change each season. Confirm days and times on the airline's site before you book.</li>
      </ul>
    </section>`;
  }

  function ausPanel(ids) {
    const hk = ids.includes("hk") || ids.includes("mo");
    return `<section class="panel">
      <h3>For Australians</h3>
      <ul>
        <li><b>Smartraveller:</b> register your trip and subscribe to the China${hk ? " and Hong Kong" : ""} pages at smartraveller.gov.au for alerts. Check the current advice level before you go.</li>
        <li><b>Emergencies abroad:</b> the 24-hour Consular Emergency Centre is <b>+61 2 6261 3305</b> (or 1300 555 135 from within Australia). Australia has an Embassy in Beijing and Consulates-General in Shanghai, Guangzhou, Chengdu and Shenyang${hk ? ", plus Hong Kong (which also covers Macau)" : ""}.</li>
        <li><b>Laws to know:</b> respect local laws, which differ from Australia's — don't fly drones without permission, avoid photographing military or government sites, don't join unregistered religious gatherings or preach, and avoid political activity. Drug penalties are severe.</li>
        <li><b>Medicines:</b> bring prescription medicines in their original packaging with a letter from your doctor. Some medicines legal in Australia are controlled in China; ask the Chinese Embassy if you're unsure.</li>
        <li><b>Money:</b> link your Australian Visa or Mastercard to Alipay and WeChat Pay before you leave (verification texts go to your Australian number, so keep roaming on). Low-fee travel cards (e.g. Wise, ING, Macquarie, Up) save on foreign transaction fees. Check today's rate on XE.</li>
        <li><b>Power:</b> mainland China uses the same angled Type I plug as Australia on most sockets (220 V, fine for Australian 230 V devices). Hong Kong and Macau need a Type G (UK) adapter.</li>
        <li><b>Time:</b> China, Hong Kong and Macau are UTC+8 all year — 2 h behind Sydney, 3 h during Australian daylight saving (Oct–Apr).</li>
        <li><b>Coming home:</b> declare food, plant and animal products on your arrival declaration (Australia is replacing the paper card with a digital Australia Travel Declaration in stages). Dried meats, many egg and dairy products, seeds and some herbal medicines are prohibited or must be inspected. Duty-free: A$900 of goods, 2.25 L alcohol, 25 cigarettes.</li>
      </ul>
    </section>`;
  }

  /* ---------- phrases ---------- */
  const PHRASES = [
    ["Greetings & basics", [
      ["Hello", "你好", "nǐ hǎo"],
      ["Thank you", "谢谢", "xiè xie"],
      ["You're welcome", "不客气", "bú kè qi"],
      ["Sorry / excuse me", "不好意思", "bù hǎo yì si"],
      ["Excuse me, may I ask…", "请问…", "qǐng wèn…"],
      ["Goodbye", "再见", "zài jiàn"],
      ["Yes / correct", "对", "duì"],
      ["No (I don't want)", "不要", "bú yào"],
      ["I don't understand", "我听不懂", "wǒ tīng bu dǒng"],
      ["Do you speak English?", "你会说英语吗？", "nǐ huì shuō yīng yǔ ma?"],
      ["Peace be upon you (Hui Muslims greet with this)", "色兰 / 赛俩目", "sè lán (as-salāmu ʿalaykum)"],
    ]],
    ["Halal food", [
      ["I am Muslim", "我是穆斯林", "wǒ shì mù sī lín"],
      ["Halal", "清真", "qīng zhēn"],
      ["Is this halal?", "这是清真的吗？", "zhè shì qīng zhēn de ma?"],
      ["Is there a halal restaurant nearby?", "附近有清真餐厅吗？", "fù jìn yǒu qīng zhēn cān tīng ma?"],
      ["I don't eat pork", "我不吃猪肉", "wǒ bù chī zhū ròu"],
      ["No pork, no lard", "不要猪肉，不要猪油", "bú yào zhū ròu, bú yào zhū yóu"],
      ["No alcohol or cooking wine", "不要放酒和料酒", "bú yào fàng jiǔ hé liào jiǔ"],
      ["Beef / lamb / chicken / fish", "牛肉 / 羊肉 / 鸡肉 / 鱼", "niú ròu / yáng ròu / jī ròu / yú"],
      ["Vegetarian", "素食", "sù shí"],
      ["Where is the mosque?", "清真寺在哪里？", "qīng zhēn sì zài nǎ lǐ?"],
    ]],
    ["Eating out", [
      ["Menu, please", "请给我菜单", "qǐng gěi wǒ cài dān"],
      ["I want this", "我要这个", "wǒ yào zhè ge"],
      ["Not spicy", "不要辣", "bú yào là"],
      ["A little spicy", "微辣", "wēi là"],
      ["Delicious!", "好吃！", "hǎo chī!"],
      ["Bill, please", "买单", "mǎi dān"],
      ["Hot water", "热水", "rè shuǐ"],
      ["To take away", "打包", "dǎ bāo"],
    ]],
    ["Getting around", [
      ["Where is …?", "…在哪里？", "… zài nǎ lǐ?"],
      ["Metro station", "地铁站", "dì tiě zhàn"],
      ["Train station / airport", "火车站 / 机场", "huǒ chē zhàn / jī chǎng"],
      ["Please take me to this address", "请带我去这个地址", "qǐng dài wǒ qù zhè ge dì zhǐ"],
      ["Stop here, please", "请在这里停", "qǐng zài zhè lǐ tíng"],
      ["Where is the toilet?", "洗手间在哪里？", "xǐ shǒu jiān zài nǎ lǐ?"],
      ["Turn left / right / straight on", "左转 / 右转 / 直走", "zuǒ zhuǎn / yòu zhuǎn / zhí zǒu"],
    ]],
    ["Shopping & money", [
      ["How much?", "多少钱？", "duō shao qián?"],
      ["Too expensive", "太贵了", "tài guì le"],
      ["Can you make it cheaper?", "便宜一点吧", "pián yi yì diǎn ba"],
      ["Can I pay with Alipay / WeChat?", "可以用支付宝 / 微信吗？", "kě yǐ yòng zhī fù bǎo / wēi xìn ma?"],
      ["Cash", "现金", "xiàn jīn"],
      ["Numbers 1–10", "一 二 三 四 五 六 七 八 九 十", "yī èr sān sì wǔ liù qī bā jiǔ shí"],
    ]],
    ["Emergencies", [
      ["Help!", "救命！", "jiù mìng!"],
      ["Call the police", "请报警", "qǐng bào jǐng"],
      ["I need a doctor / hospital", "我需要医生 / 医院", "wǒ xū yào yī shēng / yī yuàn"],
      ["I'm lost", "我迷路了", "wǒ mí lù le"],
      ["I'm allergic to …", "我对…过敏", "wǒ duì … guò mǐn"],
      ["My passport is lost", "我的护照丢了", "wǒ de hù zhào diū le"],
    ]],
  ];
  const CANTONESE = [
    ["Hello", "你好", "nei5 hou2", "nay hoh"],
    ["Thank you (for a service)", "唔該", "m4 goi1", "mm goy"],
    ["Thank you (for a gift)", "多謝", "do1 ze6", "daw jeh"],
    ["Excuse me / sorry", "唔好意思", "m4 hou2 ji3 si1", "mm hoh yee see"],
    ["How much?", "幾多錢？", "gei2 do1 cin2?", "gay daw cheen?"],
    ["Halal", "清真", "cing1 zan1", "ching jun"],
    ["No pork", "唔要豬肉", "m4 jiu3 zyu1 juk6", "mm yew jyoo yook"],
    ["Where is the MTR?", "港鐵站喺邊度？", "gong2 tit3 zaam6 hai2 bin1 dou6?", "gong teet jaam hai bin doh?"],
    ["Bill, please", "埋單", "maai4 daan1", "my daan"],
    ["Goodbye", "拜拜", "baai1 baai3", "bye bye"],
  ];
  const HALAL_CARD = "我是穆斯林，只吃清真食品。请不要使用猪肉、猪油、猪骨汤、酒或料酒。如果这道菜不是清真的，请告诉我。谢谢！";

  function phrasesHTML(cantonese) {
    return `
    <section class="panel">
      <h3>Halal card — show this to staff</h3>
      <div class="card-show">
        <div class="big">${HALAL_CARD}</div>
        <p class="hint">"I am Muslim and only eat halal food. Please don't use pork, lard, pork-bone broth, alcohol or cooking wine. If this dish is not halal, please tell me. Thank you!"</p>
        <div class="actions"><button type="button" class="btn small" id="copyCard">Copy Chinese text</button></div>
      </div>
      <p class="hint">Tip: screenshot this card. The tone marks in the pinyin below show pitch: ā flat, á rising, ǎ dip, à falling.</p>
    </section>
    ${PHRASES.map(([title, rows]) => `<section class="panel"><h3>${esc(title)}</h3><div class="tbl-wrap"><table><thead><tr><th>English</th><th>Chinese</th><th>Say it (pinyin)</th></tr></thead><tbody>
      ${rows.map(([en, zh, py]) => `<tr><td>${esc(en)}</td><td class="zh">${zh}</td><td class="py">${esc(py)}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}
    ${cantonese ? `<section class="panel"><h3>Cantonese for Hong Kong & Macau</h3><p>Hong Kong and Macau speak Cantonese and write traditional characters. Mandarin is widely understood, and English is common in Hong Kong.</p><div class="tbl-wrap"><table><thead><tr><th>English</th><th>Chinese</th><th>Jyutping</th><th>Sounds like</th></tr></thead><tbody>
      ${CANTONESE.map(([en, zh, jp, sl]) => `<tr><td>${esc(en)}</td><td class="zh">${zh}</td><td class="py">${esc(jp)}</td><td>${esc(sl)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
  }

  /* ---------- maps: route map (built-in SVG) and interactive street map (Leaflet + OpenStreetMap) ---------- */
  const mp = (ll) => [(ll[1] - MAP_GEO.lon0) * MAP_GEO.cos * MAP_GEO.k, (MAP_GEO.lat1 - ll[0]) * MAP_GEO.k];
  const SYD_LL = [-33.94, 151.18];
  /* ---------- transport modes between cities ---------- */
  const MODE = {
    train: { label: "High-speed train", cls: "leg-train", icon: "🚄" },
    flight: { label: "Flight", cls: "leg-flight", icon: "✈" },
    bus: { label: "Coach / bus", cls: "leg-road", icon: "🚌" },
    car: { label: "Private car & driver", cls: "leg-road", icon: "🚗" },
    boat: { label: "Ferry / river cruise", cls: "leg-boat", icon: "⛴" },
    unset: { label: "Not chosen yet", cls: "leg-unset", icon: "?" },
  };
  // Routes where a boat is a real option, with what it is
  const BOATS = {
    "hk|mo": { text: "TurboJET or Cotai ferry Hong Kong (Sheung Wan or Kowloon) ↔ Macau, about 1 h, approx. HK$175–200.", min: 60, cost: "HK$175–200" },
    "mo|sz": { text: "Ferry Shekou ↔ Macau, about 1 h, approx. ¥175–220.", min: 60, cost: "¥175–220" },
    "gl|ys": { text: "Li River cruise Guilin → Yangshuo, about 4–5 h with lunch on board (not halal), approx. ¥215–450; most tickets include hotel pick-up and the bus back.", min: 270, cost: "¥215–450" },
  };
  const pairKey = (a, b) => [a, b].sort().join("|");

  // Best choice where local knowledge beats a time comparison
  const BEST = { "gl|ys": "boat", "hk|mo": "boat" };
  const hasCuratedRoute = (a, b) => !!(ROUTES[a + "|" + b] || ROUTES[b + "|" + a]);

  // The planner's recommendation: local knowledge, then the researched route advice, then a time comparison
  function recommendedMode(a, b) {
    const key = pairKey(a, b), opts = modesFor(a, b);
    if (BEST[key] && opts.includes(BEST[key])) return BEST[key];
    if (key === "gl|ys") return "train"; // upstream: no cruise, the train is quickest
    const cur = curatedMode(a, b);
    if (hasCuratedRoute(a, b) || !opts.includes("train") || !opts.includes("flight")) return opts.includes(cur) ? cur : opts[0];
    const t = modeEstimate("train", a, b), f = modeEstimate("flight", a, b);
    return t.ride > 330 && t.door - f.door >= 90 ? "flight" : "train";
  }

  // Why the planner recommends this mode
  function recReason(mode, a, b) {
    const key = pairKey(a, b), opts = modesFor(a, b);
    if (key === "gl|ys" && mode === "boat") return "The Li River cruise is the highlight of this region, and it gets you to Yangshuo anyway — your transfer doubles as sightseeing.";
    if (key === "fr|zjj" && mode === "train") return "The quickest way: 20–30 min on the high-speed train from Zhangjiajie West (allow 40–50 min by taxi from Wulingyuan to the station), then about 10 min by taxi from Furongzhen station to the old town. By car it's 1.5–2 h each way.";
    if (key === "hk|mo" && mode === "boat") return "The ferries leave from Sheung Wan and Tsim Sha Tsui, close to the recommended hotels, and take about an hour. The bridge bus is cheaper but starts out at Tung Chung near the airport.";
    const t = opts.includes("train") ? modeEstimate("train", a, b) : null, f = opts.includes("flight") ? modeEstimate("flight", a, b) : null;
    switch (mode) {
      case "train":
        if (t && f && t.door > f.door + 60) return `Flying is quicker door to door here (about ${dur(f.door)} vs ${dur(t.door)} by train), but the train runs city centre to city centre with no check-in queues, baggage limits or weather delays, and the ride itself is comfortable. If time matters most, choose Flight on the city card.`;
        return `High-speed rail runs city centre to city centre, with no check-in queues or baggage limits, and is rarely delayed${f ? ` — about ${dur(t.door)} door to door, vs about ${dur(f.door)} flying once airport time is counted` : ""}.`;
      case "flight": return t ? `The train would take about ${dur(t.ride)}; flying saves around ${dur(Math.max(30, t.door - f.door))} door to door.` : "There's no practical train on this route.";
      case "bus": return "The most direct, frequent and affordable option on this route.";
      case "boat": return "The ferry is the most direct option here.";
      default: return "The most practical option on this route.";
    }
  }

  // The mode the curated route advice describes (from its first sentence)
  function curatedMode(a, b) {
    const first = routeText(a, b).toLowerCase().split(/\.\s|;/)[0];
    if (/cruise/.test(first)) return "boat";
    // whichever mode the advice names first is the one it leads with
    const at = (re) => { const m = first.search(re); return m < 0 ? Infinity : m; };
    const pos = { flight: at(/\bfl(y|ying|ight)/), train: at(/train/), bus: at(/bridge|coach|\bbus\b/), boat: at(/ferry/) };
    const best = Object.keys(pos).sort((x, y) => pos[x] - pos[y])[0];
    return pos[best] === Infinity ? "train" : best;
  }


  // Modes that make sense for this pair of cities
  function modesFor(a, b) {
    const d = km(CITIES[a].stay.ll, CITIES[b].stay.ll), key = pairKey(a, b);
    const out = [];
    if (key !== "hk|mo") out.push("train");
    if (d > 350 && key !== "hk|mo") out.push("flight");
    if (d < 1000) out.push("bus");
    if (d < 900) out.push("car");
    if (BOATS[key] && !(key === "gl|ys" && a !== "gl")) out.push("boat"); // Li River cruises only run downstream, Guilin → Yangshuo
    return out;
  }

  // The mode chosen on the form for the leg a → b (null = not chosen)
  function chosenMode(a, b) {
    for (let i = 0; i < state.stops.length; i++) {
      const fromId = i > 0 ? state.stops[i - 1].city : state.arrive || null;
      const st = state.stops[i];
      if (st.city === b && fromId === a && st.leg && st.leg.from === a && st.leg.mode) return st.leg.mode;
    }
    const ol = state.outLeg;
    if (ol && ol.from === a && b === (state.depart || "") && ol.mode) return ol.mode;
    return null;
  }
  // Mode used for time estimates: the chosen one, else the recommended one
  const legMode = (a, b) => chosenMode(a, b) || recommendedMode(a, b);

  // Rough door-to-door minutes and cost for each mode
  function modeEstimate(mode, a, b) {
    const d = km(CITIES[a].stay.ll, CITIES[b].stay.ll), road = d * 1.3;
    const r10 = (n) => (Math.round(n / 10) * 10).toLocaleString("en-US");
    const boat = BOATS[pairKey(a, b)];
    switch (mode) {
      case "flight": return { door: Math.round(150 + (d / 700) * 60 + 70), ride: Math.round((d / 700) * 60 + 25), cost: d < 1200 ? "¥400–1,200" : "¥600–1,800", lead: 150 };
      case "bus": return { door: Math.round(45 + (road / 60) * 60 + 30), ride: Math.round((road / 60) * 60), cost: "¥" + r10(road * 0.35) + "–" + r10(road * 0.5), lead: 45 };
      case "car": return { door: Math.round((road / 75) * 60 + 20), ride: Math.round((road / 75) * 60), cost: "¥" + r10(road * 3) + "–" + r10(road * 4.5) + " per car", lead: 0 };
      case "boat": return { door: Math.round(60 + (boat ? boat.min : (d / 30) * 60) + 30), ride: boat ? boat.min : Math.round((d / 30) * 60), cost: boat ? boat.cost : "varies", lead: 60 };
      default: return { door: Math.round(75 + ((d * 1.25) / 220) * 60 + 40), ride: Math.round(((d * 1.25) / 220) * 60), cost: "¥" + r10(d * 1.25 * 0.42) + "–" + r10(d * 1.25 * 0.5) + " (2nd class)", lead: 75 };
    }
  }
  const dur = (m) => (m < 90 ? m + " min" : (Math.round(m / 30) / 2).toString().replace(".5", "½") + " h");

  // Advice text for a chosen mode
  function modeText(mode, a, b) {
    if (mode === curatedMode(a, b)) return routeText(a, b);
    const A = CITIES[a], B = CITIES[b], e = modeEstimate(mode, a, b), cross = crossesBorder(a, b);
    const ap = (id) => (SYD_FLIGHTS[id] ? SYD_FLIGHTS[id].airport : CITIES[id].name + " airport");
    switch (mode) {
      case "flight": return `Flight ${ap(a)} → ${ap(b)}: about ${dur(e.ride)} in the air, around ${dur(e.door)} door to door with airport time, approx. ${e.cost} economy. Book on Trip.com; check the baggage allowance on budget fares.`;
      case "bus": return `Long-distance coach ${A.name} → ${B.name}: about ${dur(e.ride)}, approx. ${e.cost}. Buy at the bus station or on Trip.com with your passport. Slower and less comfortable than the train${cross ? "; cross-border coaches stop at the border for immigration" : ""}.`;
      case "car": return `Private car with driver ${A.name} → ${B.name}: about ${dur(e.ride)}, approx. ${e.cost} plus tolls. Book through your hotel or Trip.com (DiDi works for shorter trips). Tourists can't drive themselves in mainland China on an international licence${cross ? "; crossing the border needs a licensed cross-border car" : ""}.`;
      case "boat": return (BOATS[pairKey(a, b)] || {}).text || "Ferry: check schedules locally.";
      default: return `High-speed train ${A.name} → ${B.name}: about ${dur(e.ride)} on the train (there may be a change), approx. ${e.cost}. Book on 12306 or Trip.com with your passport; arrive 45–60 min early.${a === "mo" || b === "mo" ? " Macau has no high-speed rail station: trains run to Zhuhai, then you walk across the Gongbei–Border Gate crossing." : ""}`;
    }
  }
  // Everything the plan needs to know about one leg
  // chosen = the mode the traveller picked, or the planner's recommendation when "Recommend…" is ticked (auto)
  function legInfo(a, b) {
    const picked = chosenMode(a, b), rec = recommendedMode(a, b);
    const auto = !picked && !!state.optimise;
    const use = picked || (auto ? rec : null);
    return { chosen: use, auto, mode: use || "unset", assumed: legMode(a, b), rec, reason: auto ? recReason(rec, a, b) : null, text: use ? modeText(use, a, b) : null, options: modesFor(a, b) };
  }

  // Stops in travel order, including arrival/departure airports that aren't stops
  function routeSequence(plan) {
    const ids = state.stops.map((s) => s.city);
    const seq = [];
    if (plan.arriveId !== ids[0]) seq.push({ id: plan.arriveId, air: true });
    state.stops.forEach((s, i) => seq.push({ id: s.city, n: i + 1, nights: s.nights }));
    if (plan.departId !== ids[ids.length - 1]) seq.push({ id: plan.departId, air: true });
    return seq;
  }

  function routeMapSVG(plan) {
    const W = MAP_GEO.w, H = MAP_GEO.h;
    const seq = routeSequence(plan);
    const places = {};
    seq.forEach((p) => {
      const q = places[p.id] || (places[p.id] = { id: p.id, xy: mp(CITIES[p.id].stay.ll), nums: [], nights: 0, air: false });
      if (p.n) { q.nums.push(p.n); q.nights += p.nights; } else q.air = true;
    });
    const P = Object.keys(places).map((k) => places[k]);
    const legs = [];
    for (let i = 1; i < seq.length; i++) if (seq[i].id !== seq[i - 1].id) legs.push({ a: places[seq[i - 1].id], b: places[seq[i].id], mode: legInfo(seq[i - 1].id, seq[i].id).mode });
    const modes = {};
    legs.forEach((l) => (modes[l.mode] = 1));

    const legSVG = (l, z) => {
      const [x1, y1] = l.a.xy, [x2, y2] = l.b.xy;
      if (l.mode === "flight") {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        return `<path class="leg ${MODE[l.mode].cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}Q${(mx - dy * 0.18).toFixed(1)} ${(my + dx * 0.18).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
      }
      return `<path class="leg ${MODE[l.mode].cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    };

    // Flights to and from Sydney come in from off the map
    let sydSVG = "";
    if (fromSyd()) {
      const S = mp(SYD_LL);
      const entry = (to) => { for (let t = 0; t <= 1; t += 0.005) { const x = S[0] + (to[0] - S[0]) * t, y = S[1] + (to[1] - S[1]) * t; if (x > 14 && x < W - 14 && y > 14 && y < H - 14) return [x, y]; } return to; };
      const a = places[plan.arriveId], d = places[plan.departId];
      const ea = entry(a.xy);
      sydSVG += `<path class="leg leg-flight leg-intl" d="M${ea[0].toFixed(1)} ${ea[1].toFixed(1)}L${a.xy[0].toFixed(1)} ${a.xy[1].toFixed(1)}"/>`;
      let lbl = a === d ? "✈ to/from Sydney" : "✈ from Sydney";
      sydSVG += `<text class="map-intl" x="${(ea[0] - 6).toFixed(1)}" y="${(ea[1] - 8).toFixed(1)}" text-anchor="end">${lbl}</text>`;
      if (a !== d) {
        const ed = entry(d.xy);
        sydSVG += `<path class="leg leg-flight leg-intl" d="M${d.xy[0].toFixed(1)} ${d.xy[1].toFixed(1)}L${ed[0].toFixed(1)} ${ed[1].toFixed(1)}"/>`;
        sydSVG += `<text class="map-intl" x="${(ed[0] - 6).toFixed(1)}" y="${(ed[1] + 16).toFixed(1)}" text-anchor="end">✈ to Sydney</text>`;
      }
    }

    // Group stops that are too close to label separately; each group gets a zoomed inset
    const near = 46;
    const groups = [];
    P.forEach((p) => {
      const g = groups.find((gr) => gr.some((q) => Math.hypot(q.xy[0] - p.xy[0], q.xy[1] - p.xy[1]) < near));
      if (g) g.push(p); else groups.push([p]);
    });
    // merge groups that now touch
    for (let i = 0; i < groups.length; i++) for (let j = groups.length - 1; j > i; j--)
      if (groups[i].some((p) => groups[j].some((q) => Math.hypot(q.xy[0] - p.xy[0], q.xy[1] - p.xy[1]) < near))) { groups[i] = groups[i].concat(groups[j]); groups.splice(j, 1); }
    const IW = 300, IH = 225;
    const corners = [[W - IW - 10, H - IH - 10], [W - IW - 10, 10], [10, H - IH - 10], [10, 10]];
    const used = [];
    const insets = [];
    groups.filter((g) => g.length > 1).slice(0, 3).forEach((g) => {
      const xs = g.map((p) => p.xy[0]), ys = g.map((p) => p.xy[1]);
      const cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
      // nearest free corner that doesn't cover any stop
      const c = corners.filter((cn) => !used.includes(cn) && !P.some((p) => p.xy[0] > cn[0] - 15 && p.xy[0] < cn[0] + IW + 15 && p.xy[1] > cn[1] - 15 && p.xy[1] < cn[1] + IH + 15))
        .sort((m, n) => Math.hypot(m[0] + IW / 2 - cx, m[1] + IH / 2 - cy) - Math.hypot(n[0] + IW / 2 - cx, n[1] + IH / 2 - cy))[0];
      if (!c) return;
      used.push(c);
      let vw = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), (Math.max.apply(null, ys) - Math.min.apply(null, ys)) * IW / IH) + 46;
      vw = Math.max(vw, 60);
      const vh = vw * IH / IW;
      insets.push({ g, frame: c, view: [cx - vw / 2, cy - vh / 2, vw, vh], z: IW / vw, c: [cx, cy] });
      g.forEach((p) => (p.inInset = true));
    });

    // Labels, placed to avoid each other and the markers
    const label = (p) => `${CITIES[p.id].name}${p.nights ? " · " + p.nights + "N" : ""}${p.air && !p.nums.length ? " ✈" : ""}`;
    const placeLabels = (pts, z, bounds) => {
      const boxes = pts.map((p) => [p.xy[0] - 11 / z, p.xy[1] - 11 / z, 22 / z, 22 / z]);
      const hit = (b) => boxes.some((o) => b[0] < o[0] + o[2] && b[0] + b[2] > o[0] && b[1] < o[1] + o[3] && b[1] + b[3] > o[1]) ||
        b[0] < bounds[0] || b[1] < bounds[1] || b[0] + b[2] > bounds[0] + bounds[2] || b[1] + b[3] > bounds[1] + bounds[3];
      return pts.map((p) => {
        const t = label(p), w = (t.length * 7.4 + 6) / z, h = 16 / z, [x, y] = p.xy, o = 14 / z;
        const cand = [[x + o, y - h / 2, "start", x + o, y + 5 / z], [x - o - w, y - h / 2, "end", x - o, y + 5 / z],
          [x - w / 2, y - o - h, "middle", x, y - o - 3 / z], [x - w / 2, y + o, "middle", x, y + o + 12 / z]];
        const pick = cand.find((cd) => !hit([cd[0], cd[1], w, h])) || cand[0];
        boxes.push([pick[0], pick[1], w, h]);
        return `<text class="map-label" x="${pick[3].toFixed(1)}" y="${pick[4].toFixed(1)}" text-anchor="${pick[2]}" style="font-size:${(13 / z).toFixed(2)}px;stroke-width:${(3.5 / z).toFixed(2)}px">${esc(t)}</text>`;
      }).join("");
    };
    const marker = (p, z) => {
      const r = (p.nums.length > 1 ? 12 : 10) / z, [x, y] = p.xy;
      if (!p.nums.length) return `<circle class="map-air" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(6 / z).toFixed(2)}" style="stroke-width:${(2 / z).toFixed(2)}px"/>`;
      return `<circle class="map-stop" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" style="stroke-width:${(2 / z).toFixed(2)}px"/><text class="map-num" x="${x.toFixed(1)}" y="${(y + 4 / z).toFixed(1)}" style="font-size:${((p.nums.length > 1 ? 9 : 11) / z).toFixed(2)}px">${p.nums.join("·")}</text>`;
    };
    const base = `<path class="map-land" d="${MAP_GEO.land}"/><path class="map-border" d="${MAP_GEO.borders}"/>`;
    const seas = [["Yellow Sea", 34.5, 123.2], ["East China Sea", 28.5, 125.5], ["South China Sea", 17.6, 114.5]]
      .map(([t, la, lo]) => { const [x, y] = mp([la, lo]); return `<text class="map-sea" x="${x.toFixed(0)}" y="${y.toFixed(0)}">${t}</text>`; }).join("");
    const china = (() => { const [x, y] = mp([37.5, 97]); return `<text class="map-country" x="${x.toFixed(0)}" y="${y.toFixed(0)}">CHINA</text>`; })();

    let svg = `<svg class="tripmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of your route through ${esc(P.map((p) => CITIES[p.id].name).join(", "))}">
      <rect class="map-sea-bg" width="${W}" height="${H}"/>${base}${seas}${china}
      <g>${legs.map((l) => legSVG(l, 1)).join("")}</g>${sydSVG}
      ${P.map((p) => marker(p, 1)).join("")}
      ${placeLabels(P.filter((p) => !p.inInset), 1, [0, 0, W, H])}`;
    insets.forEach((ins) => {
      const [fx, fy] = ins.frame, [vx, vy, vw, vh] = ins.view;
      // leader line from the cluster to its inset
      const tx = Math.max(fx, Math.min(fx + IW, ins.c[0])), ty = Math.max(fy, Math.min(fy + IH, ins.c[1]));
      svg += `<path class="map-leader" d="M${ins.c[0].toFixed(1)} ${ins.c[1].toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}"/><circle class="map-zoomring" cx="${ins.c[0].toFixed(1)}" cy="${ins.c[1].toFixed(1)}" r="${Math.max(18, vw / 2).toFixed(1)}"/>
        <rect class="map-inset-frame" x="${fx}" y="${fy}" width="${IW}" height="${IH}" rx="6"/>
        <svg x="${fx}" y="${fy}" width="${IW}" height="${IH}" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}">
          <rect class="map-sea-bg" x="${vx}" y="${vy}" width="${vw}" height="${vh}"/>${base}
          ${legs.map((l) => legSVG(l, ins.z)).join("")}
          ${P.map((p) => marker(p, ins.z)).join("")}
          ${placeLabels(ins.g, ins.z, [vx, vy, vw, vh])}
        </svg>
        <rect class="map-inset-border" x="${fx}" y="${fy}" width="${IW}" height="${IH}" rx="6"/>
        <text class="map-inset-title" x="${fx + 8}" y="${fy + 18}">Zoomed in</text>`;
    });
    svg += `</svg>`;
    const legend = Object.keys(modes).concat(fromSyd() ? ["intl"] : []).map((m) => m === "intl"
      ? `<span><svg width="34" height="10" aria-hidden="true"><path class="leg leg-flight leg-intl" d="M2 5H32"/></svg>Flight to/from Sydney</span>`
      : `<span><svg width="34" height="10" aria-hidden="true"><path class="leg ${MODE[m].cls}" d="M2 5H32"/></svg>${MODE[m].label}</span>`).join("");
    return { svg, legend, legs };
  }

  function googleTripLink(plan) {
    const pts = (fromSyd() ? ["Sydney, Australia"] : []).concat(routeSequence(plan).map((p) => CITIES[p.id].name + (CITIES[p.id].region === "mainland" ? ", China" : "")), fromSyd() ? ["Sydney, Australia"] : []);
    return "https://www.google.com/maps/dir/" + pts.map(encodeURIComponent).join("/");
  }
  function googleDayLink(day) {
    const hotel = stayLL(day.city);
    const pts = [hotel].concat(day.slots.filter((s) => s.type === "act").map((s) => s.p.ll), day.kind === "depart" ? [] : [hotel]);
    return pts.length > 1 ? "https://www.google.com/maps/dir/" + pts.map((ll) => ll[0] + "," + ll[1]).join("/") : "";
  }

  function mapPaneHTML(plan) {
    const dayBtns = plan.days.map((d, i) => `<button type="button" class="btn small" data-mapday="${i}">Day ${i + 1}</button>`).join("");
    return `<section class="panel">
        <h3>Your route on the map</h3>
        <div class="map-wrap">${plan.map.svg}</div>
        <div class="map-legend">${plan.map.legend}<span><svg width="22" height="22" aria-hidden="true"><circle class="map-stop" cx="11" cy="11" r="9"/><text class="map-num" x="11" y="15" style="font-size:11px">1</text></svg>Stop number</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Leg</th><th>How</th><th>Details</th></tr></thead><tbody>
          ${plan.map.legs.map((l) => `<tr><td><b>${esc(CITIES[l.a.id].name)} → ${esc(CITIES[l.b.id].name)}</b></td><td>${l.mode === "unset" ? `Not chosen<br><span class="hint">recommended: ${MODE[recommendedMode(l.a.id, l.b.id)].label}</span>` : MODE[l.mode].icon + " " + MODE[l.mode].label + (legInfo(l.a.id, l.b.id).auto ? '<br><span class="badge top">recommended</span>' : "")}</td><td>${l.mode === "unset" ? legOptionsHTML(l.a.id, l.b.id) : esc(modeText(l.mode, l.a.id, l.b.id))}</td></tr>`).join("")}
        </tbody></table></div>
        <p><a href="${googleTripLink(plan)}" target="_blank" rel="noopener">Open the whole route in Google Maps ↗</a></p>
      </section>
      <section class="panel lmap-wrap">
        <h3>Street map — every stop, day by day</h3>
        <p class="hint">Zoom in to see streets. Pick a day to see that day's stops in order (1 = morning). Use two fingers to move the map on a phone. Needs an internet connection.</p>
        <div class="daypick"><button type="button" class="btn small" data-mapday="all" aria-pressed="true">Whole trip</button>${dayBtns}</div>
        <div id="lmap" class="lmap" role="region" aria-label="Interactive map"></div>
        <p class="hint" id="lmapNote">Map data © OpenStreetMap contributors.</p>
      </section>`;
  }

  /* Interactive map: Leaflet from cdnjs, OpenStreetMap tiles. Loaded only when the Map tab opens. */
  let lmap = null, lmapLayer = null, lmapDay = "all";
  const DAY_COLORS = ["#B3302A", "#2B5C8A", "#1D7556", "#8C620E", "#6B3FA0", "#C2562D", "#2E7D8C", "#A0336B"];
  function ensureLeaflet(cb) {
    if (window.L) return cb();
    ensureLeaflet.q = (ensureLeaflet.q || []).concat(cb);
    if (ensureLeaflet.loading) return;
    ensureLeaflet.loading = true;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => { const q = ensureLeaflet.q; ensureLeaflet.q = []; q.forEach((f) => f()); };
    s.onerror = () => { ensureLeaflet.loading = false; const n = $("#lmapNote"); if (n) n.textContent = "The street map couldn't load — it needs an internet connection. The route map above works offline."; };
    document.head.appendChild(s);
  }
  function showStreetMap() {
    if (!$("#lmap") || !lastPlan) return;
    ensureLeaflet(() => {
      const el = $("#lmap");
      if (!el) return;
      if (!lmap || lmap.getContainer() !== el) {
        if (lmap) { try { lmap.remove(); } catch (e) { /* container already gone */ } }
        lmap = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false });
        let errors = 0;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" })
          .on("tileerror", () => { if (++errors === 4) { const n = $("#lmapNote"); if (n) n.textContent = "Map tiles aren't loading (no internet, or this viewer blocks them). The route map above works offline."; } })
          .addTo(lmap);
      }
      drawStreetMap(lmapDay);
      setTimeout(() => lmap && lmap.invalidateSize(), 50);
    });
  }
  function drawStreetMap(which) {
    if (!lmap || !lastPlan) return;
    lmapDay = which;
    document.querySelectorAll("[data-mapday]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mapday === String(which))));
    if (lmapLayer) lmapLayer.remove();
    lmapLayer = L.layerGroup().addTo(lmap);
    const pts = [];
    const pin = (ll, color, text, tip, big) => {
      pts.push(ll);
      L.marker(ll, { icon: L.divIcon({ className: "lpin", html: `<span style="background:${color}">${esc(text)}</span>`, iconSize: big ? [26, 26] : [22, 22], iconAnchor: big ? [13, 13] : [11, 11] }) })
        .bindTooltip(tip, { direction: "top", offset: [0, -10] }).addTo(lmapLayer);
    };
    if (which === "all") {
      const seq = routeSequence(lastPlan);
      L.polyline(seq.map((p) => CITIES[p.id].stay.ll), { color: "#B3302A", weight: 3, opacity: 0.85, dashArray: "6 6" }).addTo(lmapLayer);
      lastPlan.days.forEach((d, i) => d.slots.forEach((s) => {
        if (s.type !== "act") return;
        L.circleMarker(s.p.ll, { radius: 5, color: "#fff", weight: 1, fillColor: DAY_COLORS[i % DAY_COLORS.length], fillOpacity: 0.95 })
          .bindTooltip(`Day ${i + 1} · ${SLOT[s.part].label}: ${esc(s.p.n)}`).addTo(lmapLayer);
        pts.push(s.p.ll);
      }));
      seq.forEach((p) => pin(p.n ? stayLL(CITIES[p.id]) : CITIES[p.id].stay.ll, "#17202B", p.n ? String(p.n) : "✈", `${p.n ? p.n + ". " : ""}${esc(CITIES[p.id].name)}${p.nights ? " · " + p.nights + " nights" : " (airport)"}`, true));
    } else {
      const d = lastPlan.days[+which], color = DAY_COLORS[+which % DAY_COLORS.length];
      const hotel = stayLL(d.city);
      const acts = d.slots.filter((s) => s.type === "act");
      L.polyline([hotel].concat(acts.map((s) => s.p.ll), d.kind === "depart" ? [] : [hotel]), { color, weight: 4, opacity: 0.8 }).addTo(lmapLayer);
      pin(hotel, "#17202B", "H", `${userHotel(d.city) ? "Your hotel" : "Hotel area"}: ${esc(stayName(d.city))}`, true);
      acts.forEach((s, k) => pin(s.p.ll, color, String(k + 1), `${SLOT[s.part].label}: ${esc(s.p.n)}`));
      if (d.slots.some((s) => s.type === "travel")) {
        const t = d.slots.find((s) => s.type === "travel");
        pts.push(t.from.stay.ll);
        L.polyline([t.from.stay.ll, t.to.stay.ll], { color: "#555", weight: 2, dashArray: "4 6" }).addTo(lmapLayer);
      }
    }
    if (pts.length === 1) lmap.setView(pts[0], 13);
    else lmap.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  }

  /* ---------- print view: overview, 1 page per day, info, checklist, phrases ---------- */
  // First sentence of a text (avoids regex lookbehind, which Safari only supports from iOS 16.4)
  const firstSentence = (t) => { const str = String(t), i = str.search(/\.\s/); return i < 0 ? str : str.slice(0, i + 1); };
  const plain = (h) => String(h).replace(/<[^>]+>/g, "");

  function pvSlot(s, day) {
    const when = SLOT[s.part];
    let b = "";
    if (s.type === "act") {
      const p = s.p, eat = s.eat;
      const food = eat ? eat.located.map((h) => `${h.n} (${h.d < 1 ? Math.round(h.d * 1000) + " m" : h.d.toFixed(1) + " km"})`).concat(eat.general.map((h) => h.n)).slice(0, 2) : [];
      b = `<div class="pv-name">${esc(p.n)} <span class="han">${esc(p.zh || "")}</span> <span class="pv-why">${esc(s.why[1])}</span></div>
        <div><b>Getting there:</b> ${plain(s.how.text)}</div>
        <div>${esc(firstSentence(p.d))}</div>
        <div class="pv-meta">${esc(p.h)} · ${esc(p.c)}${p.m ? " · Metro: " + esc(p.m) : ""}</div>
        ${p.tip ? `<div><b>Tip:</b> ${esc(firstSentence(p.tip))}</div>` : ""}
        ${food.length || (eat && eat.far) ? `<div class="pv-halal"><b>${esc(eat.label)}:</b> ${food.length ? esc(food.join("; ")) : ""}${eat.far ? (food.length ? "; " : "") + "or any 清真 noodle shop" : ""}</div>` : ""}
        ${day.friday && (s.part === "m" || s.part === "full") ? `<div class="pv-halal"><b>Jumu'ah:</b> ${esc((day.city.mosques[0] || { n: "search 清真寺 in Amap" }).n)}</div>` : ""}
        ${s.alt ? `<div class="pv-meta">Or instead: ${esc(s.alt.n)}</div>` : ""}`;
    } else if (s.type === "arrive") {
      b = `<div class="pv-name">${s.via ? "Land in " + esc(s.city.name) : "Arrive & check in"}</div>${s.land != null ? `<div><b>${s.flightNo ? esc(s.flightNo) + " lands" : "Lands"} ${hhmm(s.land)}</b>${s.ready != null ? ` · at the hotel about ${hhmm(s.ready)}` : ""}</div>` : ""}${fromSyd() ? `<div>${plain(sydLine(s.flyIn, "in"))}</div>` : ""}<div>${esc(s.text)}</div>`;
    } else if (s.type === "travel") {
      b = `<div class="pv-name">${s.toFlight ? "To your flight" : "Travel"}: ${esc(s.from.name)} → ${esc(s.to.name)}</div>
        ${s.dep != null ? `<div><b>${s.est ? "Est. " : ""}departs ${hhmm(s.dep)} → arrives ${hhmm(s.arr)}</b>${s.leaveBy != null && !s.toFlight ? ` · leave hotel by ${hhmm(s.leaveBy)}` : ""}</div>` : ""}
        ${s.toFlight && s.leaveBy != null ? `<div><b>Leave ${esc(s.from.name)} by ${hhmm(s.leaveBy)}</b></div>` : ""}
        ${s.collect ? `<div>Collect bags from the hotel first.</div>` : ""}
        ${s.leg && s.leg.chosen ? `<div><b>${MODE[s.leg.chosen].label}:</b> ${esc(s.text)}</div>` : `<div><b>Mode not chosen.</b> Options: ${esc(modesFor(s.fromId, s.toId).map((m) => MODE[m].label + " ~" + dur(modeEstimate(m, s.fromId, s.toId).door) + ", " + modeEstimate(m, s.fromId, s.toId).cost).join(" · "))}</div>`}
        ${s.border ? `<div>Border crossing — passport ready.</div>` : ""}
        ${s.toFlight ? "" : `<div><b>On arrival:</b> ${esc(firstSentence(s.arrive))} Check in at ${esc(stayName(s.to))}.</div>`}`;
    } else if (s.type === "depart") {
      b = `<div class="pv-name">Departure</div>${s.off != null ? `<div><b>${s.flightNo ? esc(s.flightNo) + " takes off" : "Take-off"} ${hhmm(s.off)}</b> · at the airport by ${hhmm(s.off - INTL_BUFFER)}${s.leaveBy != null ? ` · leave hotel by ${hhmm(s.leaveBy)}` : ""}</div>` : ""}<div>${esc(s.text)}</div>${fromSyd() ? `<div>${plain(sydLine(s.flyOut, "out"))}</div>` : ""}`;
    } else if (s.type === "rest") {
      b = `<div class="pv-name">Free time & rest</div><div>Rest, pray, or revisit somewhere you liked.</div>`;
    } else if (s.type === "free") {
      b = `<div class="pv-name">Easy evening</div><div>${esc(s.text)}</div>`;
    }
    return `<tr><th><b>${when.label}</b><br>${esc(s.when || when.time)}</th><td>${b}</td></tr>`;
  }

  function buildPrintView(plan, c) {
    let pv = $("#printView");
    if (!pv) { pv = document.createElement("div"); pv.id = "printView"; pv.setAttribute("aria-hidden", "true"); document.body.appendChild(pv); }
    const pages = [];
    const head = (t, sub) => `<div class="pv-head"><span>China & Hong Kong Trip Planner</span><span>${esc(sub || "")}</span></div><h1>${t}</h1>`;
    const routeTxt = [fromSyd() ? "Sydney" : null, c.arrId !== c.ids[0] ? CITIES[c.arrId].name : null].filter(Boolean).concat(state.stops.map((s) => `${CITIES[s.city].name} (${s.nights}N)`), [c.depId !== c.ids[c.ids.length - 1] ? CITIES[c.depId].name : null, fromSyd() ? "Sydney" : null].filter(Boolean)).join(" → ");

    // 1. Overview
    pages.push(`${head(`${state.days}-day trip`, c.startD ? fmtDate(c.startD) + " – " + fmtDate(c.endD) : "")}
      <p class="pv-route">${esc(routeTxt)}</p>
      <p class="pv-meta">${esc(refreshLine())}</p>
      <ul class="pv-notes">${c.notes.filter((n) => n[1] !== "Example").map(([, t, h]) => `<li><b>${t}:</b> ${plain(h)}</li>`).join("")}</ul>
      <table class="pv-tbl"><thead><tr><th>Day</th><th>City</th><th>Plan</th></tr></thead><tbody>
      ${plan.days.map((d, i) => `<tr><td>${i + 1}${d.date ? "<br>" + fmtDate(d.date) : ""}</td><td>${esc(d.city.name)}</td><td>${esc(dayTitle(d))}</td></tr>`).join("")}
      </tbody></table>`);

    // 1b. Route map
    pages.push(`${head("Route map")}<div class="pv-map">${plan.map.svg}</div><div class="map-legend">${plan.map.legend}</div>
      <table class="pv-tbl"><thead><tr><th>Leg</th><th>How</th><th>Details</th></tr></thead><tbody>
      ${plan.map.legs.map((l) => `<tr><td><b>${esc(CITIES[l.a.id].name)} → ${esc(CITIES[l.b.id].name)}</b></td><td>${MODE[l.mode].label}</td><td>${l.mode === "unset" ? esc(modesFor(l.a.id, l.b.id).map((m) => MODE[m].label + " ~" + dur(modeEstimate(m, l.a.id, l.b.id).door)).join(" · ")) : esc(firstSentence(modeText(l.mode, l.a.id, l.b.id)))}</td></tr>`).join("")}
      </tbody></table>`);

    // 2. One page per day
    plan.days.forEach((d, i) => {
      const firstInCity = d.kind === "arrival" || d.kind === "transfer";
      const hotel = d.city.hotels.find((h) => h.tier === state.budget) || d.city.hotels[0];
      pages.push(`${head(`Day ${i + 1} · ${esc(d.city.name)} <span class="han">${d.city.zh}</span>`, (d.date ? fmtDate(d.date) + " · " : "") + (KIND[d.kind] || "Sightseeing"))}
        <p class="pv-sub">${esc(dayTitle(d))}</p>
        ${d.date ? `<p class="pv-meta">🌤 ${esc(wxPlain(d))}</p>` : ""}
        ${firstInCity ? `<p class="pv-stay"><b>Stay:</b> ${userHotel(d.city) ? esc(stayName(d.city)) + " (your hotel)" : esc(d.city.stay.area) + " — e.g. " + esc(hotel.n)}. <b>Halal near hotel:</b> ${esc(eatNear(d.city, stayLL(d.city), 2).located.map((h) => h.n).join("; ") || d.city.halalTip)}</p>` : ""}
        <table class="pv-tl"><tbody>${timelineFor(d, i).map((x) => `<tr class="k-${x.k}"><td class="pv-t">${hhmm(x.start)}${x.end > x.start ? "–" + hhmm(x.end) : ""}</td><td>${x.icon || TL_ICON[x.k] || ""} <b>${esc(x.title)}</b>${x.note ? ` <span class="pv-meta">— ${esc(x.note)}</span>` : ""}</td></tr>`).join("")}</tbody></table>
        <h2>Details & directions</h2>
        <table class="pv-day"><tbody>${d.slots.filter((s) => s.type !== "act" || !isEdited(d, i) || timelineFor(d, i).some((x) => x.pid === s.p.id)).map((s) => pvSlot(s, d)).join("")}</tbody></table>
        ${d.back && d.kind !== "depart" ? `<p class="pv-meta"><b>Back to the hotel:</b> ${plain(d.back.text)}</p>` : ""}`);
    });

    // 3. Key information
    const uniq = c.ids.filter((v, i, a) => a.indexOf(v) === i);
    const T = { lux: "Lux", mid: "Mid", budget: "Budget" };
    pages.push(`${head("Key information")}
      <div class="pv-cols">
        ${uniq.map((id) => { const ct = CITIES[id]; return `<section><h2>${esc(ct.name)} <span class="han">${ct.zh}</span></h2>
          <p><b>Stay:</b> ${userHotel(ct) ? esc(stayName(ct)) + " (your hotel)" : esc(ct.stay.area)}</p>
          <p><b>Hotels:</b> ${ct.hotels.map((h) => `${esc(h.n)} (${T[h.tier]})`).join("; ")}</p>
          <p><b>Halal:</b> ${ct.halal.map((h) => esc(h.n)).join("; ")}</p>
          ${ct.mosques.length ? `<p><b>Mosque:</b> ${ct.mosques.map((m) => esc(m.n)).join("; ")}</p>` : ""}
          <p><b>Getting around:</b> ${esc(firstSentence(ct.getAround))}</p>
          ${(() => { const sg = citySegments(plan).filter((x) => x.cid === id).map(segWeather).filter(Boolean)[0]; return sg ? `<p><b>Weather on your dates:</b> about ${deg(sg.hi)} by day, ${deg(sg.lo)} at night, ${rainWords(sg.rain)}. <b>Pack:</b> ${esc(sg.pack.slice(0, 4).join(", "))}.</p>` : ""; })()}</section>`; }).join("")}
        <section><h2>Visa & entry</h2>
          ${isAU() ? `<p>Australian passport: visa-free up to 30 days per mainland entry (to 31 Dec 2026); Hong Kong 90 days; Macau visa-free. Passport valid 6+ months. Fill in the arrival card on landing; carry your passport at all times.</p>`
            : `<p>Check visa-free entry or the 240-hour transit for your passport, otherwise apply for an L visa (COVA form at visaforchina.cn). Double/multiple entry if you visit Hong Kong/Macau mid-trip. Arrival card on landing; carry your passport.</p>`}</section>
        ${fromSyd() ? `<section><h2>Flights</h2><p><b>Out:</b> Sydney → ${esc(CITIES[c.arrId].name)}: ${esc(SYD_FLIGHTS[c.arrId] ? SYD_FLIGHTS[c.arrId].text : "")}</p><p><b>Home:</b> ${esc(CITIES[c.depId].name)} → Sydney: ${esc(SYD_FLIGHTS[c.depId] ? SYD_FLIGHTS[c.depId].text : "")}</p></section>` : ""}
        <section><h2>Emergencies</h2><p>Mainland: police 110, ambulance 120, fire 119. Hong Kong & Macau: 999.${isAU() ? " Australian Consular Emergency Centre (24 h): +61 2 6261 3305." : ""}</p></section>
        <section><h2>Money & internet</h2><p>Link a Visa/Mastercard to Alipay and WeChat Pay before leaving (no fee up to ¥200, then 3%). Carry ¥500–1,000 cash. Google, WhatsApp and Instagram are blocked in the mainland — use a roaming eSIM.</p></section>
        <section><h2>Apps</h2><p>Alipay, WeChat, Apple Maps or Amap, DiDi, Trip.com, Railway 12306, Dianping (search 清真), a translator with offline Chinese, Muslim Pro, travel eSIM${c.hasHK ? ", MTR Mobile, Octopus" : ""}.</p></section>
        <section><h2>Insurance</h2><p>Medical + evacuation cover; check adventure activities are included.${isAU() ? " Medicare does not cover you in China or Hong Kong." : ""}</p></section>
        <section><h2>Tips</h2><p>Book top museums ~7 days ahead with your passport number; most close Mondays. Arrive at stations 45–60 min early. Avoid Golden Week (1–7 Oct) and Chinese New Year. Don't drink tap water. Carry tissues. Look for the green 清真 sign. Beware the 'tea house' scam.</p></section>
      </div>`);

    // 4. Checklist
    pages.push(`${head("Pre-departure checklist")}<ul class="pv-check">${checklistItems().map((t) => `<li>☐ ${esc(t)}</li>`).join("")}</ul>
      <h2>Bookings</h2><table class="pv-tbl pv-blank"><thead><tr><th>What</th><th>Date</th><th>Reference</th></tr></thead><tbody>${"<tr><td>&nbsp;</td><td></td><td></td></tr>".repeat(8)}</tbody></table>`);

    // 5. Phrases
    const rows = PHRASES.reduce((acc, [t, r]) => acc.concat([[t]], r), []);
    pages.push(`${head("Phrases")}
      <div class="pv-card"><span class="han">${HALAL_CARD}</span><br><span class="pv-meta">I am Muslim and only eat halal food. Please don't use pork, lard, pork-bone broth, alcohol or cooking wine. If this dish is not halal, please tell me. Thank you!</span></div>
      ${phraseTables(rows.concat(c.hasHK || c.hasMO ? [["Cantonese (Hong Kong & Macau)"]].concat(CANTONESE.map(([en, zh, , sl]) => [en, zh, sl])) : []))}`);

    pv.innerHTML = pages.map((p) => `<section class="pv-page">${p}</section>`).join("");
    addAUD(pv);
    fitPrintPages();
  }

  // Two side-by-side tables, split at a section heading near the middle
  function phraseTables(rows) {
    let cut = Math.ceil(rows.length / 2);
    while (cut < rows.length && rows[cut].length !== 1) cut++;
    const tbl = (rs) => `<table class="pv-tbl pv-phr"><tbody>${rs.map((r) => r.length === 1 ? `<tr><th colspan="3">${esc(r[0])}</th></tr>` : `<tr><td>${esc(r[0])}</td><td class="han">${r[1]}</td><td><i>${esc(r[2])}</i></td></tr>`).join("")}</tbody></table>`;
    return `<div class="pv-split">${tbl(rows.slice(0, cut))}${tbl(rows.slice(cut))}</div>`;
  }

  // Shrink each printed page's text until it fits on one A4 page (190 × 277 mm printable area)
  function fitPrintPages() {
    const pv = $("#printView");
    if (!pv) return;
    pv.classList.add("measuring");
    const limit = 272 * 3.7795; // mm → CSS px, with a small safety margin
    pv.querySelectorAll(".pv-page").forEach((pg) => {
      let size = 11;
      pg.style.fontSize = size + "pt";
      while (pg.scrollHeight > limit && size > 5.5) { size -= 0.25; pg.style.fontSize = size + "pt"; }
    });
    pv.classList.remove("measuring");
  }

  // Print, and never fail silently: if no print window opens, explain why and offer alternatives
  function doPrint() {
    fitPrintPages();
    if (window.NO_PRINT) { showPrintHelp("blocked"); return; }
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    if (standalone) { showPrintHelp("standalone"); return; }
    let opened = false;
    const mark = () => { opened = true; };
    window.addEventListener("beforeprint", mark);
    try { window.print(); } catch (e) { /* print unavailable */ }
    setTimeout(() => { window.removeEventListener("beforeprint", mark); if (!opened) showPrintHelp("nodialog"); }, 1500);
  }

  const WEB_URL = "https://faraz-yarkhan.github.io/China/";
  function showPrintHelp(reason) {
    const msg = {
      blocked: `<b>Printing is switched off inside the Claude preview.</b> Open the planner at <a href="${WEB_URL}">faraz-yarkhan.github.io/China</a> (or the downloaded HTML file on a computer) and press Print there.`,
      standalone: `<b>iPhone doesn't allow printing from a Home Screen app.</b> Open <a href="${WEB_URL}">faraz-yarkhan.github.io/China</a> in Safari, then press Print — or tap <b>Show print layout</b> below and use Share → Print.`,
      nodialog: `<b>No print window opened?</b> Some browsers block it, especially inside apps like WhatsApp, Gmail or Outlook.
        <ul><li><b>iPhone / iPad (Safari):</b> tap Share <span aria-hidden="true">⬆</span> → <b>Print</b>. To save a PDF, pinch outwards on the preview, then Share → Save to Files.</li>
        <li><b>Android (Chrome):</b> ⋮ menu → Share → <b>Print</b>.</li>
        <li><b>Inside another app:</b> open the page in Safari or Chrome first (⋯ → Open in browser).</li></ul>
        Tap <b>Show print layout</b> first so the browser prints the compact version.`,
    }[reason];
    let el = $("#printHelp");
    if (!el) { el = document.createElement("div"); el.id = "printHelp"; el.className = "printhelp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Printing help"); document.body.appendChild(el); }
    el.innerHTML = `<div class="printhelp-card"><div>${msg}</div>
      <div class="actions"><button type="button" class="btn print-btn" data-pvscreen>Show print layout</button>${window.NO_PRINT ? "" : '<button type="button" class="btn" data-save>⬇ Save offline copy</button>'}<button type="button" class="btn" data-closehelp>Close</button></div></div>`;
    el.hidden = false;
    const first = el.querySelector("[data-pvscreen]");
    if (first) first.focus();
  }

  // Show the compact print pages on screen, so the browser's own Print / Share menu prints them
  function showPrintLayout(on) {
    // Measure the screen before the wide A4 pages appear (they would stretch a phone's layout width)
    const w = Math.min(document.documentElement.clientWidth || window.innerWidth, window.screen && window.screen.width ? window.screen.width : Infinity);
    document.body.classList.toggle("pv-screen", on);
    let bar = $("#pvBar");
    if (on && !bar) {
      bar = document.createElement("div"); bar.id = "pvBar"; bar.className = "pvbar";
      bar.innerHTML = `<button type="button" class="btn" data-pvexit>← Back to planner</button><span class="hint">Print layout — use your browser's Print or Share → Print</span><button type="button" class="btn print-btn" data-pvprint>Print</button>`;
      document.body.insertBefore(bar, document.body.firstChild);
    }
    if (bar) bar.hidden = !on;
    const pv = $("#printView");
    // A4 page = 190 mm content + 2 × 10 mm padding
    if (pv) pv.style.zoom = on ? String(Math.min(1, (w - 16) / (210 * 3.7795 + 6)).toFixed(3)) : "";
    window.scrollTo(0, 0);
  }

  /* Save the current plan as a script-free HTML file: it opens in any iPhone preview
     (Files, Mail, WhatsApp) and works offline, including where claude.ai is blocked. */
  function saveOffline() {
    if (!lastPlan) return;
    if (window.NO_PRINT) { toast("Saving files is blocked inside this preview. Use the standalone HTML file or the GitHub Pages version to save an offline copy."); return; }
    if (editingDay != null) { const d = editingDay; editingDay = null; refreshDay(d); }
    const out = $("#out").cloneNode(true);
    out.querySelectorAll("[data-tledit]").forEach((n) => n.parentNode.removeChild(n));
    out.querySelectorAll(".tabs, .actions, .ask, script, .maplinks, .lmap-wrap, .map-legend .btn").forEach((n) => n.parentNode.removeChild(n));
    out.querySelectorAll("[hidden]").forEach((n) => n.removeAttribute("hidden"));
    out.querySelectorAll("input[type=checkbox]").forEach((n) => { if (n.checked) n.setAttribute("checked", ""); n.setAttribute("disabled", ""); });
    out.removeAttribute("id");
    const pv = $("#printView") ? $("#printView").outerHTML : "";
    const css = Array.prototype.map.call(document.querySelectorAll("style"), (st) => st.textContent).join("\n");
    const ids = state.stops.map((x) => CITIES[x.city].name).filter((v, i, a) => a.indexOf(v) === i);
    const title = `China trip · ${state.days} days · ${ids.join(", ")}`;
    const saved = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)}</title>
<style>${css}
.static-wrap { display: block; max-width: 900px; margin: 0 auto; }
.static-wrap .print-only { display: block; font-family: var(--display); font-size: 24px; margin: 24px 0 4px; padding-bottom: 4px; border-bottom: 3px solid var(--seal); }
.static-wrap .out { display: grid; gap: 16px; }
</style></head><body>
<header class="mast"><div><h1>${esc(title)}</h1><p>Saved ${esc(saved)} from the China & Hong Kong Trip Planner. This copy works offline and in any phone preview.</p></div></header>
<main class="static-wrap"><div class="out">${out.innerHTML}</div></main>
${pv}
</body></html>`;
    const name = `China trip itinerary (${state.days} days).html`;
    try { deliverFile(new Blob([doc], { type: "text/html" }), name, "Offline copy", "Opens in any browser or phone preview, no internet needed."); }
    catch (e) { toast("Couldn't make the file in this browser. Try Copy itinerary as text instead."); }
  }

  /* Hand a finished file to the traveller. Downloads started by code are blocked on many phones
     (Android in-app browsers, iOS), so show a box with a real link and a Share button they tap themselves. */
  let lastFileURL = null;
  function deliverFile(blob, name, label, hint) {
    if (lastFileURL) { try { URL.revokeObjectURL(lastFileURL); } catch (e) { /* ignore */ } }
    const url = (lastFileURL = URL.createObjectURL(blob));
    let file = null;
    try { file = new File([blob], name, { type: blob.type }); } catch (e) { file = null; }
    const canShare = !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    let el = $("#fileReady");
    if (!el) { el = document.createElement("div"); el.id = "fileReady"; el.className = "printhelp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Your file is ready"); document.body.appendChild(el); }
    const sizeKB = Math.max(1, Math.round(blob.size / 1024));
    el.innerHTML = `<div class="printhelp-card"><div><b>${esc(label)} ready</b> · ${esc(name)} (${sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + " MB" : sizeKB + " KB"})<br><span class="hint">${esc(hint || "")}</span></div>
      <div class="actions">
        <a class="btn print-btn" href="${url}" download="${esc(name)}" data-filedl>⬇ Download</a>
        ${canShare ? '<button type="button" class="btn" data-fileshare>↗ Share or save to Files / Drive</button>' : ""}
        <a class="btn" href="${url}" target="_blank" rel="noopener">Open</a>
        <button type="button" class="btn" data-fileclose>Close</button>
      </div>
      <ul class="hint filetips">
        <li><b>iPhone:</b> tap Download, then the ⬇ in Safari's address bar → the file → Share → Save to Files.${canShare ? " Or tap Share." : ""}</li>
        <li><b>Android:</b> tap Download — it goes to your Downloads folder (Files app).${canShare ? " Or tap Share to send it to Drive, WhatsApp or email." : ""}</li>
        <li><b>Inside WhatsApp, Gmail or other apps:</b> if nothing happens, open this page in Chrome or Safari first.</li>
      </ul></div>`;
    el.hidden = false;
    el._file = file;
    const dl = el.querySelector("[data-filedl]");
    if (dl) dl.focus();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-fileclose]")) { const el = $("#fileReady"); if (el) el.hidden = true; }
    if (e.target.closest("[data-fileshare]")) {
      const el = $("#fileReady");
      if (el && el._file) navigator.share({ files: [el._file], title: el._file.name }).catch((err) => { if (err && err.name !== "AbortError") toast("Sharing didn't work here — use Download instead."); });
    }
  });

  /* ---------- PDF: the compact print layout, rendered page by page (html2canvas + jsPDF from cdnjs) ---------- */
  const PDF_LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
      const sc = document.createElement("script"); sc.src = src; sc.onload = () => res(); sc.onerror = () => rej(new Error("load " + src));
      document.head.appendChild(sc);
    });
  }
  let pdfBusy = false;
  // A copy of the on-screen itinerary (all tabs, light theme) laid out off-screen for capture
  function buildPdfView() {
    const old = $("#pdfView");
    if (old) old.parentNode.removeChild(old);
    const holder = document.createElement("div");
    holder.id = "pdfView";
    const ids = state.stops.map((x) => CITIES[x.city].name).filter((v, i, a) => a.indexOf(v) === i);
    holder.innerHTML = `<header class="mast"><div><h1>China & Hong Kong Trip Planner <span class="han">中国 · 香港</span></h1><p>${esc(state.days)}-day trip · ${esc(ids.join(", "))} · ${esc(refreshLine())}</p></div></header>`;
    const clone = $("#out").cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll(".tabs, .actions, .ask, .maplinks, .lmap-wrap, [data-tledit], .map-legend .btn, .tl-edit, .opts-more summary, script").forEach((n) => n.parentNode.removeChild(n));
    clone.querySelectorAll("[role=tabpanel][hidden]").forEach((n) => n.removeAttribute("hidden"));
    clone.querySelectorAll("details").forEach((n) => n.setAttribute("open", ""));
    holder.appendChild(clone);
    document.body.appendChild(holder);
    // The blocks to place on pages, in reading order; headings stay with what follows
    const blocks = [holder.querySelector(".mast")];
    Array.prototype.forEach.call(clone.children, (el) => {
      if (el.getAttribute("role") === "tabpanel" || el.id === "glanceBox") Array.prototype.forEach.call(el.children, (k) => { if (k.id === "glanceBox") blocks.push(k.firstElementChild); else blocks.push(k); });
      else blocks.push(el);
    });
    return { holder, blocks: blocks.filter((b) => b && b.offsetHeight > 0) };
  }

  // Find a row near `y` (canvas pixels) that is plain background, so a long card is split between lines of text
  function quietRow(canvas, y, lookBack) {
    const ctx = canvas.getContext("2d"), w = canvas.width;
    for (let r = Math.floor(y); r > y - lookBack && r > 0; r--) {
      const row = ctx.getImageData(0, r, w, 1).data;
      let busy = 0;
      for (let x = 8; x < w - 8; x += 6) {
        const k = x * 4, a = row[k], g = row[k + 1], bl = row[k + 2];
        const ref = row[32];
        if (Math.abs(a - ref) + Math.abs(g - row[33]) + Math.abs(bl - row[34]) > 24) { if (++busy > 2) break; }
      }
      if (busy <= 2) return r;
    }
    return Math.floor(y);
  }

  async function makePDF() {
    if (pdfBusy) return;
    if (window.NO_PRINT) { showPrintHelp("blocked"); return; }
    if (!lastPlan) return;
    pdfBusy = true;
    let view = null;
    try {
      toast("Making your PDF… (needs internet the first time)");
      for (const src of PDF_LIBS) await loadScript(src);
      if (!window.html2canvas || !window.jspdf) throw new Error("libs");
      if (editingDay != null) { const d = editingDay; editingDay = null; refreshDay(d); }
      view = buildPdfView();
      const SCALE = 1.35, PAPER = [243, 244, 242], Q = 0.78;
      const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      const M = 10, PW = 210 - 2 * M, PH = 297 - 2 * M;           // printable area in mm
      const pxToMm = PW / view.holder.querySelector(".mast").offsetWidth; // page width = the view's width
      const paint = () => { pdf.setFillColor(PAPER[0], PAPER[1], PAPER[2]); pdf.rect(0, 0, 210, 297, "F"); };
      paint();
      let y = M, pages = 1;
      const newPage = () => { pdf.addPage(); paint(); y = M; pages++; };
      // 1. Find where each section may break: between its parts, never through a line of text.
      //    A section is drawn once; tall ones are cut into slices at the tops of their parts.
      const host = view.holder.getBoundingClientRect();
      const slices = [];
      view.blocks.forEach((b, bi) => {
        const leaves = [];
        const expand = (el) => {
          if (el.offsetHeight * pxToMm > PH && el.children.length > 1) Array.prototype.forEach.call(el.children, (k) => { if (k.offsetHeight > 0) expand(k); });
          else leaves.push(el);
        };
        expand(b);
        const br = b.getBoundingClientRect();
        leaves.forEach((el, n) => {
          const top = n === 0 ? 0 : el.getBoundingClientRect().top - br.top;
          const next = leaves[n + 1] ? leaves[n + 1].getBoundingClientRect().top - br.top : br.height;
          if (next - top > 0.5) slices.push({ bi, el, top, bottom: next, last: n === leaves.length - 1 });
        });
      });
      const cls = (el, c) => el.classList && el.classList.contains(c);
      const isSection = (el) => el.tagName === "H2" && cls(el, "print-only");
      const isCity = (el) => cls(el, "city-band");
      const keepsWithNext = (el) => isSection(el) || isCity(el) || cls(el, "city-stay") || /^H[1-6]$/.test(el.tagName) || cls(el, "day-num") || cls(el, "day-title") || cls(el, "details-h") || cls(el, "wx") || cls(el, "tl-head") || cls(el, "slot-when");
      // 2. Draw each section once
      const drawn = [];
      for (let bi = 0; bi < view.blocks.length; bi++) {
        toast(`Making your PDF… ${Math.round((bi / view.blocks.length) * 100)}%`);
        drawn.push(await window.html2canvas(view.blocks[bi], { scale: SCALE, backgroundColor: "rgb(" + PAPER.join(",") + ")", useCORS: true, logging: false, windowWidth: 1300 }));
      }
      const hOf = (k) => (slices[k].bottom - slices[k].top) * pxToMm;
      // 3. Place slices: sections and cities start a new page; nothing splits mid-text; headings stay with what follows
      let atTop = true, prevSection = false;
      for (let k = 0; k < slices.length; k++) {
        const sl = slices[k], el = sl.el, block = view.blocks[sl.bi], src = drawn[sl.bi];
        const br = block.getBoundingClientRect();
        const xMm = M + (br.left - host.left) * pxToMm, wMm = br.width * pxToMm, hMm = hOf(k);
        if ((isSection(el) || (isCity(el) && !prevSection)) && !atTop) { newPage(); atTop = true; }
        else {
          let need = hMm, j = k + 1;
          // don't strand a short closing line (e.g. "Back to the hotel") on its own page
          if (slices[k + 1] && slices[k + 1].bi === sl.bi && slices[k + 1].last && hOf(k + 1) < 22) need += hOf(k + 1);
          if (keepsWithNext(el)) {
            while (j < slices.length && keepsWithNext(slices[j].el) && !isSection(slices[j].el) && !isCity(slices[j].el)) { need += hOf(j); j++; }
            // pieces can't be split, so reserve the whole next piece (unless it's taller than a page anyway)
            if (j < slices.length) need += hOf(j) <= PH ? hOf(j) : 50;
          }
          if (!atTop && need > M + PH - y) { newPage(); atTop = true; }
        }
        // crop this slice out of the section's drawing
        const sy = Math.round(sl.top * SCALE), sh = Math.min(src.height - sy, Math.round((sl.bottom - sl.top) * SCALE));
        if (sh <= 0) continue;
        const piece = document.createElement("canvas");
        piece.width = src.width; piece.height = sh;
        piece.getContext("2d").drawImage(src, 0, sy, src.width, sh, 0, 0, src.width, sh);
        if (hMm <= PH) {
          pdf.addImage(piece.toDataURL("image/jpeg", Q), "JPEG", xMm, y, wMm, hMm, undefined, "FAST");
          y += hMm + (sl.last ? 4 : 0);
        } else {
          // A single part taller than a whole page (rare): split it at a blank line
          let from = 0;
          while (from < piece.height - 2) {
            const roomPx = ((M + PH - y) / pxToMm) * SCALE;
            let cut = from + roomPx >= piece.height ? piece.height : quietRow(piece, from + roomPx, Math.min(260, roomPx * 0.4));
            if (cut <= from + 20) cut = Math.min(piece.height, from + roomPx);
            const part = document.createElement("canvas");
            part.width = piece.width; part.height = cut - from;
            part.getContext("2d").drawImage(piece, 0, from, piece.width, cut - from, 0, 0, piece.width, cut - from);
            const partMm = ((cut - from) / SCALE) * pxToMm;
            pdf.addImage(part.toDataURL("image/jpeg", Q), "JPEG", xMm, y, wMm, partMm, undefined, "FAST");
            y += partMm; from = cut;
            if (from < piece.height - 2) newPage();
          }
          y += sl.last ? 4 : 0;
        }
        atTop = false;
        prevSection = isSection(el);
      }
      const ids = state.stops.map((x) => CITIES[x.city].name).filter((v, i, a) => a.indexOf(v) === i);
      const blob = pdf.output("blob");
      const t = $(".toast"); if (t) t.hidden = true;
      deliverFile(blob, `China trip itinerary (${state.days} days).pdf`, "PDF", `${pages} A4 pages laid out like the planner page: summary and route map, day-by-day plans, map, hotels & halal food, before you go and phrases (${ids.join(", ")}). For a shorter version, use Print.`);
    } catch (e) {
      toast("Couldn't make the PDF — it needs an internet connection the first time. You can also use Print → Save as PDF.");
    } finally {
      if (view && view.holder.parentNode) view.holder.parentNode.removeChild(view.holder);
      pdfBusy = false;
    }
  }

  /* ---------- export & misc ---------- */
  function planText() {
    if (!lastPlan) return "";
    const strip = (h) => String(h).replace(/<[^>]+>/g, "");
    const L = [];
    L.push(`CHINA & HONG KONG TRIP — ${state.days} days`);
    L.push(state.stops.map((s) => `${CITIES[s.city].name} (${s.nights}N)`).join(" → "));
    L.push("");
    lastPlan.days.forEach((d, i) => {
      L.push(`DAY ${i + 1}${d.date ? " — " + fmtDate(d.date) : ""} · ${d.city.name} · ${dayTitle(d)}`);
      if (d.date) L.push("  Weather — " + wxPlain(d));
      timelineFor(d, i).forEach((x) => L.push(`  ${hhmm(x.start)}${x.end > x.start ? "–" + hhmm(x.end) : ""}  ${x.title}${x.note ? " — " + x.note : ""}`));
      L.push("  Details:");
      d.slots.forEach((s) => {
        const w = SLOT[s.part].label.toUpperCase();
        if (s.type === "act") {
          L.push(`  ${w} (${s.when || SLOT[s.part].time}): ${s.p.n}${s.p.zh ? " / " + s.p.zh : ""} [${s.why[1]}]`);
          L.push(`    Getting there: ${strip(s.how.text)}`);
          L.push(`    ${s.p.d}`);
          if (s.p.tip) L.push(`    Tip: ${s.p.tip}`);
          if (s.eat && s.eat.located.length) L.push(`    ${s.eat.label}: ${s.eat.located.map((h) => h.n).join("; ")}`);
        } else if (s.type === "travel") L.push(`  ${w}: Travel ${s.from.name} → ${s.to.name} by ${s.leg && s.leg.chosen ? MODE[s.leg.chosen].label.toLowerCase() : "(mode not chosen — options: " + modesFor(s.fromId, s.toId).map((m) => MODE[m].label.toLowerCase()).join(", ") + ")"}.${s.dep != null ? ` ${s.est ? "Est. " : ""}Departs ${hhmm(s.dep)}, arrives ${hhmm(s.arr)}.` : ""}${s.toFlight && s.leaveBy != null ? ` Leave by ${hhmm(s.leaveBy)}.` : ""} ${s.text}`);
        else if (s.type === "arrive") L.push(`  ARRIVE${s.land != null ? " " + hhmm(s.land) + (s.flightNo ? " (" + s.flightNo + ")" : "") : ""}: ${fromSyd() ? strip(sydLine(s.flyIn, "in")) + " " : ""}${s.text}`);
        else if (s.type === "depart") L.push(`  DEPART${s.off != null ? " " + hhmm(s.off) + (s.flightNo ? " (" + s.flightNo + ")" : "") + (s.leaveBy != null ? ", leave hotel " + hhmm(s.leaveBy) : "") : ""}: ${s.text}${fromSyd() ? " " + strip(sydLine(s.flyOut, "out")) : ""}`);
        else if (s.type === "rest") L.push(`  ${w}: Free time & rest`);
        else if (s.type === "free") L.push(`  ${w}: ${s.text}`);
      });
      if (d.back && d.kind !== "depart") L.push(`  Back to hotel: ${strip(d.back.text)}`);
      L.push("");
    });
    return withAUD(L.join("\n")) + "\n\nPrices: " + AUD_NOTE + ".\n" + refreshLine();
  }

  function copy(text, okMsg) {
    const done = () => toast(okMsg);
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : "Couldn't copy automatically — select the text and copy it by hand.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3500);
  }

  function restoreChecks() {
    const saved = load("checks") || {};
    document.querySelectorAll("[data-chk]").forEach((c) => (c.checked = !!saved[c.dataset.chk]));
  }

  function bindOutput() {
    $("#out").addEventListener("click", (e) => {
      if (clickTimeline(e)) return;
      const tab = e.target.closest("[data-tab]");
      if (tab) {
        if (tab.tagName === "A") e.preventDefault();
        if (tab.dataset.mapdayOpen != null) lmapDay = tab.dataset.mapdayOpen;
        currentTab = tab.dataset.tab; save("tab", currentTab);
        document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === currentTab));
        ["plan", "map", "wx", "stay", "prep", "talk"].forEach((id) => ($("#pane-" + id).hidden = id !== currentTab));
        if (currentTab === "map") showStreetMap();
        if (!tab.closest(".tabs")) $(".tabs").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const go = e.target.closest("[data-goto]");
      if (go) { const t = document.getElementById(go.dataset.goto); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const md = e.target.closest("[data-mapday]");
      if (md) { drawStreetMap(md.dataset.mapday); return; }
      if (e.target.id === "copyPlan") copy(planText(), "Itinerary copied — paste it into Notes or a message.");
      if (e.target.id === "copyCard") copy(HALAL_CARD, "Halal card copied.");
    });
    $("#out").addEventListener("keydown", (e) => {
      const go = e.target.closest && e.target.closest("[data-goto]");
      if (go && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go.click(); }
    });
    $("#out").addEventListener("change", (e) => {
      if (editTimeline(e)) return;
      if (!e.target.dataset.chk) return;
      const saved = load("checks") || {};
      saved[e.target.dataset.chk] = e.target.checked;
      save("checks", saved);
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-print]")) doPrint();
    if (e.target.closest("[data-save]")) saveOffline();
    if (e.target.closest("[data-pdf]")) makePDF();
    if (e.target.closest("[data-closehelp]")) { const h = $("#printHelp"); if (h) h.hidden = true; }
    if (e.target.closest("[data-pvscreen]")) { const h = $("#printHelp"); if (h) h.hidden = true; showPrintLayout(true); }
    if (e.target.closest("[data-pvexit]")) showPrintLayout(false);
    if (e.target.closest("[data-pvprint]")) { if (window.NO_PRINT) toast("Printing is blocked in this preview — use your browser's Share → Print, or open the web version."); else try { window.print(); } catch (err) { /* ignore */ } }
  });
  window.addEventListener("beforeprint", fitPrintPages);

  $("#planner").addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== "Enter" || !t.id) return;
    const m = t.id.match(/^(ownq|hotelq)-(\d+)$/);
    if (!m) return;
    e.preventDefault();
    if (m[1] === "ownq") findOwnPlace(+m[2]); else findHotel(+m[2]);
  });
  applyCustomPlaces();
  // Banner when the traveller's own guide (guide-data.js) is loaded
  if (G_ON && $("#mastText")) {
    const gb = document.createElement("p");
    gb.className = "g-banner";
    gb.innerHTML = `📘 Linked to your ${GUIDE_INFO.url && /^https?:/.test(GUIDE_INFO.url) ? `<a href="${esc(GUIDE_INFO.url)}" target="_blank" rel="noopener">China Travel Guide</a>` : "China Travel Guide"} — guide tips show on matching stops, and each city's Hotels tab has the guide's picks, viral spots, cafés and halal “what to order”.`;
    $("#mastText").appendChild(gb);
  }
  const rf = $("#refreshFooter");
  if (rf) rf.textContent = refreshLine();

  renderForm();
  bindForm();
  bindOutput();
  bindAsk();
  generate(false);
})();
