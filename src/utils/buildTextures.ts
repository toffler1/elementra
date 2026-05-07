import Phaser from 'phaser';
import { ELEMENTS } from '../config';

// Canvas = radius * ORB_SCALE on each side — glow extends beyond the orb.
export const ORB_SCALE = 2.8;

export async function buildElementTextures(scene: Phaser.Scene): Promise<void> {
  await document.fonts.ready;

  ELEMENTS.forEach((el, idx) => {
    const key = `el_${el.level}`;
    if (scene.textures.exists(key)) return;

    const r    = el.radius;
    const half = r * (ORB_SCALE / 2);
    const size = Math.ceil(r * ORB_SCALE);
    const cx = half, cy = half;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const rc = (el.color >> 16) & 0xff;
    const gc = (el.color >>  8) & 0xff;
    const bc =  el.color        & 0xff;

    // ── 1. Outer glow halo ────────────────────────────────────────────────
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, half);
    glow.addColorStop(0,   `rgba(${rc},${gc},${bc},0.55)`);
    glow.addColorStop(0.4, `rgba(${rc},${gc},${bc},0.22)`);
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // ── 2. Clip to sphere for all inner layers ────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // ── 3. Dark base (glass interior is dark, lit from surface) ──────────
    const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    base.addColorStop(0,   `rgb(${rc * 0.22 | 0},${gc * 0.22 | 0},${bc * 0.22 | 0})`);
    base.addColorStop(0.6, `rgb(${rc * 0.10 | 0},${gc * 0.10 | 0},${bc * 0.10 | 0})`);
    base.addColorStop(1,   'rgb(3,3,8)');
    ctx.fillStyle = base;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // ── 4. Element-specific inner force ───────────────────────────────────
    ctx.save();
    drawInnerForce(ctx, cx, cy, r, idx);
    ctx.restore();

    // ── 5. Glass rim darkening (thick glass edges absorb light) ───────────
    const rim = ctx.createRadialGradient(cx, cy, r * 0.48, cx, cy, r);
    rim.addColorStop(0,    'rgba(0,0,0,0)');
    rim.addColorStop(0.62, 'rgba(0,0,0,0.18)');
    rim.addColorStop(0.85, 'rgba(0,0,0,0.52)');
    rim.addColorStop(1,    'rgba(0,0,0,0.82)');
    ctx.fillStyle = rim;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // ── 6. Large diffuse reflection (upper-left hemisphere) ───────────────
    const diff = ctx.createRadialGradient(
      cx - r * 0.18, cy - r * 0.18, 0,
      cx + r * 0.05, cy + r * 0.05, r * 0.95,
    );
    diff.addColorStop(0,    'rgba(255,255,255,0.26)');
    diff.addColorStop(0.40, 'rgba(255,255,255,0.08)');
    diff.addColorStop(0.75, 'rgba(255,255,255,0.02)');
    diff.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = diff;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.restore(); // end clip

    // ── 7. Crisp glass edge ───────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();

    // ── 8. Sharp specular highlight (upper-left) ──────────────────────────
    const spec = ctx.createRadialGradient(
      cx - r * 0.36, cy - r * 0.40, 0,
      cx - r * 0.36, cy - r * 0.40, r * 0.21,
    );
    spec.addColorStop(0,    'rgba(255,255,255,1.00)');
    spec.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    spec.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(cx - r * 0.36, cy - r * 0.40, r * 0.21, 0, Math.PI * 2);
    ctx.fillStyle = spec;
    ctx.fill();

    // ── 9. Bottom caustic (light refracted through glass onto back wall) ──
    const bright = (v: number) => Math.min(v + 90, 255);
    const caustic = ctx.createRadialGradient(
      cx + r * 0.08, cy + r * 0.74, 0,
      cx + r * 0.08, cy + r * 0.74, r * 0.32,
    );
    caustic.addColorStop(0,   `rgba(${bright(rc)},${bright(gc)},${bright(bc)},0.42)`);
    caustic.addColorStop(0.5, `rgba(${bright(rc)},${bright(gc)},${bright(bc)},0.12)`);
    caustic.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx + r * 0.08, cy + r * 0.74, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = caustic;
    ctx.fill();

    scene.textures.addCanvas(key, canvas);
  });
}

