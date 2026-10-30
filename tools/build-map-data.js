// Builds simplified SVG paths of land and borders for the trip map (Natural Earth 1:50m, public domain)
// Run from a folder with topojson-client@3 and world-atlas@2 installed: node build-map-data.js (writes ../map-data.js)
const tj = require('topojson-client');
const land = require('world-atlas/land-50m.json');
const ctry = require('world-atlas/countries-50m.json');
const LON0 = 72, LON1 = 136, LAT0 = 16, LAT1 = 54.5, COS = Math.cos(35 * Math.PI / 180);
const K = 1000 / ((LON1 - LON0) * COS);
const W = 1000, H = Math.round((LAT1 - LAT0) * K);
const M = 30; // clamp margin in px
const proj = ([lon, lat]) => [(lon - LON0) * COS * K, (LAT1 - lat) * K];
const clamp = ([x, y]) => [Math.max(-M, Math.min(W + M, x)), Math.max(-M, Math.min(H + M, y))];
function dp(pts, tol) { // Douglas–Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
// Closed rings start and end on the same point, which defeats Douglas–Peucker; split at the farthest point first
function dpRing(pts, tol) {
  let m = 0, md = -1;
  pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > md) { md = d; m = i; } });
  if (m === 0) return pts;
  return dp(pts.slice(0, m + 1), tol).concat(dp(pts.slice(m), tol).slice(1));
}
const inside = (pts) => pts.some(([x, y]) => x > -M && x < W + M && y > -M && y < H + M);
const fmt = (pts, close) => 'M' + pts.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + (close ? 'Z' : '');
function rings(geom) { return geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : []; }
let landPath = '';
for (const f of tj.feature(land, land.objects.land).features) for (const r of rings(f.geometry)) {
  const p = r.map(proj); if (!inside(p)) continue;
  const s = dpRing(p.map(clamp), 0.7); if (s.length > 3) landPath += fmt(s, true);
}
let borderPath = '';
const mesh = tj.mesh(ctry, ctry.objects.countries, (a, b) => a !== b);
for (const line of mesh.coordinates) { const p = line.map(proj); if (!inside(p)) continue; const s = dp(p.map(clamp), 0.7); if (s.length > 1) borderPath += fmt(s, false); }
const out = `/* Trip map geography: Natural Earth 1:50m land and borders (public domain), simplified.
   Equirectangular projection: x = (lon - ${LON0}) * cos(35°) * K, y = (${LAT1} - lat) * K. */
const MAP_GEO = { w: ${W}, h: ${H}, lon0: ${LON0}, lat1: ${LAT1}, cos: ${COS.toFixed(6)}, k: ${K.toFixed(4)},
  land: "${landPath}",
  borders: "${borderPath}" };
`;
require('fs').writeFileSync(require('path').join(__dirname, '..', 'map-data.js'), out);
console.log('W', W, 'H', H, 'bytes', out.length);
