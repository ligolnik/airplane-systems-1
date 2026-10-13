#!/usr/bin/env node
/**
 * Airplane load in the browser, on the production build. Once each airplane's scene is complete, its final scene must equal
 * the reviewed baseline (main a1d3cdf0 plus PR47 seat placement): every mesh and line, compared as a sorted multiset of exact keys (kind, part name, attribute
 * layout, vertex and index counts, index hash) plus sums of their geometry under their local transforms, within tolerances
 * (the last bit of trig differs between runtimes; tests/scene-snapshot.test.ts measures it and checks each part to the
 * micrometre). Objects an animation moves are left out and counted. The camera framing must equal a1d3cdf0's too: the
 * SR22T overview, a system view and Reset view after a drag. Each load shows the loader, then a frame with every skin
 * shell, then no loader. The SR22T builds progressively: the deep-linked system's and the walk-around station's parts come
 * first; a part that mounts late is still found by "tap to locate"; a walk-around begun while the fuselage worker still
 * builds doesn't build the hull on the main thread and frames its first item as when the hull was there, but keeps a
 * camera move the user made meanwhile; a browser that refuses the fuselage worker builds the same scene; no build-in
 * glow under prefers-reduced-motion. Run after npm run build (it starts next start), or pass an existing server URL.
 * `--update` rewrites the baseline (scripts/test-load-ui.baseline.json): only on main before this change, or for an
 * intended model change.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const update = args.includes("--update");
const url = args.find((a) => !a.startsWith("--"));

const root = resolve(import.meta.dirname, "..");
const BASELINE = resolve(import.meta.dirname, "test-load-ui.baseline.json");

/** Starts next start on a free-ish port (as scripts/test-m20c-ui.mjs does) and waits until it answers. */
async function startServer() {
  const port = 4100 + Math.floor(Math.random() * 800);
  const base = `http://localhost:${port}`;
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
  return { server, base };
}

/** Before any page script: catch the three.js scene and the camera each frame renders with (three's devtools hook). */
function hookThree() {
  // the load's timeline: when the loader was first and last seen, and each frame's count of drawn skin shells
  const marks = (window.__marks = { loaderSeen: null, loaderGone: null, frames: 0, shells: [], parts: [] });
  // station 9's walk-around items' parts (aircraft/sr22t/walkaround.ts)
  const STATION9 = new Set([
    "Tow bar",
    "Landing light (HID, lower cowl)",
    "Nose gear strut",
    "Nose oleo cylinder",
    "Nose strut fairing",
    "Nose wheel pant",
    "Nose wheel",
    "Propeller blade",
    "Spinner",
    "Front cowl fastener",
    "Cowl inlet — cooling",
    "NACA induction duct",
    "ALT 1 — 100 A",
    "ALT 2 — 70 A",
  ]);
  // station 1's items' parts with FIKI fitted (the default): walkSteps gives 1o/1p the lift transducer, not the inlet
  const STATION1 = new Set([
    "Required documents",
    "AVIONICS switch",
    "BAT 2 switch",
    "PFD bezel",
    "Essential Distribution Bus",
    "Flap position light",
    "BAT 1 switch",
    "PFD cooling fan",
    "MFD cooling fan",
    "Avionics (IAU) cooling fan",
    "Oxygen outlet 1",
    "Oxygen outlet 2",
    "Oxygen masks and cannulas",
    "MFD bezel",
    "Fuel selector valve",
    "FLAPS switch",
    "Right flap",
    "Left flap",
    "NAV switch",
    "STROBE switch",
    "LAND switch",
    "Stall warning lift transducer",
    "Oxygen system control panel",
    "PITOT HEAT switch",
    "Heated pitot tube",
    "Alternate static knob",
    "Circuit breaker panel",
    "Fire extinguisher",
    "Armrest: egress hammer & hour meters",
    "CAPS activation T-handle",
    "CAPS activation handle cover",
    "CAPS handle safety pin",
  ]);
  new MutationObserver(() => {
    const shown = !!document.querySelector(".loader");
    if (shown) marks.loaderSeen ??= performance.now();
    else if (marks.loaderSeen !== null && marks.loaderGone === null) marks.loaderGone = performance.now();
  }).observe(document, { childList: true, subtree: true });
  const objs = (window.__three = { scenes: [], camera: null });
  const dev = new EventTarget();
  dev.addEventListener("observe", (e) => {
    const d = e.detail;
    if (d?.isScene) objs.scenes.push(d);
    else if (d?.isWebGLRenderer) {
      const render = d.render.bind(d);
      d.render = (scene, camera) => {
        objs.camera = camera;
        marks.frames++;
        let n = 0;
        scene.traverse((o) => {
          if (o.isMesh && o.userData.pick?.shell && o.userData.pick.sys.every((s) => s === "airframe")) n++;
        });
        if (n !== marks.shells.at(-1)?.n) marks.shells.push({ t: performance.now(), n });
        // parts mounted so far: all, electrical, station 9's, station 1's; and how many glow (a highlight material:
        // emissive >= 0.4 × colour)
        const c = {
          total: 0,
          electrical: 0,
          station9: 0,
          station1: 0,
          glow: 0,
          building: !!document.querySelector("[data-building]"),
        };
        scene.traverse((o) => {
          // a catalogue part's mesh (components/scene/Part.tsx): its pick carries a `shell` key, unset unless ghosted;
          // skin shells set it, and flows, tanks, screens, linkages and control surfaces leave it out
          if (!o.isMesh || !o.userData.pick || !("shell" in o.userData.pick) || o.userData.pick.shell) return;
          c.total++;
          const pick = o.userData.pick;
          if (pick?.sys.includes("electrical")) c.electrical++;
          if (STATION9.has(pick?.name)) c.station9++;
          if (STATION1.has(pick?.name)) c.station1++;
          const m = o.material;
          if (
            m.isMeshStandardMaterial &&
            Math.max(m.emissive.r, m.emissive.g, m.emissive.b) >= 0.4 * Math.max(m.color.r, m.color.g, m.color.b)
          )
            c.glow++;
        });
        const last = marks.parts.at(-1);
        if (!last || Object.keys(c).some((k) => c[k] !== last[k])) marks.parts.push({ t: performance.now(), ...c });
        return render(scene, camera);
      };
    }
  });
  window.__THREE_DEVTOOLS__ = dev;
  localStorage.setItem("tourDone", "1");
}

