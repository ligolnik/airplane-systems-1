#!/usr/bin/env node
/**
 * SR22T preflight walk-around in the browser, on the production build: phone (touch) and desktop (keyboard).
 * Opens it from the toolbar and from the Overview link, steps the cabin items (the CAS window comes alive on BAT 2),
 * jumps with the mini-map (station 5's flaps, station 7's drains and tire), checks the technique items (the opposite brake
 * indicators after 7c and 11e, the front cowl fasteners after 9g), resumes after a reload, finishes, exits, and opens a
 * station from the `?walk=` deep link.
 * Run after npm run build, or pass an existing server URL. `--shots <dir>` also saves screenshots there.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shots = shotsAt >= 0 ? resolve(args.splice(shotsAt, 2)[1]) : null;
const root = resolve(import.meta.dirname, "..");
const port = 4100 + Math.floor(Math.random() * 800);
const base = args[0] || `http://localhost:${port}`;

/** Starts the production server (`next start`), as test-m20c-ui does. */
async function startServer() {
  const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log = (log + d).slice(-8000)));
  server.stderr.on("data", (d) => (log = (log + d).slice(-8000)));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    assert.equal(server.exitCode, null, `Server exited: ${log}`);
    try {
      ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, `Server did not start: ${log}`);
  return server;
}

const progress = (page) => page.locator(".walk-prog").innerText();
const itemId = (page) => page.locator(".walk-id").innerText();
async function waitProgress(page, text) {
  await page.waitForFunction((t) => document.querySelector(".walk-prog")?.textContent === t, text);
}
const TECHNIQUE = "Technique (not in the POH)";
/** The card shows the technique badge, or doesn't. */
async function badge(page, shown) {
  assert.equal(
    await page.locator(".walk-tech").count(),
    shown ? 1 : 0,
    `technique badge ${shown ? "shown" : "absent"}`,
  );
  if (shown) assert.equal(await page.locator(".walk-tech").innerText(), TECHNIQUE);
}

