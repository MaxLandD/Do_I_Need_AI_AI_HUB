// Render the animation page to PNG frames with headless Chromium.
//
//   node render.js stills <outDir> <t1> <t2> ...     review stills at given times
//   node render.js frames <outDir> [workers]          every frame of the video
//   node render.js cues <out.json>                    dump cue times (used by the mix)
//   node render.js thumb <out.png> <t>                captionless still
//
// Uses the Playwright that ships with this environment; set NODE_PATH if needed.
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const PAGE = "file://" + path.join(__dirname, "animation", "index.html");

async function openPage(browser, query = "") {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => { console.error("page error:", e.message); process.exitCode = 1; });
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(PAGE + query);
  await page.evaluate(() => window.ready);
  return page;
}

async function shot(page, t, file) {
  await page.evaluate((tt) => window.render(tt), t);
  await page.screenshot({ path: file, type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

(async () => {
  const [mode, out, ...rest] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--font-render-hinting=none", "--disable-lcd-text", "--allow-file-access-from-files"],
  });
  try {
    if (mode === "cues") {
      const page = await openPage(browser);
      const cues = await page.evaluate(() => ({ cues: window.CUES, timing: { duration: window.TIMING.duration, frames: window.TIMING.frames, fps: window.TIMING.fps, voOffset: window.TIMING.voOffset } }));
      fs.writeFileSync(out, JSON.stringify(cues, null, 1));
      console.log("cues written", out);
    } else if (mode === "stills") {
      fs.mkdirSync(out, { recursive: true });
      const page = await openPage(browser);
      for (const s of rest) {
        const t = parseFloat(s);
        await shot(page, t, path.join(out, `t${t.toFixed(2).padStart(6, "0")}.png`));
      }
      console.log("stills:", rest.length);
    } else if (mode === "thumb") {
      const page = await openPage(browser, "?nocap=1");
      await shot(page, parseFloat(rest[0]), out);
    } else if (mode === "frames") {
      fs.mkdirSync(out, { recursive: true });
      const workers = parseInt(rest[0] || "4", 10);
      const probe = await openPage(browser);
      const { frames, fps } = await probe.evaluate(() => ({ frames: window.TIMING.frames, fps: window.TIMING.fps }));
      await probe.close();
      let next = 0, done = 0;
      const t0 = Date.now();
      async function worker() {
        const page = await openPage(browser);
        while (true) {
          const f = next++;
          if (f >= frames) break;
          await shot(page, f / fps, path.join(out, `f${String(f).padStart(5, "0")}.png`));
          done++;
          if (done % 150 === 0) console.log(`${done}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        }
        await page.close();
      }
      await Promise.all(Array.from({ length: workers }, worker));
      console.log(`rendered ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } else {
      console.error("unknown mode", mode);
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
})();
