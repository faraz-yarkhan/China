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
  Object.entries(CITIES).forEach(([cid, c]) => c.places.forEach((p, i) => (p.id = cid + "-" + i)));

  /* ---------- state ---------- */
  const DEFAULT = {
    days: 10, start: "", pace: "balanced", budget: "mid", passport: "au", home: "syd", arrive: "bj", depart: "hk", optimise: true,
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

  function hotelPoint(city) {
    return { n: "your hotel (" + city.stay.area + ")", ll: city.stay.ll, m: city.stay.m, hotel: true };
  }

  /* How to get from A to B inside a city */
  function getThere(from, to, city) {
    const d = km(from.ll, to.ll);
    if (d < 0.15) return { mode: "Walk", text: "You're already here." };
    if (to.x && d > 12) return { mode: "Trip", text: esc(to.x) };
    if (from.x && d > 12) {
      if (to.hotel) return { mode: "Return", text: "Head back the way you came: " + esc(from.x) };
      const onward = getThere(hotelPoint(city), to, city);
      return { mode: "Return", text: "Head back to the city the way you came, then: " + onward.text };
    }
    const road = d * 1.35;
    const walk = Math.round((road / 4.5) * 60);
    const [base, baseKm, perKm] = city.taxi;
    const fare = Math.max(base, round5(base + Math.max(0, road - baseKm) * perKm));
    const car = Math.round((road / (d > 15 ? 40 : 22)) * 60 + 5);
    const show = to.zh ? ` Show the driver: <span class="han">${esc(to.zh)}</span>.` : "";
    const ride = city.ride;
    if (d < 1) return { mode: "Walk", text: `Walk about ${walk} min (${d.toFixed(1)} km).` };
    if (d < 2) return { mode: "Walk", text: `Walk about ${walk} min, or a short ${ride} (~${city.cur}${fare}).` + show };
    if (city.metro && from.m && to.m) {
      const mm = Math.round((road / 30) * 60 + 12);
      return { mode: "Metro", text: `Metro from <b>${esc(from.m)}</b> to <b>${esc(to.m)}</b>, about ${mm} min door to door (Apple Maps or Amap will show the exact transfer). Or ${ride} ~${car} min, approx. ${city.cur}${fare}.` + show };
    }
    return { mode: ride === "DiDi" ? "DiDi" : "Taxi", text: `${ride[0].toUpperCase() + ride.slice(1)} ~${car} min, approx. ${city.cur}${fare}.` + show };
  }

  /* Intercity route */
  function routeText(a, b) {
    if (a === b) return "Same city — no transfer needed.";
    const k1 = a + "|" + b, k2 = b + "|" + a;
    if (ROUTES[k1]) return ROUTES[k1];
    if (ROUTES[k2]) return ROUTES[k2];
    const A = CITIES[a], B = CITIES[b];
    const d = km(A.stay.ll, B.stay.ll);
    const name = `${A.name} → ${B.name}`;
    if (d < 400) return `${name}: high-speed train, roughly ${(d * 1.2 / 220 + 0.4).toFixed(1)} h. Search on Trip.com or 12306.`;
    if (d < 1000) return `${name}: high-speed train ~${(d * 1.25 / 250 + 0.5).toFixed(0)} h, or fly ~${(d / 650 + 0.6).toFixed(1)} h plus airport time. Compare on Trip.com.`;
    return `${name}: fly (~${(d / 700 + 0.6).toFixed(1)} h in the air). Trains exist but take most of a day.`;
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
        days.push(makeDay(ctx, kind, dateFor(dayIdx), si > 0 ? stopCtx[si - 1] : null, arriveId));
        dayIdx++;
      }
    });
    const last = stopCtx[stopCtx.length - 1];
    days.push(makeDay(last, "depart", dateFor(dayIdx), null, departId));

    // Selected places that didn't fit
    stopCtx.forEach((ctx) => {
      const missed = [...ctx.sel].filter((id) => !ctx.used.has(id)).map((id) => ctx.city.places.find((p) => p.id === id)).filter(Boolean);
      if (missed.length) warnings.push(`${ctx.city.name}: no room for ${missed.map((p) => p.n).join(", ")}. Add a night there, or swap it for another pick (full-day trips need a full day, not an arrival or travel day).`);
    });
    return { days, warnings, stops: stopCtx, arriveId, departId };
  }

  function travelSlot(fromId, toId, extra) {
    const from = CITIES[fromId], to = CITIES[toId];
    return Object.assign({ part: "m", type: "travel", from, to, text: routeText(fromId, toId), border: crossesBorder(fromId, toId), arrive: to.arrive }, extra);
  }

  function makeDay(ctx, kind, date, prevCtx, flyId) {
    const city = ctx.city;
    const hotel = hotelPoint(city);
    ctx.dow = date ? date.getDay() : null;
    const day = { kind, city, cityId: ctx.id, date, slots: [], friday: date && date.getDay() === 5 };
    let prev = hotel;

    if (kind === "arrival") {
      day.flyIn = flyId;
      if (flyId === ctx.id) day.slots.push({ part: "m", type: "arrive", text: city.arrive, city, flyIn: flyId });
      else {
        day.slots.push({ part: "m", type: "arrive", via: true, city: CITIES[flyId], flyIn: flyId, text: `Clear immigration and customs in ${CITIES[flyId].name}, then continue straight to ${city.name}.` });
        day.slots.push(travelSlot(flyId, ctx.id, { sameDay: true, part: "e" }));
      }
    }
    if (kind === "transfer") day.slots.push(travelSlot(prevCtx.id, ctx.id));

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
    }
    if (kind === "depart" && flyId !== ctx.id) {
      day.flyOut = flyId;
      day.slots.push(travelSlot(ctx.id, flyId, { toFlight: true }));
      day.slots.push({ part: "e", type: "depart", text: CITIES[flyId].depart, flyOut: flyId });
      return day;
    }
    if (kind === "depart") {
      day.flyOut = flyId;
      const [a, alt] = pick(ctx, "m", prev, { near: true });
      if (a) { ctx.used.add(a.id); day.slots.push(activity(ctx, "m", a, alt, prev)); day.back = getThere(a, hotel, city); }
      day.slots.push({ part: "e", type: "depart", text: city.depart, flyOut: flyId });
      return day;
    }

    const hadFull = day.slots.some((x) => x.part === "full" || x.sameDay);
    if (!hadFull) {
      const restDay = kind === "full" && ctx.prefs.pace === "relaxed" && ctx.prefs.fullTotal % 2 === 0;
      if (restDay) {
        day.slots.push({ part: "e", type: "rest" });
      } else {
        const [b, alt] = pick(ctx, "e", prev, { near: kind !== "full" });
        if (b) { ctx.used.add(b.id); day.slots.push(activity(ctx, "e", b, alt, prev)); prev = b; }
        else day.slots.push({ part: "e", type: "rest" });
      }
    }
    const [c, alt] = pick(ctx, "n", prev, { near: kind !== "full" });
    if (c) { ctx.used.add(c.id); day.slots.push(activity(ctx, "n", c, alt, prev)); prev = c; }
    else day.slots.push({ part: "n", type: "free", text: city.night[(ctx.fullCount + day.slots.length) % city.night.length], eat: { label: "Dinner (halal)", ...eatNear(city, prev.ll) } });
    day.back = getThere(prev, hotel, city);
    return day;
  }

  /* Put the arrival city first, the departure city last, and order the rest by shortest hops */
  function arrangeStops() {
    if (!state.optimise || state.stops.length < 2) return false;
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
    const leg = (a, b) => (a && b ? km(CITIES[a].stay.ll, CITIES[b].stay.ll) + (CITIES[a].region !== CITIES[b].region ? 800 : 0) : 0);
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
    document.querySelector(`input[name=passport][value=${state.passport}]`).checked = true;
    document.querySelector(`input[name=home][value=${state.home}]`).checked = true;
    renderStops();
  }

  function renderStops() {
    const el = $("#stops");
    if (!state.stops.length) { el.innerHTML = '<p class="hint">No cities yet. Add your first city above.</p>'; renderTally(); return; }
    el.innerHTML = state.stops.map((st, i) => {
      const c = CITIES[st.city];
      const opts = c.places.filter((p) => !st.places.includes(p.id)).map((p) => `<option value="${p.id}">${esc(p.n)}${p.s.includes("full") ? " (full day)" : ""}</option>`).join("");
      const chips = st.places.map((id) => {
        const p = c.places.find((x) => x.id === id);
        return p ? `<span class="chip">${esc(p.n)}<button type="button" data-act="unplace" data-i="${i}" data-id="${id}" aria-label="Remove ${esc(p.n)}">×</button></span>` : "";
      }).join("");
      return `<div class="stop">
        <div class="stop-head"><span class="num">${String(i + 1).padStart(2, "0")}</span><strong>${esc(c.name)}</strong><span class="han">${c.zh}</span>
          <button type="button" class="icon-btn" data-act="up" data-i="${i}" aria-label="Move ${esc(c.name)} earlier" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="icon-btn" data-act="down" data-i="${i}" aria-label="Move ${esc(c.name)} later" ${i === state.stops.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="icon-btn" data-act="remove" data-i="${i}" aria-label="Remove ${esc(c.name)}">✕</button></div>
        <label class="nights" for="nights-${i}">Nights <input type="number" id="nights-${i}" min="1" max="30" value="${st.nights}" data-act="nights" data-i="${i}"></label>
        <div class="row"><select id="place-${i}" data-act="place" data-i="${i}" aria-label="Add a place in ${esc(c.name)}"><option value="">Add a place to see…</option>${opts}</select></div>
        ${chips ? `<div class="chips">${chips}</div>` : `<p class="hint suggest">No places chosen, so we'll plan the top-rated ones for your trip style, e.g. ${topPicks(st.city, 3).map((p) => esc(p.n.split(/[:(]/)[0].trim())).join(", ")}. <button type="button" class="btn small" data-act="addtop" data-i="${i}">Add top picks</button></p>`}
      </div>`;
    }).join("");
    renderTally();
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
      if ((act === "up" || act === "down") && state.optimise) { state.optimise = false; $("#optimise").checked = false; toast("Automatic ordering turned off so your manual order is kept."); }
      if (act === "up" && i > 0) [state.stops[i - 1], state.stops[i]] = [state.stops[i], state.stops[i - 1]];
      else if (act === "down" && i < state.stops.length - 1) [state.stops[i + 1], state.stops[i]] = [state.stops[i], state.stops[i + 1]];
      else if (act === "addtop") { const st = state.stops[i]; st.places = topPicks(st.city, Math.min(2 + st.nights, 5)).filter((p) => !p.s.includes("full") || st.nights > 1).map((p) => p.id); }
      else if (act === "remove") state.stops.splice(i, 1);
      else if (act === "unplace") state.stops[i].places = state.stops[i].places.filter((x) => x !== b.dataset.id);
      else if (act === "fit") { fitNights(); return; }
      else return;
      persist(); renderStops();
    });
    $("#planner").addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.act === "place" && t.value) { state.stops[+t.dataset.i].places.push(t.value); persist(); renderStops(); return; }
      if (t.dataset.act === "nights") { state.stops[+t.dataset.i].nights = Math.max(1, Math.min(30, parseInt(t.value, 10) || 1)); persist(); renderTally(); return; }
      if (t.id === "arriveSel" || t.id === "departSel" || t.id === "optimise") {
        readForm();
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

  function slotHTML(s, day) {
    const city = day.city;
    const when = SLOT[s.part];
    const head = `<div class="slot-when"><b>${when.label}</b><span>${when.time}</span></div>`;
    let body = "";
    if (s.type === "act") {
      const p = s.p;
      body = `<div class="how"><b class="k">${esc(s.how.mode)}</b>${s.how.text}</div>
        <p class="act-name">${esc(p.n)}${p.zh ? `<span class="han">${esc(p.zh)}</span>` : ""} <span class="badge ${s.why[0]}">${esc(s.why[1])}</span></p>
        <p class="act-desc">${esc(p.d)}</p>
        <div class="kv"><span>Time needed <b>${esc(p.h)}</b></span><span>Cost <b>${esc(p.c)}</b></span>${p.m ? `<span>Nearest metro <b>${esc(p.m)}</b></span>` : ""}</div>
        ${p.tip ? `<p class="tip">${esc(p.tip)}</p>` : ""}
        ${mapLinks(p, city)}
        ${s.alt ? `<p class="alt">Prefer something else? <b>${esc(s.alt.n)}</b> — ${esc(s.alt.d.split(". ")[0].replace(/\.$/, ""))}.</p>` : ""}
        ${day.friday && (s.part === "m" || s.part === "full") ? jumuah(city, p.ll) : ""}
        ${eatHTML(s.eat)}`;
    } else if (s.type === "arrive") {
      body = s.via
        ? `<div class="travel"><b class="k">Land in ${esc(s.city.name)}</b>${fromSyd() ? `<span>${sydLine(s.flyIn, "in")}</span>` : ""}<span>${esc(s.text)}</span></div>`
        : `<div class="travel"><b class="k">Arrive & check in</b>${fromSyd() ? `<span>${sydLine(s.flyIn, "in")}</span>` : ""}<span>${esc(s.text)}</span><span>Check in to your hotel in <b>${esc(city.stay.area)}</b>, rest, and change money/test Alipay if you haven't.</span></div>`;
    } else if (s.type === "travel") {
      body = `<div class="travel"><b class="k">${s.toFlight ? "To your flight" : s.sameDay ? "Onward the same day" : "Travel day"} · ${esc(s.from.name)} → ${esc(s.to.name)}</b>
        <span>${s.sameDay ? "From the airport or station: " : s.toFlight ? "Check out early and allow a buffer of at least 3 h before your international flight. " : "Check out after breakfast. "}${esc(s.text)}</span>
        ${s.border ? `<span><b>Border crossing:</b> passport out. ${isAU() ? (s.to.region === "mainland" ? "Australians: entering the mainland starts a fresh visa-free stay of up to 30 days." : s.to.region === "hk" ? "Australians: visa-free in Hong Kong for up to 90 days." : "Australians: visa-free entry to Macau.") : "Leaving or entering the mainland uses one visa entry — see Before you go."}</span>` : ""}
        ${s.toFlight ? "" : `<span><b>On arrival:</b> ${esc(s.arrive)}</span>
        <span>Check in to your hotel in <b>${esc(s.to.stay.area)}</b>.</span>`}</div>
        ${s.toFlight ? "" : eatHTML({ label: s.sameDay ? "First meal on arrival (halal)" : "Lunch on arrival (halal)", ...eatNear(s.to, s.to.stay.ll) })}`;
    } else if (s.type === "depart") {
      body = `<div class="travel"><b class="k">Departure</b><span>${day.flyOut === day.cityId ? "Check out (usually by 12:00; ask the hotel to hold bags). " : ""}${esc(s.text)}</span>${fromSyd() ? `<span>${sydLine(s.flyOut, "out")}</span>` : ""}${fromSyd() && isAU() ? `<span><b>Landing in Sydney:</b> declare all food, plant and animal products (many Chinese snacks contain meat, egg or seeds). Duty-free allowance: A$900 of goods, 2.25 L alcohol, 25 cigarettes.</span>` : ""}</div>`;
    } else if (s.type === "rest") {
      body = `<p class="act-name">Free time & rest</p><p class="act-desc">Keep this block open: nap, pray, do laundry, or revisit somewhere you liked. A relaxed pace keeps a 2-week trip enjoyable.</p>`;
    } else if (s.type === "free") {
      body = `<p class="act-name">Easy evening</p><p class="act-desc">${esc(s.text)}</p>${eatHTML(s.eat)}`;
    }
    return `<div class="slot">${head}<div class="slot-what">${body}</div></div>`;
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

  function generate(scroll) {
    readForm();
    const plan = buildPlan(state);
    lastPlan = plan;
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
    if (reordered) notes.push(["info", "Route", `Cities re-ordered so you start in ${esc(CITIES[arrId].name)}, finish near ${esc(CITIES[depId].name)} and travel the shortest way between them. Untick “Arrange my cities” to keep your own order.`]);
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
    notes.push(["good", "Halal", "Every activity lists the nearest halal food we know of. Always confirm the green <span class=\"han\">清真</span> sign or certificate at the door — ownership changes."]);

    const hdr = `<div class="summary">
      <div class="eyebrow">${isExample ? "Example itinerary" : "Your itinerary"} · ${state.days} days${startD ? ` · ${fmtDate(startD)} – ${fmtDate(endD)}` : ""}</div>
      <h2>${esc(typeLabels.length ? typeLabels.join(", ") : "All-round")} trip through ${esc(state.stops.map((s) => CITIES[s.city].name).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</h2>
      <div class="route">${route}</div>
      <div class="facts">
        <div class="fact"><b>${state.days} days / ${state.days - 1} nights</b><span>Length</span></div>
        <div class="fact"><b>${state.stops.length} ${state.stops.length === 1 ? "stop" : "stops"}</b><span>Cities</span></div>
        <div class="fact"><b>${b.day}</b><span>${b.label} / person / day${hasHK ? ` · HK ${b.hk}` : ""}</span></div>
        <div class="fact"><b>${state.pace === "relaxed" ? "Relaxed" : "Balanced"}</b><span>Pace</span></div>
      </div>
      <div class="notes">${notes.map(([k, t, h]) => `<div class="note ${k}"><b class="tag">${t}</b><span>${h}</span></div>`).join("")}</div>
      <div class="actions"><button type="button" class="btn print-btn" data-print>🖨 Print itinerary & info (${plan.days.length + 4} pages)</button><button type="button" class="btn" data-save>⬇ Save offline copy</button><button type="button" class="btn" id="copyPlan">Copy itinerary as text</button></div>
    </div>`;

    const tabs = `<div class="tabs" role="tablist">
      ${[["plan", "Day by day"], ["stay", "Hotels & halal food"], ["prep", "Before you go"], ["talk", "Phrases"]].map(([id, l]) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${currentTab === id}" aria-controls="pane-${id}" data-tab="${id}">${l}</button>`).join("")}
    </div>`;

    // Day by day
    let html = "", n = 0;
    plan.days.forEach((day, i) => {
      if (day.kind !== "full" && day.kind !== "depart") {
        const st = state.stops[n];
        html += `<div class="city-band"><h3>${esc(day.city.name)}</h3><span class="han">${day.city.zh}</span><span class="meta">${st ? st.nights + " night" + (st.nights > 1 ? "s" : "") : ""}</span></div>
          <p class="city-stay">${esc(day.city.intro)} <b>Stay:</b> ${esc(day.city.stay.area)}. ${esc(day.city.stay.why)}</p>
          <p class="city-stay"><b>Top rated here:</b> ${day.city.places.filter((p) => p.r === 3).map((p) => plan.stops[n].used.has(p.id) ? `${esc(p.n)} <span style="color:var(--jade)">✓ in your plan</span>` : `${esc(p.n)} <i>(not in this plan — add a night)</i>`).join(" · ")}</p>`;
        n++;
      }
      html += `<article class="day">
        <div class="day-num"><div class="stamp">${i + 1}</div><small>Day ${i + 1}${day.date ? "<br>" + fmtDate(day.date) : ""}</small></div>
        <div class="day-body"><h4 class="day-title">${esc(dayTitle(day))}${KIND[day.kind] ? `<span class="kind">${KIND[day.kind]}</span>` : ""}</h4>
          ${day.slots.map((s) => slotHTML(s, day)).join("")}
          ${day.back && day.kind !== "depart" ? `<div class="back"><b>Back to the hotel:</b> ${day.back.text}</div>` : ""}
        </div></article>`;
    });

    const out = $("#out");
    out.innerHTML = hdr + tabs +
      `<div id="pane-plan" role="tabpanel" aria-labelledby="tab-plan" class="out" ${currentTab !== "plan" ? "hidden" : ""}><h2 class="print-only">Day-by-day itinerary</h2>${html}</div>
       <div id="pane-stay" role="tabpanel" aria-labelledby="tab-stay" class="out" ${currentTab !== "stay" ? "hidden" : ""}><h2 class="print-only">Hotels, halal food & things to do</h2>${stayHTML(ids)}</div>
       <div id="pane-prep" role="tabpanel" aria-labelledby="tab-prep" class="out" ${currentTab !== "prep" ? "hidden" : ""}><h2 class="print-only">Before you go</h2>${prepHTML(routeIds, hasMainland, hasHK, hasMO)}</div>
       <div id="pane-talk" role="tabpanel" aria-labelledby="tab-talk" class="out" ${currentTab !== "talk" ? "hidden" : ""}><h2 class="print-only">Phrases</h2>${phrasesHTML(hasHK || hasMO)}</div>
       <p class="foot">Prices, opening hours and visa rules change. Figures here are typical for 2025–26 and meant for planning; confirm bookings and entry rules on official sites before you travel. Directions are estimates from map distance — use Apple Maps or Amap on the day for live routes.</p>`;
    restoreChecks();
    buildPrintView(plan, { ids, routeIds, arrId, depId, hasMainland, hasHK, hasMO, startD, endD, notes });
    if (scroll) out.scrollIntoView({ behavior: "smooth", block: "start" });
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
      b = `<div class="pv-name">${s.via ? "Land in " + esc(s.city.name) : "Arrive & check in"}</div>${fromSyd() ? `<div>${plain(sydLine(s.flyIn, "in"))}</div>` : ""}<div>${esc(s.text)}</div>`;
    } else if (s.type === "travel") {
      b = `<div class="pv-name">${s.toFlight ? "To your flight" : "Travel"}: ${esc(s.from.name)} → ${esc(s.to.name)}</div><div>${esc(s.text)}</div>
        ${s.border ? `<div>Border crossing — passport ready.</div>` : ""}
        ${s.toFlight ? "" : `<div><b>On arrival:</b> ${esc(firstSentence(s.arrive))} Check in at ${esc(s.to.stay.area)}.</div>`}`;
    } else if (s.type === "depart") {
      b = `<div class="pv-name">Departure</div><div>${esc(s.text)}</div>${fromSyd() ? `<div>${plain(sydLine(s.flyOut, "out"))}</div>` : ""}`;
    } else if (s.type === "rest") {
      b = `<div class="pv-name">Free time & rest</div><div>Rest, pray, or revisit somewhere you liked.</div>`;
    } else if (s.type === "free") {
      b = `<div class="pv-name">Easy evening</div><div>${esc(s.text)}</div>`;
    }
    return `<tr><th><b>${when.label}</b><br>${when.time}</th><td>${b}</td></tr>`;
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
      <ul class="pv-notes">${c.notes.filter((n) => n[1] !== "Example").map(([, t, h]) => `<li><b>${t}:</b> ${plain(h)}</li>`).join("")}</ul>
      <table class="pv-tbl"><thead><tr><th>Day</th><th>City</th><th>Plan</th></tr></thead><tbody>
      ${plan.days.map((d, i) => `<tr><td>${i + 1}${d.date ? "<br>" + fmtDate(d.date) : ""}</td><td>${esc(d.city.name)}</td><td>${esc(dayTitle(d))}</td></tr>`).join("")}
      </tbody></table>`);

    // 2. One page per day
    plan.days.forEach((d, i) => {
      const firstInCity = d.kind === "arrival" || d.kind === "transfer";
      const hotel = d.city.hotels.find((h) => h.tier === state.budget) || d.city.hotels[0];
      pages.push(`${head(`Day ${i + 1} · ${esc(d.city.name)} <span class="han">${d.city.zh}</span>`, (d.date ? fmtDate(d.date) + " · " : "") + (KIND[d.kind] || "Sightseeing"))}
        <p class="pv-sub">${esc(dayTitle(d))}</p>
        ${firstInCity ? `<p class="pv-stay"><b>Stay:</b> ${esc(d.city.stay.area)} — e.g. ${esc(hotel.n)}. <b>Halal near hotel:</b> ${esc(eatNear(d.city, d.city.stay.ll, 2).located.map((h) => h.n).join("; ") || d.city.halalTip)}</p>` : ""}
        <table class="pv-day"><tbody>${d.slots.map((s) => pvSlot(s, d)).join("")}</tbody></table>
        ${d.back && d.kind !== "depart" ? `<p class="pv-meta"><b>Back to the hotel:</b> ${plain(d.back.text)}</p>` : ""}`);
    });

    // 3. Key information
    const uniq = c.ids.filter((v, i, a) => a.indexOf(v) === i);
    const T = { lux: "Lux", mid: "Mid", budget: "Budget" };
    pages.push(`${head("Key information")}
      <div class="pv-cols">
        ${uniq.map((id) => { const ct = CITIES[id]; return `<section><h2>${esc(ct.name)} <span class="han">${ct.zh}</span></h2>
          <p><b>Stay:</b> ${esc(ct.stay.area)}</p>
          <p><b>Hotels:</b> ${ct.hotels.map((h) => `${esc(h.n)} (${T[h.tier]})`).join("; ")}</p>
          <p><b>Halal:</b> ${ct.halal.map((h) => esc(h.n)).join("; ")}</p>
          ${ct.mosques.length ? `<p><b>Mosque:</b> ${ct.mosques.map((m) => esc(m.n)).join("; ")}</p>` : ""}
          <p><b>Getting around:</b> ${esc(firstSentence(ct.getAround))}</p></section>`; }).join("")}
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

  function doPrint() {
    if (window.NO_PRINT) toast("Printing is blocked inside this preview. Download the standalone HTML file, open it in Chrome or Safari, and print from there.");
    fitPrintPages();
    try { window.print(); } catch (e) { /* print unavailable */ }
  }

  /* Save the current plan as a script-free HTML file: it opens in any iPhone preview
     (Files, Mail, WhatsApp) and works offline, including where claude.ai is blocked. */
  function saveOffline() {
    if (!lastPlan) return;
    if (window.NO_PRINT) { toast("Saving files is blocked inside this preview. Use the standalone HTML file or the GitHub Pages version to save an offline copy."); return; }
    const out = $("#out").cloneNode(true);
    out.querySelectorAll(".tabs, .actions, script, .maplinks").forEach((n) => n.parentNode.removeChild(n));
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
    try {
      const blob = new Blob([doc], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.rel = "noopener";
      if (typeof a.download === "undefined") window.open(url, "_blank"); // very old Safari
      else { document.body.appendChild(a); a.click(); a.parentNode.removeChild(a); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("Saved. On iPhone, tap the download arrow in Safari, then the file, and Share → Save to Files.");
    } catch (e) {
      toast("Couldn't save the file in this browser. Try Copy itinerary as text instead.");
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
      d.slots.forEach((s) => {
        const w = SLOT[s.part].label.toUpperCase();
        if (s.type === "act") {
          L.push(`  ${w} (${SLOT[s.part].time}): ${s.p.n}${s.p.zh ? " / " + s.p.zh : ""} [${s.why[1]}]`);
          L.push(`    Getting there: ${strip(s.how.text)}`);
          L.push(`    ${s.p.d}`);
          if (s.p.tip) L.push(`    Tip: ${s.p.tip}`);
          if (s.eat && s.eat.located.length) L.push(`    ${s.eat.label}: ${s.eat.located.map((h) => h.n).join("; ")}`);
        } else if (s.type === "travel") L.push(`  ${w}: Travel ${s.from.name} → ${s.to.name}. ${s.text}`);
        else if (s.type === "arrive") L.push(`  ARRIVE: ${fromSyd() ? strip(sydLine(s.flyIn, "in")) + " " : ""}${s.text}`);
        else if (s.type === "depart") L.push(`  DEPART: ${s.text}${fromSyd() ? " " + strip(sydLine(s.flyOut, "out")) : ""}`);
        else if (s.type === "rest") L.push(`  ${w}: Free time & rest`);
        else if (s.type === "free") L.push(`  ${w}: ${s.text}`);
      });
      if (d.back && d.kind !== "depart") L.push(`  Back to hotel: ${strip(d.back.text)}`);
      L.push("");
    });
    return L.join("\n");
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
      const tab = e.target.closest("[data-tab]");
      if (tab) {
        currentTab = tab.dataset.tab; save("tab", currentTab);
        document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === currentTab));
        ["plan", "stay", "prep", "talk"].forEach((id) => ($("#pane-" + id).hidden = id !== currentTab));
        return;
      }
      if (e.target.id === "copyPlan") copy(planText(), "Itinerary copied — paste it into Notes or a message.");
      if (e.target.id === "copyCard") copy(HALAL_CARD, "Halal card copied.");
    });
    $("#out").addEventListener("change", (e) => {
      if (!e.target.dataset.chk) return;
      const saved = load("checks") || {};
      saved[e.target.dataset.chk] = e.target.checked;
      save("checks", saved);
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-print]")) doPrint();
    if (e.target.closest("[data-save]")) saveOffline();
  });
  window.addEventListener("beforeprint", fitPrintPages);

  renderForm();
  bindForm();
  bindOutput();
  generate(false);
})();