let server, browser;
try {
  if (!args[0]) server = await startServer();
  if (shots) mkdirSync(shots, { recursive: true });
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const phone of [true, false]) {
    const kind = phone ? "phone" : "desktop";
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: phone,
      hasTouch: phone,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => localStorage.setItem("tourDone", "1"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/_vercel/**", (route) => route.abort());
    const shot = async (name) => {
      if (!shots) return;
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(shots, `${kind}-${name}.png`), fullPage: phone });
    };

    await page.goto(`${base}/sr22t/overview`);
    await page.waitForSelector("canvas");
    await page.waitForFunction(() => document.fonts.status === "loaded");
    const preflight = page.locator(".toolbar").getByRole("button", { name: "Preflight", exact: true });
    assert.equal(await preflight.getAttribute("aria-pressed"), "false");
    await shot("overview");

    // start: the toolbar on the phone, the Overview link on the desktop; the first screen says what this is
    if (phone) await preflight.click();
    else await page.getByRole("button", { name: /Start preflight walk-around/ }).click();
    await page.getByText("Study aid, not a substitute for the POH checklist.").waitFor();
    assert.equal(await preflight.getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Begin walk-around", exact: true }).click();
    await waitProgress(page, "Station 1 of 13 · item 1 of 26");
    assert.equal(await itemId(page), "1a");
    // the ramp: no display power until BAT 2 comes on at 1c
    await page.waitForFunction(() => document.querySelector(".cas .hd")?.textContent.includes("NO DISPLAY PWR"));

    // phone layout: the 3D view takes the top ~55% and the card follows it
    if (phone) {
      const stage = await page.locator(".stage").boundingBox();
      assert.ok(stage.height > 0.5 * 844 && stage.height < 0.6 * 844, `3D view height ${stage.height}`);
      assert.equal(await page.locator(".rail").isVisible(), false, "rail hidden while walking on a phone");
    } else {
      assert.ok(await page.locator(".panel .walk").isVisible(), "the card is in the right-hand panel");
    }

    // next ×N: checked, skipped, the next button and (desktop) the arrow keys
    await page.getByRole("button", { name: "✓ Checked", exact: true }).click(); // 1a
    await page.getByRole("button", { name: "Skip", exact: true }).click(); // 1b
    await page.getByRole("button", { name: "✓ Checked", exact: true }).click(); // 1c: BAT 2 ON
    await waitProgress(page, "Station 1 of 13 · item 4 of 26");
    assert.equal(await itemId(page), "1d");
    await page.waitForFunction(() => !document.querySelector(".cas .hd")?.textContent.includes("NO DISPLAY PWR"));
    await shot("cabin-1d");
    if (phone) await page.getByRole("button", { name: "Next item" }).click();
    else await page.keyboard.press("ArrowRight");
    await waitProgress(page, "Station 1 of 13 · item 5 of 26");
    if (phone) await page.getByRole("button", { name: "Previous item" }).click();
    else await page.keyboard.press("ArrowLeft");
    await waitProgress(page, "Station 1 of 13 · item 4 of 26");

    // jump via the mini-map: past the cabin the flaps are down (1m), batteries off (1u)
    await page.getByRole("button", { name: /^Station 5: Right Wing Trailing Edge/ }).click();
    await waitProgress(page, "Station 5 of 13 · item 1 of 4");
    assert.equal(await itemId(page), "5a");
    await shot("station5-flap-jump");
    await page.getByRole("button", { name: /^Station 7: Right Forward Wing and Main Gear/ }).click();
    await waitProgress(page, "Station 7 of 13 · item 1 of 8");
    assert.equal(await itemId(page), "7a");
    await page.getByRole("button", { name: "Next item" }).click();
    await page.getByRole("button", { name: "Next item" }).click();
    await waitProgress(page, "Station 7 of 13 · item 3 of 8");
    assert.equal(await page.locator(".walk-std").innerText(), "DRAIN AND SAMPLE");
    await badge(page, false);
    await shot("station7-fuel-drains");
    // 7c+: from the right drains, the LEFT wheel's brake temperature indicator, with the line of sight on the mini-map
    await page.getByRole("button", { name: "Next item" }).click();
    await waitProgress(page, "Station 7 of 13 · item 4 of 8");
    assert.equal(await itemId(page), "7c+");
    await badge(page, true);
    await page.getByText("Looking across at the LEFT main wheel", { exact: true }).waitFor();
    assert.equal(await page.locator(".walk-map .sight").count(), 1, "line of sight on the mini-map");
    await shot("station7-brake-indicator-left");
    await page.getByRole("button", { name: "Next item" }).click();
    await page.getByRole("button", { name: "Next item" }).click();
    await waitProgress(page, "Station 7 of 13 · item 6 of 8");
    assert.equal(await itemId(page), "7e");
    assert.equal(await page.locator(".walk-map .sight").count(), 0, "no line of sight on a POH item");
    await shot("station7-main-wheel");
    await page.getByRole("button", { name: "Next item" }).click();
    assert.equal(await itemId(page), "7f");
    await page.getByText("Indicator checked from the other side, see 11e.", { exact: true }).waitFor();
    await badge(page, false);
    await shot("station7-wheel-brakes");
    await page.getByRole("button", { name: /^Station 9: Nose Gear/ }).click();
    await page.getByText("Keep clear of propeller rotation plane.", { exact: false }).waitFor();
    await shot("station9-prop");
    // 9g+: the front cowl fasteners behind the spinner, with the propeller warning still on the card
    for (let i = 0; i < 7; i++) await page.getByRole("button", { name: "Next item" }).click();
    await waitProgress(page, "Station 9 of 13 · item 8 of 10");
    assert.equal(await itemId(page), "9g+");
    await badge(page, true);
    assert.equal(await page.locator(".walk-std").innerText(), "PRESENT AND SECURE");
    await page.getByText("Keep clear of propeller rotation plane.", { exact: false }).waitFor();
    await shot("station9-cowl-fasteners");
    // 11e+: from the left drains, the RIGHT wheel's indicator
    await page.getByRole("button", { name: /^Station 11: Left Main Gear/ }).click();
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next item" }).click();
    await waitProgress(page, "Station 11 of 13 · item 6 of 8");
    assert.equal(await itemId(page), "11e+");
    await badge(page, true);
    await page.getByText("Looking across at the RIGHT main wheel", { exact: true }).waitFor();
    assert.equal(await page.locator(".walk-map .sight").count(), 1, "line of sight on the mini-map");
    await shot("station11-brake-indicator-right");

    // resume after a reload
    await page.getByRole("button", { name: /^Station 12: Left Wing Tip/ }).click();
    await page.getByRole("button", { name: "Next item" }).click();
    await waitProgress(page, "Station 12 of 13 · item 2 of 4");
    await page.reload();
    await page.getByText("Resume walk-around?").waitFor();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await waitProgress(page, "Station 12 of 13 · item 2 of 4");
    assert.equal(await itemId(page), "12b");

    // larger text
    const before = await page.locator(".walk-std").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    await page.getByLabel("Larger text").check();
    const after = await page.locator(".walk-std").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert.ok(after > before, `larger text: ${before} → ${after}`);
    await page.getByLabel("Larger text").uncheck();

    // finish: the last station, every item checked
    await page.getByRole("button", { name: /^Station 13: Left Wing Trailing Edge/ }).click();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "✓ Checked", exact: true }).click();
    await page.getByText("Walk-around complete").waitFor();
    await page.getByText("Before Engine Start").waitFor();
    assert.match(await page.locator(".walk-sum").innerText(), /Checked\s+6/);
    assert.match(await page.locator(".walk-sum").innerText(), /Technique items\s+0 of 3 checked/);
    await shot("finish");

    // exit: the airplane is back as it was (engine running, displays powered)
    await page.locator(".walk-done").getByRole("button", { name: "Exit", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".walk"));
    assert.equal(await preflight.getAttribute("aria-pressed"), "false");
    await page.waitForFunction(() => !document.querySelector(".cas .hd")?.textContent.includes("NO DISPLAY PWR"));

    // the deep link opens a station after the first screen
    await page.goto(`${base}/sr22t?walk=9`);
    await page.getByText("Study aid, not a substitute for the POH checklist.").waitFor();
    await page.getByRole("button", { name: "Begin at station 9", exact: true }).click();
    await waitProgress(page, "Station 9 of 13 · item 1 of 10");
    assert.equal(new URL(page.url()).searchParams.get("walk"), null, "the deep link leaves the address bar");
    await page.getByRole("button", { name: "Exit the walk-around" }).click();

    assert.deepEqual(errors, [], "No application runtime errors");
    console.log(`${phone ? "Touch / phone" : "Pointer + keyboard / desktop"}: walk-around checks passed`);
    await context.close();
  }
} finally {
  await browser?.close();
  server?.kill();
}