/** The scene is complete: a frame has rendered, and no load is still building (the stage carries no data-building). */
async function sceneComplete(page) {
  // Updating a final-scene baseline does not measure progressive ordering; finish through the visible user control.
  if (update) {
    await page.waitForFunction(
      () =>
        window.__three?.camera &&
        (!document.querySelector("[data-building]") || document.querySelector(".loader-skip")),
      null,
      { timeout: 120_000 },
    );
    const addAll = page.getByRole("button", { name: "Add all the remaining parts now", exact: true });
    if (await addAll.isVisible()) {
      try {
        await addAll.click({ timeout: 30000 });
      } catch (error) {
        if (await page.locator("[data-building]").count()) throw error;
      }
    }
  }
  await page.waitForFunction(() => window.__three?.camera && !document.querySelector("[data-building]"), null, {
    timeout: 120_000,
  });
}

/** Clipped skins and the extruded front-baffle outline can triangulate differently in Node and Chromium.
 * Compare their surface area and centroid instead of sums weighted by repeated triangle vertices.
 * The front baffle's measured area/centroid difference across those runtimes is below 1e-10. */
const REMESHED = ["Fuselage", "Left cabin door", "Right cabin door", "Baggage door", "Front baffle"];
/** Absolute tolerances of the scene sums (m for positions); measured noise across runtimes: 7.2e-7, 2.3e-6, 1.5e-8. */
const TOL = {
  position: 5e-6,
  normal: 5e-5,
  uv: 5e-6,
  transform: 1e-8 /* relative above 1 */,
  area: 1e-3,
  centroid: 1e-3,
};

