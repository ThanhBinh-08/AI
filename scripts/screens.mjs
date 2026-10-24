// Screenshots of key pages at desktop and phone width, using the locally installed Chrome.
// Usage: node scripts/screens.mjs <baseUrl> <outDir> [path ...]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [base = "http://localhost:3400", out = "screens", ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ["/", "/deals/", "/deals/quillwise-q1/", "/tools/quillwise-writer/", "/compare/quillwise-vs-framecast/", "/blog/how-to-check-a-software-coupon-code/", "/nope/"];
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const p of pages) {
    const res = await page.goto(base + p, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2600); // let the entrance animations and count-up finish
    const name = `${label}${p.replace(/\//g, "_") || "_"}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: process.env.FULL === "1" });
    console.log(`${label} ${p} ${res?.status()} -> ${name}`);
  }
  if (errors.length) console.log(`${label} console errors:\n  ${errors.join("\n  ")}`);
  await ctx.close();
}
await browser.close();
