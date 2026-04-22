#!/usr/bin/env node
/**
 * Luna — hero video compression.
 *
 * Takes the 5 hero/ambient MP4s in assets/ and emits 720p H.264 (CRF 24,
 * slow preset, audio stripped) to assets/compressed/. Output is what we
 * upload to Cloudflare R2 as the production CDN surface.
 *
 * Source files are .gitignore'd locally-only assets; the compressed
 * outputs are also .gitignore'd (same `assets/*.mp4` rule).
 *
 * Run:  npm run compress:video
 */
const fs         = require("fs");
const path       = require("path");
const { execFileSync } = require("child_process");

let ffmpegBin;
try {
  ffmpegBin = require("ffmpeg-static");
} catch (err) {
  console.error(
    "ffmpeg-static is not installed. This is a local-only dev dependency —\n" +
    "the compression pipeline is never meant to run on Railway or CI.\n\n" +
    "Install it into this project only:\n" +
    "  npm install --no-save ffmpeg-static\n\n" +
    "Then re-run:\n" +
    "  npm run compress:video\n"
  );
  process.exit(1);
}

const ROOT   = path.resolve(__dirname, "..");
const IN_DIR = path.join(ROOT, "assets");
const OUT_DIR= path.join(ROOT, "assets", "compressed");

// Each entry keeps the filename identical so the HTML src only needs a
// prefix swap when we wire up the R2 CDN.
const SOURCES = [
  "video-welcome.mp4",
  "video-arriving.mp4",
  "video-miami.mp4",
  "dropping-off-airplane.mp4",
  "opening-door.mp4"
];

// H.264 720p, decent quality, web-friendly. The `-movflags +faststart`
// puts the moov atom at the head so <video> starts playing before the
// full file buffers — critical for autoplay heroes.
const FFMPEG_ARGS = (inPath, outPath) => [
  "-y",
  "-i", inPath,
  "-vf", "scale=-2:720",   // -2 → keep aspect ratio, width auto, even
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "24",
  "-profile:v", "high",
  "-level", "4.0",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-an",                   // audio stripped — all heroes are muted anyway
  outPath
];

function bytesToMb (n) { return (n / (1024 * 1024)).toFixed(1) + "MB"; }

function compressOne (name) {
  const inPath  = path.join(IN_DIR, name);
  const outPath = path.join(OUT_DIR, name);
  if (!fs.existsSync(inPath)) {
    console.warn("  SKIP — source missing:", name);
    return null;
  }

  const beforeSize = fs.statSync(inPath).size;
  const started    = Date.now();

  try {
    execFileSync(ffmpegBin, FFMPEG_ARGS(inPath, outPath), {
      stdio: ["ignore", "ignore", "pipe"]
    });
  } catch (err) {
    console.error("  FAILED —", name);
    console.error(err.stderr ? err.stderr.toString().slice(-600) : err.message);
    return null;
  }

  const afterSize = fs.statSync(outPath).size;
  const took      = ((Date.now() - started) / 1000).toFixed(1);
  const saved     = ((1 - afterSize / beforeSize) * 100).toFixed(0);

  console.log(
    "  ✔ " + name.padEnd(28) +
    bytesToMb(beforeSize).padStart(8) + " → " +
    bytesToMb(afterSize).padStart(8) +
    " (-" + saved + "%, " + took + "s)"
  );

  return { name, beforeSize, afterSize, took: Number(took) };
}

function main () {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Compressing " + SOURCES.length + " source videos → 720p H.264...");
  console.log("  ffmpeg: " + ffmpegBin);
  console.log("");

  const results = SOURCES.map(compressOne).filter(Boolean);

  if (results.length === 0) {
    console.log("\nNothing compressed. Put source .mp4s in assets/ and retry.");
    process.exit(1);
  }

  const totalBefore = results.reduce((s, r) => s + r.beforeSize, 0);
  const totalAfter  = results.reduce((s, r) => s + r.afterSize,  0);
  const totalSaved  = ((1 - totalAfter / totalBefore) * 100).toFixed(0);

  console.log("");
  console.log("TOTAL  " + bytesToMb(totalBefore) + " → " + bytesToMb(totalAfter) +
    " (-" + totalSaved + "%)");
  console.log("");
  console.log("Outputs ready in assets/compressed/. Next: upload to Cloudflare R2");
  console.log("and set window.LunaConfig.videoCdn in config.js to the R2 domain.");
}

main();
