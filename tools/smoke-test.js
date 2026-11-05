// Quick check that the planner loads and builds a trip without errors.
//   node tools/smoke-test.js
// Uses the Playwright + Chromium that cloud sessions have preinstalled.
const { chromium } = require("playwright");
const path = require("path");
const root = path.resolve(__dirname, "..");
(async () => {
  const b = await chromium.launch();
  let failed = false;
  for (const file of ["index.html", "china-trip-planner.html"]) {
    const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("file://" + path.join(root, file));
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({
      days: document.querySelectorAll(".day").length,
      timelines: document.querySelectorAll(".tl-item").length,
      aud: (document.querySelector("#out").textContent.match(/≈A\$/g) || []).length,
      footer: (document.querySelector("#refreshFooter") || {}).textContent || "",
      printPages: document.querySelectorAll("#printView .pv-page").length,
    }));
    const ok = !errs.length && r.days > 0 && r.timelines > 0 && r.aud > 0 && /Data last refreshed/.test(r.footer) && r.printPages > 0;
    console.log(`${ok ? "PASS" : "FAIL"} ${file}: ${r.days} days, ${r.timelines} timeline items, ${r.aud} A$ prices, ${r.printPages} print pages | ${r.footer.slice(0, 60)}${errs.length ? " | errors: " + errs.join("; ") : ""}`);
    if (!ok) failed = true;
    await p.close();
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
