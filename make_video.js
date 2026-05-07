// Generates a 20-second 1280x720 landscape promo video for CrazyGames.
// Run: node make_video.js
const puppeteer = require('puppeteer');
const ffmpeg    = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const path      = require('path');
const fs        = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const W = 1280, H = 720;
const FPS = 24;
const TOTAL_FRAMES = FPS * 20; // 480 frames = 20s
const OUT_DIR = path.join(__dirname, 'video_frames');
const VIDEO_OUT = path.join(__dirname, 'covers', 'preview_landscape.mp4');

// ── Element data (matches game config) ──────────────────────────────────
const ELEMS = [
  { color: '#FF6B35', emoji: '✨', r: 18 },
  { color: '#FF2200', emoji: '🔥', r: 26 },
  { color: '#0099FF', emoji: '💧', r: 34 },
  { color: '#9B6B3A', emoji: '⛰️', r: 42 },
  { color: '#99CCFF', emoji: '💨', r: 50 },
  { color: '#FFDD00', emoji: '⚡', r: 58 },
  { color: '#CCEEFF', emoji: '❄️', r: 66 },
  { color: '#FF4400', emoji: '🌋', r: 74 },
  { color: '#AA00EE', emoji: '🌪️', r: 82 },
  { color: '#9933FF', emoji: '🪐', r: 90 },
];