/** Every mesh and line, in scene order: an exact key (FNV-1a over text and integers) and its numbers. */
const objectSummaries = (page, remeshed) =>
  page.evaluate((remeshed) => {
    const fnv = (h, ints) => {
      for (let i = 0; i < ints.length; i++) h = Math.imul(h ^ ints[i], 16777619) >>> 0;
      return h;
    };
    const text = (s) => Array.from(s, (c) => c.charCodeAt(0));
    const scene = window.__three.scenes.find((s) => s.children.length);
    const out = [];
    scene.traverse((o) => {
      if (!o.isMesh && !o.isLine) return;
      // Compare the original triangle stream: exact indexing changes storage, not the reviewed surface.
      const g = o.geometry.userData.unindexedSource ? o.geometry.toNonIndexed() : o.geometry,
        p = g.attributes.position.array,
        n = p.length / 3,
        name = o.userData.pick?.name ?? "",
        skin = remeshed.includes(name);
      o.updateMatrix();
      const e = o.matrix.elements;
      const layout = Object.keys(g.attributes)
        .sort()
        .map((k) => `${k}:${g.attributes[k].itemSize}`)
        .join(" ");
      let key = fnv(0x811c9dc5, text(`${o.type}|${name}|${layout}`));
      if (!skin) key = fnv(fnv(key, [n, g.index?.count ?? -1]), g.index?.array ?? []);
      // positions under the local transform, summed: A·Σv + n·t
      const v = [0, 0, 0];
      for (let i = 0; i < p.length; i++) v[i % 3] += p[i];
      const pos = [0, 1, 2].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + n * e[r + 12]);
      const sum = (a, k, fold) => {
        const s = new Array(k).fill(0);
        if (a) for (let i = 0; i < a.length; i++) s[i % k] += fold && i % k === 0 ? Math.min(a[i], 1 - a[i]) : a[i];
        return s;
      };
      const transform = [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()];
      let area = [0, 0, 0, 0];
      if (skin) {
        const idx = g.index?.array,
          m = idx ? idx.length : n;
        for (let t = 0; t < m; t += 3) {
          const [a, b, d] = [0, 1, 2].map((j) => 3 * (idx ? idx[t + j] : t + j));
          const u = [0, 1, 2].map((i) => p[b + i] - p[a + i]),
            w = [0, 1, 2].map((i) => p[d + i] - p[a + i]);
          const s = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
          area[0] += s;
          for (let i = 0; i < 3; i++) area[i + 1] += (s * (p[a + i] + p[b + i] + p[d + i])) / 3;
        }
        area = [area[0], area[1] / area[0], area[2] / area[0], area[3] / area[0]];
      }
      out.push({
        key,
        name,
        skin,
        position: skin ? [0, 0, 0] : pos,
        normal: skin ? [0, 0, 0] : sum(g.attributes.normal?.array, 3),
        // u or 1 − u on a few seam vertices depends on the runtime: u is summed as min(u, 1 − u)
        uv: skin ? [0, 0] : sum(g.attributes.uv?.array, 2, true),
        transform,
        area,
      });
      if (g !== o.geometry) g.dispose();
    });
    return out;
  }, remeshed);

/** Final-scene fingerprint: summaries taken twice, at least 400 ms and one rendered frame apart; objects that changed in
 * between are animated and left out. The exact keys form a sorted multiset hash; the numbers are summed over the scene. */
async function fingerprint(page) {
  const a = await objectSummaries(page, REMESHED);
  // Animations advance only on rendered frames, and the software renderer can stall past 400 ms: wait for a frame too.
  const frame = await page.evaluate(() => window.__marks.frames);
  await page.waitForTimeout(400);
  await page.waitForFunction((f) => window.__marks.frames > f, frame);
  const b = await objectSummaries(page, REMESHED);
  assert.equal(a.length, b.length, "the scene changed size while settled");
  const stable = a.filter((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
  let h = 0x811c9dc5;
  for (const k of stable.map((x) => x.key).sort((x, y) => x - y)) h = Math.imul(h ^ k, 16777619) >>> 0;
  const total = (f) =>
    stable.reduce(
      (s, x) => s.map((v, i) => v + f(x)[i]),
      f(stable[0]).map(() => 0),
    );
  return {
    objects: a.length,
    animated: a.length - stable.length,
    multiset: h.toString(16),
    sums: { position: total((x) => x.position), normal: total((x) => x.normal), uv: total((x) => x.uv) },
    transform: total((x) => x.transform),
    skins: stable
      .filter((x) => x.skin)
      .map((x) => [x.name, ...x.area])
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1])),
  };
}

