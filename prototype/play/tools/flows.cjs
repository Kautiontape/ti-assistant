// Walks the prototype's key tasks on an emulated phone (touch), counts taps,
// checks touch-target sizes, and saves screenshots.
//   node tools/flows.cjs <outDir> [url]
const { chromium, devices } = require("/home/shawn/.cache/claude-work/ti-ui-audit/node_modules/playwright-core");
const [out, url = "http://127.0.0.1:8765/_local.html"] = process.argv.slice(2);
const results = [];
const problems = [];

async function fresh(browser, { seat, scenario, dark, device = "iPhone 13" }) {
  const ctx = await browser.newContext({ ...devices[device], colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror (${scenario}): ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/status of 404/.test(m.text()) && problems.push(`console (${scenario}): ${m.text()}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on("response", (r) => r.status() >= 400 && !/favicon/.test(r.url()) && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  await page.addInitScript((s) => { try { localStorage.setItem("seat", s); } catch {} }, seat || "");
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector(".top");
  if (scenario && scenario !== "action") {
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.locator(".sheet .opt", { hasText: SCEN[scenario] }).click();
    await page.waitForTimeout(300);
  }
  let taps = 0;
  const tap = async (locator) => { await locator.first().tap(); taps++; await page.waitForTimeout(250); };
  return { ctx, page, tap, taps: () => taps };
}
const SCEN = { strategy: "Round 1 strategy", status: "Round 3 status", agenda: "Round 3 agenda", late: "Round 5 action", end: "Game over" };

async function smallTargets(page, label) {
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, [role=button], a, input, summary")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.closest("[hidden]")) continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  if (small.length) problems.push(`small targets (${label}): ${small.slice(0, 8).join("; ")}${small.length > 8 ? ` …+${small.length - 8}` : ""}`);
}

async function firstControlY(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const el = main && [...main.querySelectorAll("button")].find((b) => b.getBoundingClientRect().height > 0);
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });

  // A. A normal turn, as the active player (Creuss), plus a planet claim and undo.
  {
    const { ctx, page, tap, taps } = await fresh(browser, { seat: "Ghosts of Creuss", scenario: "action" });
    const y = await firstControlY(page);
    results.push(`first control on Now (your turn): y=${y} of ${page.viewportSize().height}`);
    await page.screenshot({ path: `${out}/A1-your-turn.png` });
    await smallTargets(page, "your turn");
    const before = taps();
    await tap(page.getByRole("button", { name: "Take a planet" }));
    await page.screenshot({ path: `${out}/A3-claim-sheet.png` });
    await smallTargets(page, "claim sheet");
    await tap(page.locator(".sheet .opt").first());
    results.push(`claim a planet (already in a tactical action): ${taps() - before} taps`);
    await page.screenshot({ path: `${out}/A4-after-claim.png` });
    await tap(page.getByRole("button", { name: "End turn" }));
    const up = await page.locator(".top .turn").innerText();
    results.push(`after End turn the top bar says: ${up.replace(/\s+/g, " ")}`);
    await page.screenshot({ path: `${out}/A5-after-end.png` });
    // Now be the next player and take a whole normal turn.
    await page.locator(".seatbtn").tap();
    await page.locator(".sheet .pick button", { hasText: "Jol-Nar" }).tap();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/A6-choose-action.png` });
    results.push(`first control on Now (choosing an action): y=${await firstControlY(page)} of ${page.viewportSize().height}`);
    const t0 = taps();
    await tap(page.getByRole("button", { name: /^Tactical/ }));
    await tap(page.getByRole("button", { name: "End turn" }));
    results.push(`a normal turn: ${taps() - t0} taps; now up: ${(await page.locator(".top .turn").innerText()).replace(/\s+/g, " ")}`);
    await tap(page.locator(".toast button", { hasText: "Undo" }));
    const up2 = await page.locator(".top .turn").innerText();
    results.push(`after one Undo the top bar says: ${up2.replace(/\s+/g, " ")}; toast: ${(await page.locator(".toast").innerText().catch(() => "")).replace(/\s+/g, " ")}`);
    await ctx.close();
  }

  // B. Someone else's turn, with help.
  {
    const { ctx, page, tap } = await fresh(browser, { seat: "Federation of Sol", scenario: "action", dark: true });
    await page.screenshot({ path: `${out}/B1-watching-dark.png` });
    results.push(`first control on Now (not your turn): y=${await firstControlY(page)}`);
    await tap(page.getByRole("button", { name: /Do it for Creuss/ }));
    await page.screenshot({ path: `${out}/B2-helping.png` });
    await ctx.close();
  }

  // C. Status: give Support for the Throne, score a public objective.
  {
    const { ctx, page, tap, taps } = await fresh(browser, { seat: "Federation of Sol", scenario: "status" });
    await page.screenshot({ path: `${out}/C1-status.png` });
    await smallTargets(page, "status");
    const b = taps();
    await tap(page.locator("main button", { hasText: /^(Give|Move)$/ }));
    await tap(page.locator(".sheet .pick button:not([disabled])").first());
    await page.screenshot({ path: `${out}/C2-give-sentence.png` });
    await tap(page.getByRole("button", { name: "Confirm" }));
    results.push(`give Support for the Throne: ${taps() - b} taps`);
    const b2 = taps();
    await tap(page.locator("main button", { hasText: "Score public" }));
    await page.screenshot({ path: `${out}/C3-score-sheet.png` });
    await tap(page.locator(".sheet .opt:not([disabled])").first());
    results.push(`score a public objective: ${taps() - b2} taps`);
    await page.screenshot({ path: `${out}/C4-after-score.png` });
    await ctx.close();
  }

  // D. Agenda: cast all votes.
  {
    const probe = await fresh(browser, { seat: "", scenario: "agenda" });
    const waiting = await probe.page.locator("main li", { hasText: /Waiting|Voting/ }).first().innerText().catch(() => "");
    await probe.ctx.close();
    const seatName = { Sol: "Federation of Sol", Creuss: "Ghosts of Creuss", "Vuil'raith": "Vuil'raith Cabal", Mahact: "Mahact Gene-Sorcerers", "Naaz-Rokha": "Naaz-Rokha Alliance", "Jol-Nar": "Universities of Jol-Nar" };
    const short = Object.keys(seatName).find((k) => waiting.startsWith(k)) || "Sol";
    const { ctx, page, tap, taps } = await fresh(browser, { seat: seatName[short], scenario: "agenda" });
    await page.screenshot({ path: `${out}/D1-agenda.png` });
    await page.screenshot({ path: `${out}/D1-agenda-full.png`, fullPage: true });
    await smallTargets(page, "agenda");
    const avail = await page.locator(".stepper output").innerText().catch(() => "?");
    const plusDisabled = await page.getByRole("button", { name: "One more vote" }).isDisabled().catch(() => null);
    const b = taps();
    await tap(page.locator("main .pick button").first());
    await tap(page.locator("main button", { hasText: /^Cast \d+ vote/ }));
    results.push(`cast all ${avail} votes (${short}): ${taps() - b} taps; "+" disabled at the cap: ${plusDisabled}`);
    await page.screenshot({ path: `${out}/D2-after-vote.png` });
    await ctx.close();
  }

  // E. Strategy pick.
  {
    const { ctx, page, tap, taps } = await fresh(browser, { seat: "Naaz-Rokha Alliance", scenario: "strategy" });
    await page.screenshot({ path: `${out}/E1-strategy.png` });
    await page.screenshot({ path: `${out}/E1-strategy-full.png`, fullPage: true });
    await smallTargets(page, "strategy");
    await ctx.close();
  }

  // F. Other tabs and sheets.
  {
    const { ctx, page, tap } = await fresh(browser, { seat: "Federation of Sol", scenario: "late" });
    await page.screenshot({ path: `${out}/F1-late-now.png` });
    for (const tab of ["Table", "Map", "Log"]) {
      await tap(page.locator(".tabs button", { hasText: tab }));
      await page.screenshot({ path: `${out}/F-${tab.toLowerCase()}.png` });
      await smallTargets(page, tab);
    }
    await tap(page.locator(".tabs button", { hasText: "Table" }));
    await tap(page.locator("main .opt").first());
    await page.screenshot({ path: `${out}/F-player-sheet.png` });
    await page.screenshot({ path: `${out}/F-player-sheet-full.png`, fullPage: true });
    await ctx.close();
  }

  // G. Watch the real game, and the end screen; tablet layout.
  {
    const { ctx, page, tap } = await fresh(browser, { seat: "Federation of Sol", scenario: "action" });
    await tap(page.getByRole("button", { name: "Change", exact: true }));
    await tap(page.locator(".sheet .opt", { hasText: "Step through round 3" }));
    for (let k = 0; k < 12; k++) await tap(page.getByRole("button", { name: "Forward one step" }));
    await page.screenshot({ path: `${out}/G1-watch.png` });
    await ctx.close();
    const end = await fresh(browser, { seat: "Federation of Sol", scenario: "end" });
    await end.page.screenshot({ path: `${out}/G2-end.png` });
    await end.ctx.close();
    const tab = await fresh(browser, { seat: "Federation of Sol", scenario: "action", device: "iPad Pro 11 landscape" });
    await tab.page.screenshot({ path: `${out}/G3-tablet.png` });
    await tab.ctx.close();
  }

  await browser.close();
  console.log(results.join("\n"));
  console.log("\nPROBLEMS:\n" + (problems.length ? problems.join("\n") : "none"));
})().catch((e) => { console.error(e); console.log(results.join("\n")); console.log("\nPROBLEMS:\n" + problems.join("\n")); process.exit(1); });
