#!/usr/bin/env python3
"""Build the shareable versions of the planner from index.html + data.js + map-data.js + app.js.

  python3 tools/build.py

Writes:
  china-trip-planner.html   single file with everything inlined (the one people download)
  .build/site/              copy for the claude.ai page (printing/downloads switched off there)

It also copies DATA_INFO.refreshed from data.js into the footer text of index.html, so the
date shows even where scripts don't run (iPhone file previews).
"""
import datetime
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

data = open("data.js", encoding="utf-8").read()
m = re.search(r'refreshed:\s*"(\d{4}-\d{2}-\d{2})"', data)
if not m:
    raise SystemExit("data.js: DATA_INFO.refreshed not found")
refreshed = datetime.date.fromisoformat(m.group(1))
label = f"{refreshed.day} {refreshed.strftime('%b %Y')}"
covers = re.search(r'covers:\s*"([^"]+)"', data).group(1)

page = open("index.html", encoding="utf-8").read()
page, n = re.subn(r'(<footer class="refresh" id="refreshFooter">)[^<]*(</footer>)',
                  rf"\g<1>Data last refreshed: {label} ({covers}). Checked daily.\g<2>", page)
if n != 1:
    raise SystemExit("index.html: refresh footer not found")
open("index.html", "w", encoding="utf-8").write(page)

single = page.replace('<script src="guide-data.js"></script>\n', "")  # the personal guide file isn't part of the shareable build
for f in ["data.js", "map-data.js", "app.js"]:
    js = open(f, encoding="utf-8").read().replace("</script", "<\\/script")
    single = single.replace(f'<script src="{f}"></script>', "<script>\n" + js + "\n</script>")
open("china-trip-planner.html", "w", encoding="utf-8").write(single)

os.makedirs(".build/site", exist_ok=True)
site = page.replace('<script src="data.js"></script>', '<script>window.NO_PRINT = true;</script>\n<script src="data.js"></script>', 1)
open(".build/site/index.html", "w", encoding="utf-8").write(site)
for f in ["data.js", "map-data.js", "app.js"]:
    shutil.copy(f, os.path.join(".build/site", f))

print(f"Built china-trip-planner.html and .build/site/ — data refreshed {label}")