// ── Deterministic RNG (same seed = same output every game load) ────────────
function rng(seed: number): () => number {
  let s = (seed * 999 + 42) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

// ── Inner force renderer — called inside sphere clip ──────────────────────
function drawInnerForce(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, idx: number,
): void {
  const rand = rng(idx);

  switch (idx) {
    // ── 0. Spark — electric orange glow + tendrils ────────────────────────
    case 0: {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,    'rgba(255,255,200,0.98)');
      g.addColorStop(0.22, 'rgba(255,190,30,0.92)');
      g.addColorStop(0.55, 'rgba(255,80,0,0.70)');
      g.addColorStop(1,    'rgba(60,5,0,0.08)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Electric tendrils
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 7; i++) {
        const a = rand() * Math.PI * 2;
        ctx.strokeStyle = `rgba(255,255,${180 + (rand() * 60) | 0},0.85)`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        let x = cx, y = cy;
        for (let j = 0; j < 4; j++) {
          x += Math.cos(a + j * 0.4 + (rand() - 0.5) * 1.1) * r * 0.21;
          y += Math.sin(a + j * 0.4 + (rand() - 0.5) * 1.1) * r * 0.21;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }

    // ── 1. Flame — fire with bezier flame shapes ──────────────────────────
    case 1: {
      const g = ctx.createRadialGradient(cx, cy + r * 0.28, r * 0.04, cx, cy - r * 0.25, r);
      g.addColorStop(0,    'rgba(255,255,200,0.98)');
      g.addColorStop(0.18, 'rgba(255,210,0,0.92)');
      g.addColorStop(0.45, 'rgba(255,60,0,0.86)');
      g.addColorStop(0.75, 'rgba(140,8,0,0.65)');
      g.addColorStop(1,    'rgba(15,0,0,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Flame tongues
      for (let i = 0; i < 5; i++) {
        const bx   = cx + (rand() - 0.5) * r * 0.9;
        const topY = cy - r * (0.35 + rand() * 0.45);
        const w    = r * 0.14;
        ctx.beginPath();
        ctx.moveTo(bx - w, cy + r * 0.15);
        ctx.bezierCurveTo(
          bx - w * 1.8, topY + r * 0.25 + (rand() - 0.5) * r * 0.15,
          bx + (rand() - 0.5) * w * 1.5, topY + r * 0.1,
          bx, topY,
        );
        ctx.bezierCurveTo(
          bx + (rand() - 0.5) * w * 1.5, topY + r * 0.1,
          bx + w * 1.8, topY + r * 0.25 + (rand() - 0.5) * r * 0.15,
          bx + w, cy + r * 0.15,
        );
        ctx.fillStyle = `rgba(255,${(140 + rand() * 90) | 0},0,0.38)`;
        ctx.fill();
      }
      break;
    }

    // ── 2. Water — ripple rings + caustic shimmer ─────────────────────────
    case 2: {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,    'rgba(110,230,255,0.98)');
      g.addColorStop(0.35, 'rgba(0,145,255,0.92)');
      g.addColorStop(0.70, 'rgba(0,60,185,0.82)');
      g.addColorStop(1,    'rgba(0,10,60,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Ripple ellipses
      ctx.strokeStyle = 'rgba(190,245,255,0.52)';
      ctx.lineWidth   = 0.9;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.08, r * (0.14 + i * 0.155), r * (0.065 + i * 0.065), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Caustic blobs
      for (let i = 0; i < 7; i++) {
        const lx = cx + (rand() - 0.5) * r * 1.3;
        const ly = cy + (rand() - 0.5) * r * 1.3;
        const sg = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.13);
        sg.addColorStop(0, 'rgba(210,248,255,0.48)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      break;
    }

    // ── 3. Earth — rocky brown + cracked fissures ─────────────────────────
    case 3: {
      const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
      g.addColorStop(0,    'rgba(195,145,90,0.95)');
      g.addColorStop(0.45, 'rgba(130,88,48,0.92)');
      g.addColorStop(0.80, 'rgba(68,38,14,0.82)');
      g.addColorStop(1,    'rgba(20,8,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Rock texture: overlapping darker patches
      for (let i = 0; i < 8; i++) {
        const px = cx + (rand() - 0.5) * r * 1.4;
        const py = cy + (rand() - 0.5) * r * 1.4;
        const pr = r * (0.10 + rand() * 0.22);
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0, 'rgba(40,18,4,0.38)');
        pg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      // Cracks
      ctx.strokeStyle = 'rgba(25,10,2,0.70)';
      ctx.lineWidth   = 1.1;
      for (let i = 0; i < 6; i++) {
        const a0 = rand() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        let x = cx, y = cy;
        for (let j = 0; j < 5; j++) {
          x += Math.cos(a0 + (rand() - 0.5) * 0.85) * r * 0.20;
          y += Math.sin(a0 + (rand() - 0.5) * 0.85) * r * 0.20;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }

    // ── 4. Wind — swirling arcs ───────────────────────────────────────────
    case 4: {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,    'rgba(215,240,255,0.98)');
      g.addColorStop(0.40, 'rgba(125,195,245,0.88)');
      g.addColorStop(0.78, 'rgba(65,125,205,0.60)');
      g.addColorStop(1,    'rgba(10,45,110,0.10)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Swirl arcs
      for (let i = 0; i < 6; i++) {
        const startA = rand() * Math.PI * 2;
        const sweep  = Math.PI * (0.8 + rand() * 1.2);
        const sr     = r * (0.20 + rand() * 0.58);
        const ox = cx + (rand() - 0.5) * r * 0.38;
        const oy = cy + (rand() - 0.5) * r * 0.38;
        ctx.strokeStyle = `rgba(255,255,255,${0.30 + rand() * 0.35})`;
        ctx.lineWidth   = 0.9 + rand() * 0.8;
        ctx.beginPath();
        ctx.arc(ox, oy, sr, startA, startA + sweep);
        ctx.stroke();
      }
      break;
    }

    // ── 5. Lightning — branching bolt with glow ───────────────────────────
    case 5: {
      // Dark stormy interior
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,    'rgba(80,72,15,0.92)');
      g.addColorStop(0.5,  'rgba(28,28,6,0.92)');
      g.addColorStop(1,    'rgba(4,4,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Soft yellow glow behind bolt
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.72);
      bg.addColorStop(0,   'rgba(255,255,120,0.48)');
      bg.addColorStop(0.5, 'rgba(255,200,0,0.15)');
      bg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Recursive bolt
      const drawBolt = (x: number, y: number, angle: number, length: number, depth: number) => {
        if (depth === 0 || length < r * 0.055) return;
        const ex = x + Math.cos(angle) * length;
        const ey = y + Math.sin(angle) * length;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        drawBolt(ex, ey, angle + (rand() - 0.5) * 0.85, length * 0.62, depth - 1);
        if (rand() > 0.38) drawBolt(ex, ey, angle + (rand() - 0.5) * 1.6, length * 0.42, depth - 1);
      };
      ctx.shadowColor = 'rgba(255,255,100,1)';
      ctx.shadowBlur  = 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.98)';
      ctx.lineWidth   = 2.0;
      drawBolt(cx, cy - r * 0.48, Math.PI * 0.5, r * 0.58, 4);
      ctx.lineWidth   = 1.0;
      ctx.strokeStyle = 'rgba(255,255,180,0.70)';
      drawBolt(cx + r * 0.12, cy - r * 0.35, Math.PI * 0.5 + 0.3, r * 0.40, 3);
      ctx.shadowBlur  = 0;
      break;
    }

    // ── 6. Ice — snowflake crystal geometry ───────────────────────────────
    case 6: {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,    'rgba(230,248,255,0.98)');
      g.addColorStop(0.38, 'rgba(165,225,255,0.88)');
      g.addColorStop(0.72, 'rgba(85,175,235,0.72)');
      g.addColorStop(1,    'rgba(22,85,155,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Snowflake arms
      ctx.strokeStyle = 'rgba(255,255,255,0.82)';
      ctx.lineWidth   = 1.1;
      for (let i = 0; i < 6; i++) {
        const a   = (i / 6) * Math.PI * 2;
        const len = r * 0.68;
        const ex  = cx + Math.cos(a) * len;
        const ey  = cy + Math.sin(a) * len;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
        // Side branches
        for (let j = 1; j <= 3; j++) {
          const bx  = cx + Math.cos(a) * len * (j / 3.5);
          const by  = cy + Math.sin(a) * len * (j / 3.5);
          const bl  = r * (0.20 - j * 0.038);
          const px  = Math.cos(a + Math.PI / 2) * bl;
          const py  = Math.sin(a + Math.PI / 2) * bl;
          ctx.beginPath();
          ctx.moveTo(bx - px, by - py);
          ctx.lineTo(bx + px, by + py);
          ctx.stroke();
        }
      }
      // Center hex dot
      ctx.fillStyle = 'rgba(255,255,255,0.80)';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2); ctx.fill();
      break;
    }

    // ── 7. Lava — dark crust with glowing crack rivers ────────────────────
    case 7: {
      // Dark obsidian base
      ctx.fillStyle = 'rgb(7,2,0)';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Inner magma glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.65);
      g.addColorStop(0,   'rgba(255,190,0,0.68)');
      g.addColorStop(0.4, 'rgba(255,65,0,0.45)');
      g.addColorStop(1,   'rgba(80,0,0,0.00)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Rock chunks (dark patches on top of glow)
      for (let i = 0; i < 9; i++) {
        const px = cx + (rand() - 0.5) * r * 1.3;
        const py = cy + (rand() - 0.5) * r * 1.3;
        const pr = r * (0.10 + rand() * 0.28);
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0,   'rgba(12,4,0,0.88)');
        pg.addColorStop(0.6, 'rgba(30,8,0,0.55)');
        pg.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      // Glowing cracks
      for (let i = 0; i < 8; i++) {
        const a0 = rand() * Math.PI * 2;
        const ex = cx + Math.cos(a0) * r;
        const ey = cy + Math.sin(a0) * r;
        const cg = ctx.createLinearGradient(cx, cy, ex, ey);
        cg.addColorStop(0,    'rgba(255,210,0,0.98)');
        cg.addColorStop(0.28, 'rgba(255,100,0,0.85)');
        cg.addColorStop(0.65, 'rgba(180,20,0,0.50)');
        cg.addColorStop(1,    'rgba(50,0,0,0.05)');
        ctx.strokeStyle = cg;
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        let x = cx, y = cy;
        for (let j = 0; j < 5; j++) {
          x += Math.cos(a0 + (rand() - 0.5) * 0.7) * r * 0.22;
          y += Math.sin(a0 + (rand() - 0.5) * 0.7) * r * 0.22;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }

    // ── 8. Storm — swirling vortex with eye ──────────────────────────────
    case 8: {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,    'rgba(190,55,255,0.82)');
      g.addColorStop(0.32, 'rgba(105,12,185,0.88)');
      g.addColorStop(0.68, 'rgba(32,0,85,0.82)');
      g.addColorStop(1,    'rgba(5,0,22,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Spiral bands
      for (let band = 0; band < 3; band++) {
        ctx.strokeStyle = `rgba(225,185,255,${0.55 - band * 0.12})`;
        ctx.lineWidth   = 1.3 - band * 0.2;
        ctx.beginPath();
        for (let t = 0; t < Math.PI * 3.8; t += 0.06) {
          const rad = r * (0.08 + band * 0.21 + t * 0.042);
          const x   = cx + Math.cos(t + band * 2.2) * rad;
          const y   = cy + Math.sin(t + band * 2.2) * rad;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Eye of the storm
      const eye = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.19);
      eye.addColorStop(0,   'rgba(255,230,255,0.92)');
      eye.addColorStop(0.5, 'rgba(200,120,255,0.42)');
      eye.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = eye;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      break;
    }

    // ── 9. Cosmos — nebula clouds + star field ────────────────────────────
    case 9: {
      ctx.fillStyle = 'rgb(4,0,14)';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // Nebula colour clouds
      const nebColors: [number, number, number][] = [
        [175,0,255],[0,120,255],[255,75,195],[75,200,255],[255,140,0],[0,220,180],
      ];
      for (let i = 0; i < 7; i++) {
        const nc = nebColors[i % nebColors.length];
        const nx = cx + (rand() - 0.5) * r * 1.05;
        const ny = cy + (rand() - 0.5) * r * 1.05;
        const nr = r * (0.22 + rand() * 0.38);
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        ng.addColorStop(0,   `rgba(${nc[0]},${nc[1]},${nc[2]},0.42)`);
        ng.addColorStop(0.5, `rgba(${nc[0]},${nc[1]},${nc[2]},0.14)`);
        ng.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      // Stars
      for (let i = 0; i < 22; i++) {
        const sx = cx + (rand() - 0.5) * r * 1.7;
        const sy = cy + (rand() - 0.5) * r * 1.7;
        const sr = rand() * 1.3 + 0.25;
        const sa = 0.55 + rand() * 0.45;
        ctx.fillStyle = `rgba(255,255,255,${sa})`;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      }
      // Bright galactic core
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.48);
      core.addColorStop(0,    'rgba(255,255,255,0.62)');
      core.addColorStop(0.28, 'rgba(220,175,255,0.28)');
      core.addColorStop(0.65, 'rgba(120,0,220,0.10)');
      core.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      break;
    }
  }
}