/** Differences beyond tolerance between two scene fingerprints, as readable lines. */
function sceneDiff(got, want) {
  const out = [];
  for (const k of ["objects", "animated", "multiset"]) if (got[k] !== want[k]) out.push(`${k} ${got[k]} vs ${want[k]}`);
  for (const k of ["position", "normal", "uv"])
    got.sums[k].forEach(
      (v, i) => !(Math.abs(v - want.sums[k][i]) <= TOL[k]) && out.push(`${k} sum ${got.sums[k]} vs ${want.sums[k]}`),
    );
  got.transform.forEach(
    (v, i) =>
      !(Math.abs(v - want.transform[i]) <= TOL.transform * Math.max(1, Math.abs(want.transform[i]))) &&
      out.push(`transform sum ${got.transform} vs ${want.transform}`),
  );
  if (got.skins.length !== want.skins.length) out.push(`skins ${got.skins.length} vs ${want.skins.length}`);
  got.skins.forEach(([name, area, ...c], i) => {
    const [wname, warea, ...wc] = want.skins[i] ?? [];
    if (
      name !== wname ||
      !(Math.abs(area - warea) <= TOL.area * warea) ||
      c.some((v, j) => !(Math.abs(v - wc[j]) <= TOL.centroid))
    )
      out.push(`skin ${name} ${[area, ...c]} vs ${wname} ${[warea, ...wc]}`);
  });
  return [...new Set(out)];
}
const cameraDiff = (got, want) => got.length !== want.length || got.some((v, i) => !(Math.abs(v - want[i]) <= 1e-3));

/** The camera once it has stopped (flights take 1 s; damping settles after): position and view direction, rounded. */
async function settledCamera(page) {
  // Wait for rendered frames after a camera request; timers alone can sample stale OrbitControls orientation.
  const frame = await page.evaluate(() => window.__marks.frames);
  await page.waitForFunction((f) => window.__marks.frames >= f + 2, frame);
  const read = () =>
    page.evaluate(() => {
      const c = window.__three.camera;
      c.updateMatrixWorld();
      const d = c.getWorldDirection(c.position.clone());
      return [...c.position.toArray(), ...d.toArray()].map((v) => Math.round(v * 1e4) / 1e4 + 0); // + 0: JSON writes -0 as 0
    });
  let last = await read();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    const now = await read();
    if (now.every((v, k) => v === last[k])) return now;
    last = now;
  }
  throw new Error(`camera never settled: ${last}`);
}

/** The loader is up from the first paint, a frame then draws every skin shell, and the loader goes once the scene is complete. */
async function loaderThenScene(page, route) {
  const m = await page.evaluate(() => window.__marks);
  const all = m.shells.at(-1)?.n ?? 0;
  const shellsAt = m.shells.find((x) => x.n === all)?.t;
  assert.ok(all > 0, `${route}: skin shells drawn`);
  assert.ok(m.loaderSeen !== null, `${route}: loader shown`);
  assert.ok(m.loaderGone !== null, `${route}: loader gone`);
  assert.ok(
    m.loaderSeen <= shellsAt && shellsAt <= m.loaderGone,
    `${route}: loader, then shells, then no loader ${JSON.stringify(m)}`,
  );
}

const ROUTES = ["/sr22t", "/sr22t/electrical", "/sr20", "/c172s", "/c182t", "/da40", "/m20c"];
// explicit views: a bare /sr22t reopens the last system viewed in this browser
const CAMERAS = [
  "/sr22t/overview",
  "/sr22t/overview?cam=iso",
  "/sr22t/overview?cam=top",
  "/sr22t/electrical",
  "/sr22t/electrical?cam=side",
];