// ── HTML template for one frame ──────────────────────────────────────────
function frameHTML(t) {
  // t = 0..1 normalised time
  const sec = t * 20;

  // ── scene logic ──────────────────────────────────────
  // 0-3s : title card
  // 3-6s : "Drop" — single ball falling
  // 6-12s : "Merge" — balls stacking + merge flash
  // 12-16s: chain merge / score pop
  // 16-20s: logo outro

  // Drop animation (ball falls from top to ~mid screen)
  const dropBall = (sec >= 3 && sec < 6)
    ? { el: ELEMS[2], x: W * 0.5, y: H * 0.12 + (sec - 3) / 3 * (H * 0.52) }
    : null;

  // Stacked balls in the container area
  const stackEls = sec >= 5 ? [
    { el: ELEMS[0], x: W * 0.44, y: H * 0.82 },
    { el: ELEMS[1], x: W * 0.52, y: H * 0.75 },
    { el: ELEMS[2], x: W * 0.47, y: H * 0.67 },
    { el: ELEMS[3], x: W * 0.41, y: H * 0.59 },
  ] : [];

  const mergeFlash = (sec >= 6.5 && sec < 7.2);
  const mergeScale = mergeFlash ? 1 + 0.4 * Math.sin((sec - 6.5) / 0.7 * Math.PI) : 1;

  const bigMergeEl = sec >= 7 ? [{ el: ELEMS[4], x: W * 0.47, y: H * 0.67 }] : [];

  // Chain merge accumulates
  const chainEls = sec >= 10 ? [
    { el: ELEMS[5], x: W * 0.44, y: H * 0.55 },
    { el: ELEMS[6], x: W * 0.52, y: H * 0.46 },
  ] : [];

  // Score counter
  const score = sec < 3 ? 0
    : sec < 7 ? Math.floor((sec - 3) / 4 * 360)
    : sec < 14 ? 360 + Math.floor((sec - 7) / 7 * 2560)
    : 2920;

  // Title visibility
  const titleAlpha = sec < 3 ? 1
    : sec < 4 ? 1 - (sec - 3)
    : sec > 17 ? (sec - 17) / 3
    : 0;

  const taglineAlpha = sec < 2 ? 0
    : sec < 3 ? sec - 2
    : sec < 3.8 ? 1 - (sec - 3) / 0.8
    : sec > 17 ? (sec - 17) / 3
    : 0;

  // Container visible from sec 3 onwards
  const containerAlpha = sec < 3 ? 0 : sec < 4 ? sec - 3 : 1;
  const containerH = H * 0.78;
  const containerW = W * 0.28;
  const cx = W * 0.5, containerT = H * 0.1;

  // NEXT element preview
  const nextLevel = sec < 7 ? 3 : sec < 12 ? 5 : 7;
  const nextEl = ELEMS[nextLevel - 1];
  const nextPreviewVisible = sec >= 3;

  // Aim line
  const aimVisible = sec >= 3 && sec < 6;

  // Particle burst on merge
  const particles = mergeFlash ? Array.from({ length: 8 }, (_, i) => ({
    angle: i / 8 * 360,
    r: 20 + (sec - 6.5) / 0.7 * 60,
    a: 1 - (sec - 6.5) / 0.7,
    color: ELEMS[4].color,
  })) : [];

  // Score pop
  const scorePop = (sec >= 7 && sec < 8);
  const scorePopAlpha = scorePop ? Math.sin((sec - 7) * Math.PI) : 0;
  const scorePopY = H * 0.62 - (scorePop ? (sec - 7) * 40 : 0);

  function orbSVG(el, x, y, scale = 1) {
    const r = el.r * scale;
    const hex = parseInt(el.color.slice(1), 16);
    const rv = (hex >> 16) & 0xff, gv = (hex >> 8) & 0xff, bv = hex & 0xff;
    const lighten = (c) => Math.round(c + (255 - c) * 0.7);
    const darken  = (c) => Math.round(c * 0.45);
    const gid = `g${Math.round(x)}_${Math.round(y)}`;
    const gid2 = `gs${Math.round(x)}_${Math.round(y)}`;
    return `
      <defs>
        <radialGradient id="${gid}" cx="35%" cy="32%" r="60%">
          <stop offset="0%"   stop-color="rgb(${lighten(rv)},${lighten(gv)},${lighten(bv)})"/>
          <stop offset="55%"  stop-color="${el.color}"/>
          <stop offset="100%" stop-color="rgb(${darken(rv)},${darken(gv)},${darken(bv)})"/>
        </radialGradient>
        <radialGradient id="${gid2}" cx="35%" cy="35%" r="42%">
          <stop offset="0%"  stop-color="rgba(255,255,255,0.55)"/>
          <stop offset="60%" stop-color="rgba(255,255,255,0.12)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <!-- glow -->
      <circle cx="${x}" cy="${y}" r="${r * 1.5}"
        fill="${el.color}" fill-opacity="0.18"/>
      <!-- body -->
      <circle cx="${x}" cy="${y}" r="${r}"
        fill="url(#${gid})" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
      <!-- shine -->
      <circle cx="${x - r * 0.28}" cy="${y - r * 0.28}" r="${r * 0.38}"
        fill="url(#${gid2})"/>
      <!-- emoji -->
      <text x="${x}" y="${y + r * 0.1}" text-anchor="middle" dominant-baseline="middle"
        font-size="${r * 1.1}px" font-family="Apple Color Emoji,Segoe UI Emoji,sans-serif"
        style="user-select:none">${el.emoji}</text>`;
  }

  // Stars (deterministic)
  let seed = 137;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  const stars = Array.from({ length: 100 }, (_, i) => ({
    x: rand() * W, y: rand() * H, r: rand() * 1.3 + 0.3, a: rand() * 0.5 + 0.35,
  }));

  const WALL = 12;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    *{margin:0;padding:0}
    body{width:${W}px;height:${H}px;overflow:hidden;background:#07071a}
    @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@600&display=swap');
  </style></head>
  <body>
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bggrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#07071a"/>
        <stop offset="50%"  stop-color="#0d0d2e"/>
        <stop offset="100%" stop-color="#1a0a2e"/>
      </linearGradient>
    </defs>

    <!-- background -->
    <rect width="${W}" height="${H}" fill="url(#bggrad)"/>

    <!-- stars -->
    ${stars.map(s => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}" fill="white" fill-opacity="${s.a.toFixed(2)}"/>`).join('')}

    <!-- LEFT: container -->
    <g opacity="${containerAlpha.toFixed(3)}">
      <!-- container box -->
      <rect x="${cx - containerW/2}" y="${containerT}" width="${containerW}" height="${containerH}"
        fill="#0d0d22" stroke="#2a2a44" stroke-width="2" rx="4"/>
      <!-- walls -->
      <rect x="${cx - containerW/2}" y="${containerT}" width="${WALL}" height="${containerH}"
        fill="#1a1a3a"/>
      <rect x="${cx + containerW/2 - WALL}" y="${containerT}" width="${WALL}" height="${containerH}"
        fill="#1a1a3a"/>
      <rect x="${cx - containerW/2}" y="${containerT + containerH - WALL}" width="${containerW}" height="${WALL}"
        fill="#1a1a3a"/>
      <!-- danger line -->
      <line x1="${cx - containerW/2 + WALL}" y1="${containerT + H*0.08}" x2="${cx + containerW/2 - WALL}" y2="${containerT + H*0.08}"
        stroke="#ff3333" stroke-width="1" stroke-opacity="0.5"/>
      <text x="${cx - containerW/2 + WALL + 3}" y="${containerT + H*0.075}" fill="#ff3333" font-size="8" opacity="0.6">DANGER</text>

      <!-- aim line -->
      ${aimVisible ? `<line x1="${cx}" y1="${containerT + H*0.02}" x2="${cx}" y2="${containerT + containerH - WALL}"
        stroke="white" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="4,6"/>` : ''}

      <!-- stacked balls -->
      ${stackEls.map(b => orbSVG(b.el, b.x, b.y)).join('')}
      ${bigMergeEl.map(b => orbSVG(b.el, b.x, b.y, mergeScale)).join('')}
      ${chainEls.map(b => orbSVG(b.el, b.x, b.y)).join('')}

      <!-- merge flash -->
      ${mergeFlash ? `<circle cx="${W*0.47}" cy="${H*0.67}" r="${60 + (sec-6.5)/0.7*80}"
        fill="none" stroke="white" stroke-width="3" stroke-opacity="${(1-(sec-6.5)/0.7).toFixed(3)}"/>` : ''}

      <!-- particles -->
      ${particles.map(p => `<circle
        cx="${W*0.47 + Math.cos(p.angle * Math.PI/180) * p.r}"
        cy="${H*0.67 + Math.sin(p.angle * Math.PI/180) * p.r}"
        r="4" fill="${p.color}" fill-opacity="${p.a.toFixed(3)}"/>`).join('')}

      <!-- falling ball -->
      ${dropBall ? orbSVG(dropBall.el, dropBall.x, dropBall.y) : ''}

      <!-- aim indicator (orb at drop line) -->
      ${aimVisible ? orbSVG(ELEMS[2], cx, containerT + H*0.04, 0.8) : ''}
    </g>

    <!-- RIGHT: score + next preview -->
    <g opacity="${containerAlpha.toFixed(3)}">
      <!-- SCORE label -->
      <text x="${W*0.73}" y="${H*0.18}" text-anchor="middle"
        font-family="Fredoka,Arial,sans-serif" font-size="14" fill="#556" font-weight="bold">SCORE</text>
      <text x="${W*0.73}" y="${H*0.265}" text-anchor="middle"
        font-family="Fredoka,Arial,sans-serif" font-size="38" fill="white" font-weight="bold">${score.toLocaleString()}</text>

      <!-- score pop -->
      ${scorePopAlpha > 0.01 ? `<text x="${W*0.78}" y="${scorePopY.toFixed(1)}" text-anchor="middle"
        font-family="Fredoka,Arial,sans-serif" font-size="22" fill="#ffcc44" font-weight="bold"
        opacity="${scorePopAlpha.toFixed(3)}">+160</text>` : ''}

      <!-- NEXT label + preview -->
      ${nextPreviewVisible ? `
        <text x="${W*0.73}" y="${H*0.45}" text-anchor="middle"
          font-family="Fredoka,Arial,sans-serif" font-size="12" fill="#556" font-weight="bold">NEXT</text>
        ${orbSVG(nextEl, W*0.73, H*0.55, 0.7)}
      ` : ''}
    </g>

    <!-- TITLE overlay -->
    <g opacity="${titleAlpha.toFixed(3)}">
      <text x="${W/2}" y="${H*0.42}" text-anchor="middle"
        font-family="Fredoka,Arial Black,sans-serif" font-size="96" font-weight="bold"
        fill="white" stroke="#3333cc" stroke-width="6"
        style="paint-order:stroke fill">ELEMENTRA</text>
      <text x="${W/2}" y="${H*0.55}" text-anchor="middle"
        font-family="Fredoka,Arial,sans-serif" font-size="28"
        fill="#aaaadd" opacity="${taglineAlpha.toFixed(3)}">Drop. Merge. Ascend.</text>
    </g>

    <!-- OUTRO overlay -->
    ${sec > 17 ? `
    <g opacity="${((sec-17)/3).toFixed(3)}">
      <rect width="${W}" height="${H}" fill="#07071a" opacity="${((sec-17)/3*0.7).toFixed(3)}"/>
      <text x="${W/2}" y="${H*0.45}" text-anchor="middle"
        font-family="Fredoka,Arial Black,sans-serif" font-size="80" font-weight="bold"
        fill="white" stroke="#3333cc" stroke-width="5"
        style="paint-order:stroke fill">ELEMENTRA</text>
      <text x="${W/2}" y="${H*0.58}" text-anchor="middle"
        font-family="Fredoka,Arial,sans-serif" font-size="26" fill="#aaaadd">Play now on CrazyGames!</text>
    </g>` : ''}
  </svg>
  </body></html>`;
}

async function main() {
  // Clean frames dir
  fs.readdirSync(OUT_DIR).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

  console.log(`Rendering ${TOTAL_FRAMES} frames...`);
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / TOTAL_FRAMES;
    const html = frameHTML(t);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const framePath = path.join(OUT_DIR, `frame_${String(i).padStart(4,'0')}.png`);
    await page.screenshot({ path: framePath });
    if (i % 48 === 0) process.stdout.write(`  frame ${i}/${TOTAL_FRAMES}\n`);
  }

  await browser.close();
  console.log('Frames done. Encoding video...');

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(OUT_DIR, 'frame_%04d.png'))
      .inputFPS(FPS)
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-preset fast',
        '-crf 20',
        '-movflags +faststart',
      ])
      .size(`${W}x${H}`)
      .fps(FPS)
      .output(VIDEO_OUT)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  console.log(`Video saved: ${VIDEO_OUT}`);
}

main().catch(console.error);
