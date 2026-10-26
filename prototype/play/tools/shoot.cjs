// Screenshots of the prototype on an emulated phone (touch) and a tablet.
// node tools/shoot.cjs <outDir> [scenario...]
const { chromium, devices } = require("/home/shawn/.cache/claude-work/ti-ui-audit/node_modules/playwright-core");
const [out, ...steps] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
  const ctx = await browser.newContext(devices["iPhone 13"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto("http://127.0.0.1:8765/_local.html", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/phone-now.png` });
  await page.screenshot({ path: `${out}/phone-now-full.png`, fullPage: true });
  console.log("errors:", errors.length ? errors.join("\n") : "none");
  console.log("doc width:", await page.evaluate(() => document.documentElement.scrollWidth), "height:", await page.evaluate(() => document.documentElement.scrollHeight));
  await browser.close();
})();