let server, browser;
try {
  let base = url;
  if (!url) ({ server, base } = await startServer());
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(hookThree);
  // analytics has no bearing on the scene and need not contact a deployment
  await context.route("**/_vercel/**", (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const got = { scenes: {}, cameras: {} };

  for (const route of ROUTES) {
    await page.goto(base + route);
    await sceneComplete(page);
    if (!update) await loaderThenScene(page, route);
    got.scenes[route] = await fingerprint(page);
    const { objects, animated, multiset } = got.scenes[route];
    console.log(`${route}: ${JSON.stringify({ objects, animated, multiset })}`);
  }
  for (const route of CAMERAS) {
    await page.goto(base + route);
    await sceneComplete(page);
    got.cameras[route] = await settledCamera(page);
  }
  // Reset view after a drag: back to the overview framing
  await page.goto(base + "/sr22t/overview");
  await sceneComplete(page);
  await settledCamera(page);
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await page.locator(".toolbar").getByRole("button", { name: "Reset view", exact: true }).click();
  got.cameras["/sr22t/overview Reset view after a drag"] = await settledCamera(page);
  console.log(`cameras: ${JSON.stringify(got.cameras)}`);
  assert.ok(
    !cameraDiff(got.cameras["/sr22t/overview Reset view after a drag"], got.cameras["/sr22t/overview"]),
    "Reset view restores the overview position and direction",
  );
  // This invariant replaces a redundant baseline that previously captured an unsettled post-drag direction.
  delete got.cameras["/sr22t/overview Reset view after a drag"];

  if (!update) {
    // the deep-linked system's parts, and the walk-around station's, are added first; the overview adds them later
    const firstDone = async (route, key) => {
      await page.goto(base + route);
      await sceneComplete(page);
      const h = await page.evaluate(() => window.__marks.parts);
      const final = h.at(-1);
      const done = h.find((x) => x[key] === final[key]);
      return done.total / final.total;
    };
    const el = await firstDone("/sr22t/electrical", "electrical"),
      elOverview = await firstDone("/sr22t/overview", "electrical");
    assert.ok(
      el < 0.6 && el < elOverview,
      `electrical parts first on /sr22t/electrical: ${el} of the parts (overview ${elOverview})`,
    );
    const walk = await firstDone("/sr22t?walk=9", "station9"),
      walkOverview = await firstDone("/sr22t/overview", "station9");
    assert.ok(
      walk < 0.25 && walk < walkOverview,
      `station 9's parts first on ?walk=9: ${walk} (overview ${walkOverview})`,
    );
    // station 1 with FIKI fitted: its items' configured parts, the lift transducer included
    const walk1 = await firstDone("/sr22t?walk=1", "station1"),
      walk1Overview = await firstDone("/sr22t/overview", "station1");
    assert.ok(
      walk1 < 0.25 && walk1 < walk1Overview,
      `station 1's configured parts first on ?walk=1: ${walk1} (overview ${walk1Overview})`,
    );
    console.log(
      `Build order: electrical done at ${el.toFixed(2)} (overview ${elOverview.toFixed(2)}), station 9 at ${walk.toFixed(2)} (overview ${walkOverview.toFixed(2)}), station 1 at ${walk1.toFixed(2)} (overview ${walk1Overview.toFixed(2)})`,
    );
  }

  assert.deepEqual(errors, [], "No application runtime errors");
  await context.close();

  if (!update) {
    // "tap to locate" on a part not mounted yet: the camera goes to it once it mounts
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      await ctx.addInitScript(() => (window.__buildHold = ["Oxygen bottle — 77 cu ft"]));
      const p = await ctx.newPage();
      await p.goto(base + "/sr22t/oxygen");
      await p.waitForSelector(".loader-bar");
      await p.locator(".parts button", { hasText: "Oxygen bottle — 77 cu ft" }).click();
      await p.evaluate(() => delete window.__buildHold);
      await sceneComplete(p);
      await settledCamera(p);
      const d = await p.evaluate(() => {
        let part;
        window.__three.scenes
          .find((s) => s.children.length)
          .traverse((o) => {
            if (o.isMesh && o.userData.pick?.name === "Oxygen bottle — 77 cu ft") part ??= o;
          });
        const g = part.geometry;
        g.computeBoundingSphere();
        return part.localToWorld(g.boundingSphere.center.clone()).distanceTo(window.__three.camera.position);
      });
      assert.ok(Math.abs(d - 2.6) < 0.01, `located the late part: camera ${d} m from it (2.6 m expected)`);
      console.log(`Tap to locate a part before it mounts: the camera flies to it once it does (${d.toFixed(3)} m)`);
      await ctx.close();
    }

    // the walk-around begun while the fuselage worker is still building (its answer held back): the item is framed without
    // building the hull on the main thread (no long task), the card works, and once the worker answers the camera settles
    // where it does when the hull was there from the start. Items 2a and 11a step back from the airplane (its outline).
    const holdWorker = () => {
      const W = window.Worker;
      const held = [];
      window.__holdWorker = true;
      window.__releaseWorker = () => {
        window.__holdWorker = false;
        held.splice(0).forEach((deliver) => deliver());
      };
      window.Worker = class extends W {
        set onmessage(f) {
          super.onmessage = (e) => (window.__holdWorker ? held.push(() => f(e)) : f(e));
        }
        get onmessage() {
          return super.onmessage;
        }
      };
      window.__longTasks = [];
      new PerformanceObserver((l) =>
        window.__longTasks.push(...l.getEntries().map((e) => [e.startTime, e.duration])),
      ).observe({
        type: "longtask",
        buffered: true,
      });
    };
    const beginWalk = async (station, hold) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      if (hold) await ctx.addInitScript(holdWorker);
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(base + `/sr22t?walk=${station}`);
      if (!hold) await sceneComplete(p);
      const begin = p.getByRole("button", { name: `Begin at station ${station}`, exact: true });
      await begin.waitFor();
      // from just before Begin: the framing runs while Begin is handled
      const t0 = await p.evaluate(() => performance.now());
      await begin.click();
      const first = `${station}a`;
      await p.waitForFunction((id) => document.querySelector(".walk-id")?.textContent === id, first);
      let longest = null;
      if (hold) {
        // the card works meanwhile: forward a step and back
        await p.getByRole("button", { name: "Next item" }).click();
        await p.waitForFunction((id) => document.querySelector(".walk-id")?.textContent !== id, first);
        await p.getByRole("button", { name: "Previous item" }).click();
        await p.waitForFunction((id) => document.querySelector(".walk-id")?.textContent === id, first);
        await p.waitForTimeout(1500);
        assert.ok(
          await p.locator("[data-building]").count(),
          `?walk=${station}: still building while the worker is held`,
        );
        longest = await p.evaluate(
          (t) => Math.max(0, ...window.__longTasks.filter(([s]) => s >= t).map(([, d]) => d)),
          t0 - 50,
        );
        await p.evaluate(() => window.__releaseWorker());
      }
      await sceneComplete(p);
      // a new station: the camera goes to the station, then to the item after the panel's 1.1 s settle (STATION_SETTLE_MS)
      await p.waitForTimeout(1600);
      const camera = await settledCamera(p);
      assert.deepEqual(errs, [], "No application runtime errors");
      await ctx.close();
      return { camera, longest };
    };
    const framed = {};
    for (const station of [2, 11]) {
      const held = await beginWalk(station, true),
        onTime = await beginWalk(station, false);
      framed[station] = onTime.camera;
      assert.ok(
        held.longest < 400,
        `?walk=${station}: no main-thread hull build while the worker builds it (longest task ${held.longest} ms)`,
      );
      assert.deepEqual(
        held.camera,
        onTime.camera,
        `?walk=${station}: ${station}a framed as when the hull was there from the start`,
      );
      console.log(
        `?walk=${station} begun while the worker builds the hull: longest task ${Math.round(held.longest)} ms, camera ${held.camera}`,
      );
    }

    // a camera move the user makes while the worker still builds the fuselage is kept when it answers: on the intro screen,
    // and on an item (2a) shown from its station while it waited for the hull, also when the viewport is resized during
    // the press. A tap there moves nothing, so 2a is still framed when the worker answers (and a tap on a part still
    // shows its note); nor does a taller viewport during a tap that stops a flight in from the zoom limit
    for (const where of ["intro", "2a", "2a resize", "2a tap", "2a clamp"]) {
      const tap = where === "2a tap",
        resize = where === "2a resize",
        clamp = where === "2a clamp";
      // the clamp case taps during a camera flight, so it needs the flights (reduced motion jumps the camera)
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: clamp ? "no-preference" : "reduce",
      });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      await ctx.addInitScript(holdWorker);
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(base + "/sr22t?walk=2");
      const begin = p.getByRole("button", { name: "Begin at station 2", exact: true });
      await begin.waitFor();
      if (where !== "intro") {
        await begin.click();
        await p.waitForFunction(() => document.querySelector(".walk-id")?.textContent === "2a");
        await p.waitForTimeout(1600); // the station, then the item after the panel's settle (STATION_SETTLE_MS)
      }
      const still = await settledCamera(p);
      const box = await p.locator("canvas").boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      let moved;
      if (clamp) {
        // zoom out until the camera stops: the controls' 70 m limit (a user move, so 2a's wait is over)
        for (let i = 0, last = still; ; i++) {
          assert.ok(i < 30, `${where}: the zoom never reached its limit`);
          for (let k = 0; k < 10; k++) await p.mouse.wheel(0, 100);
          const now = await settledCamera(p);
          if (!cameraDiff(now, last)) break;
          last = now;
        }
        // a wheel step scales the distance by 0.95 (three-stdlib's zoom scale): one step in from the limit is 5% of it
        await p.mouse.wheel(0, -100);
        const nearer = await settledCamera(p);
        await p.mouse.wheel(0, 100);
        const out = await settledCamera(p);
        const dist = Math.hypot(...[0, 1, 2].map((i) => out[i] - nearer[i])) / 0.05;
        assert.ok(Math.abs(dist - 70) < 0.1, `${where}: zoomed out to the 70 m limit: ${dist} m`);
        // another item and back: 2a waits for the hull again, from a 1 s flight to the station that starts at 70 m
        await p.getByRole("button", { name: "Next item" }).click();
        await p.waitForFunction(() => document.querySelector(".walk-id")?.textContent !== "2a");
        const stepped = Date.now();
        await p.getByRole("button", { name: "Previous item" }).click();
        await p.waitForFunction(() => document.querySelector(".walk-id")?.textContent === "2a");
        // a tap early in the flight stops it still far out, and a taller viewport during the press backs the camera off
        // past the limit: the fit keeps it at the limit, so the controls don't move it again as if the user had
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.down();
        const late = Date.now() - stepped;
        assert.ok(
          late < 300,
          `${where}: the press stops the flight within 300 ms (took ${late} ms; rerun on a quieter machine)`,
        );
        console.log(`?walk=2 2a: zoomed out to ${dist.toFixed(2)} m, pressed ${late} ms after stepping back to 2a`);
        await p.setViewportSize({ width: 1440, height: 1800 });
        await settledCamera(p);
        await p.mouse.up();
        // back to the viewport 2a's on-time framing was taken at
        await p.setViewportSize({ width: 1440, height: 900 });
        moved = await settledCamera(p);
      } else {
        await p.mouse.down();
        if (resize) {
          // a taller viewport while the button is held: the app backs the camera off to fit, then the drag goes on
          await p.setViewportSize({ width: 1440, height: 1800 });
          assert.ok(cameraDiff(await settledCamera(p), still), `${where}: the viewport fit moved the camera`);
        }
        if (!tap) await p.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 60, { steps: 8 });
        await p.mouse.up();
        moved = await settledCamera(p);
        if (tap) assert.ok(!cameraDiff(moved, still), `${where}: a tap leaves the camera: ${moved} vs ${still}`);
      }
      assert.ok(await p.locator("[data-building]").count(), `${where}: still building while the worker is held`);
      await p.evaluate(() => window.__releaseWorker());
      await sceneComplete(p);
      await p.waitForTimeout(1600);
      const after = await settledCamera(p);
      if (clamp)
        assert.deepEqual(
          after,
          framed[2],
          `${where}: 2a framed as when the hull was there from the start, after a tap and a resize at the zoom limit`,
        );
      else if (tap) {
        assert.deepEqual(
          after,
          framed[2],
          `${where}: 2a framed as when the hull was there from the start, after a tap`,
        );
        // and a tap on a part (the small one nearest mid-canvas, so its middle is on it) still shows its note
        const [x, y] = await p.evaluate(() => {
          const cam = window.__three.camera;
          let best = null;
          window.__three.scenes
            .find((s) => s.children.length)
            .traverse((o) => {
              if (!o.isMesh || !o.userData.pick || !("shell" in o.userData.pick) || o.userData.pick.shell) return;
              o.geometry.computeBoundingSphere();
              const { center, radius } = o.geometry.boundingSphere;
              const v = o.localToWorld(center.clone()).project(cam),
                off = Math.hypot(v.x, v.y);
              if (radius > 0.01 && radius < 0.2 && Math.abs(v.z) < 1 && (!best || off < best.off)) best = { off, v };
            });
          return [(best.v.x + 1) / 2, (1 - best.v.y) / 2];
        });
        await p.mouse.click(box.x + box.width * x, box.y + box.height * y);
        await p.locator(".tip").waitFor();
        assert.ok(!cameraDiff(await settledCamera(p), after), `${where}: a tap on a part leaves the camera`);
      } else
        assert.ok(
          !cameraDiff(after, moved),
          `${where}: the user's camera kept when the hull arrives: ${after} vs ${moved}`,
        );
      assert.deepEqual(errs, [], "No application runtime errors");
      console.log(
        clamp
          ? "?walk=2 2a: a tap and a taller viewport at the zoom limit during the build still let 2a be framed when the worker's hull arrives"
          : tap
            ? "?walk=2 2a: a tap during the build still lets 2a be framed when the worker's hull arrives; a tap on a part shows its note"
            : `?walk=2 ${where}: a camera drag during the build${resize ? " (resized mid-press)" : ""} is kept when the worker's hull arrives`,
      );
      await ctx.close();
    }

    // A newer system request supersedes a locate request for a part still being built.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      await ctx.addInitScript(() => (window.__buildHold = ["Oxygen bottle — 77 cu ft"]));
      const p = await ctx.newPage();
      await p.goto(base + "/sr22t/oxygen");
      await p.waitForSelector(".loader-bar");
      await p.locator(".parts button", { hasText: "Oxygen bottle — 77 cu ft" }).click();
      await p.locator(".syslist button").filter({ hasText: "Electrical" }).click();
      const before = await settledCamera(p);
      await p.evaluate(() => delete window.__buildHold);
      await sceneComplete(p);
      assert.ok(!cameraDiff(await settledCamera(p), before), "late part cannot override a newer system view");
      console.log("Late locate cancelled: electrical camera remains after the oxygen bottle mounts");
      await ctx.close();
    }

    // A one-shot airplane must paint an opaque loader before synchronous geometry construction on a fleet switch.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      const p = await ctx.newPage();
      await p.goto(base + "/sr20/overview");
      await sceneComplete(p);
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await p.evaluate(() => {
        window.__switchFrames = [];
        window.__switchSampling = true;
        const sample = () => {
          if (!window.__switchSampling) return;
          const loader = document.querySelector(".loader");
          let parts = 0;
          window.__three.scenes
            .find((s) => s.children.length)
            ?.traverse((o) => {
              if (o.isMesh && o.userData.pick) parts++;
            });
          window.__switchFrames.push({
            stage: loader?.dataset.building,
            opacity: loader ? Number(getComputedStyle(loader).opacity) : 0,
            parts,
          });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await p.getByRole("button", { name: /^Switch Airplanes/ }).click();
      await p.getByRole("button", { name: /C182T Skylane/ }).click();
      await sceneComplete(p);
      const frames = await p.evaluate(() => {
        window.__switchSampling = false;
        return window.__switchFrames;
      });
      assert.ok(
        frames.some((f) => f.stage === "airframe" && f.opacity === 1 && f.parts === 0),
        `opaque loader painted before the C182T model mounted: ${JSON.stringify(frames)}`,
      );
      console.log("One-shot fleet switch: opaque loader paints before uncached C182T geometry (4x CPU slowdown)");
      await ctx.close();
    }

    // a browser that refuses to create the fuselage worker: the page builds the fuselage itself and completes the same scene
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      await ctx.addInitScript(() => {
        window.Worker = class {
          constructor() {
            throw new DOMException("Worker construction denied", "SecurityError");
          }
        };
      });
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(base + "/sr22t/overview");
      await sceneComplete(p);
      await loaderThenScene(p, "/sr22t/overview, worker refused");
      const fp = await fingerprint(p);
      assert.deepEqual(errs, [], "no page errors with the worker refused");
      assert.deepEqual(
        sceneDiff(fp, JSON.parse(readFileSync(BASELINE, "utf8")).scenes["/sr22t"]),
        [],
        "the same final scene without the worker",
      );
      console.log(`Worker refused: the scene completes on the main thread, identical (${fp.multiset})`);
      await ctx.close();
    }

    // the build-in glow: shown with motion, never with prefers-reduced-motion
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      const p = await ctx.newPage();
      await p.goto(base + "/sr22t");
      await sceneComplete(p);
      await p.waitForTimeout(500);
      const h = await p.evaluate(() => window.__marks.parts);
      const steady = h.at(-1).glow,
        during = Math.max(...h.filter((x) => x.building).map((x) => x.glow));
      if (reducedMotion === "reduce")
        assert.ok(during <= steady, `no build-in glow with reduced motion: ${during} > ${steady}`);
      else assert.ok(during > steady, `build-in glow with motion: ${during} vs ${steady} after`);
      console.log(`${reducedMotion}: most parts glowing while building ${during}, after ${steady}`);
      await ctx.close();
    }
  }

  if (update) {
    // numbers to 1e-9, well inside every tolerance
    const round = (_k, v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v);
    writeFileSync(BASELINE, JSON.stringify(got, round, 2) + "\n");
    console.log(`baseline written: ${BASELINE}`);
  } else {
    const want = JSON.parse(readFileSync(BASELINE, "utf8"));
    for (const route of ROUTES)
      assert.deepEqual(sceneDiff(got.scenes[route], want.scenes[route]), [], `final scene of ${route}`);
    for (const [k, v] of Object.entries(want.cameras))
      assert.ok(!cameraDiff(got.cameras[k], v), `camera for ${k}: ${got.cameras[k]} vs ${v}`);
    console.log("Final scenes and camera framing match the reviewed baseline");
  }
} finally {
  await browser?.close();
  server?.kill();
}
