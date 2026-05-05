import Phaser from 'phaser';
import { ELEMENTS } from '../config';

// Canvas = (radius * ORB_SCALE) on each side — glow extends beyond the orb.
// GameScene uses this to set explicit display sizes where needed.
export const ORB_SCALE = 2.8;

export async function buildElementTextures(scene: Phaser.Scene): Promise<void> {
  // Wait for fonts so emoji render correctly on Android/mobile
  await document.fonts.ready;

  ELEMENTS.forEach(el => {
    const key = `el_${el.level}`;
    if (scene.textures.exists(key)) return;

    const r      = el.radius;
    const half   = r * (ORB_SCALE / 2); // canvas half-size
    const size   = Math.ceil(r * ORB_SCALE);
    const cx     = half, cy = half;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx    = canvas.getContext('2d')!;

    // ── outer glow ──────────────────────────────────────────
    const baseHex = el.color;
    const rc = (baseHex >> 16) & 0xff;
    const gc = (baseHex >>  8) & 0xff;
    const bc =  baseHex        & 0xff;

    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, half);
    glow.addColorStop(0,   `rgba(${rc},${gc},${bc},0.40)`);
    glow.addColorStop(0.5, `rgba(${rc},${gc},${bc},0.12)`);
    glow.addColorStop(1,   `rgba(${rc},${gc},${bc},0.00)`);
    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // ── orb body ─────────────────────────────────────────────
    const grad = ctx.createRadialGradient(
      cx - r * 0.40, cy - r * 0.35, 0,
      cx,            cy,            r,
    );
    grad.addColorStop(0,   cssColor(el.color, 0.70, 0));
    grad.addColorStop(0.5, cssColor(el.color, 0,    0));
    grad.addColorStop(1,   cssColor(el.color, 0,    0.55));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // ── edge stroke ───────────────────────────────────────────
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // ── shine spot ────────────────────────────────────────────
    const shine = ctx.createRadialGradient(
      cx - r * 0.32, cy - r * 0.32, 0,
      cx - r * 0.28, cy - r * 0.28, r * 0.40,
    );
    shine.addColorStop(0,   'rgba(255,255,255,0.55)');
    shine.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    shine.addColorStop(1,   'rgba(255,255,255,0.00)');
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.40, 0, Math.PI * 2);
    ctx.fillStyle = shine;
    ctx.fill();

    scene.textures.addCanvas(key, canvas);
  });
}

function cssColor(hex: number, lighten: number, darken: number): string {
  let r = (hex >> 16) & 0xff;
  let g = (hex >>  8) & 0xff;
  let b =  hex        & 0xff;
  r = Math.round(r + (255 - r) * lighten) * (1 - darken) | 0;
  g = Math.round(g + (255 - g) * lighten) * (1 - darken) | 0;
  b = Math.round(b + (255 - b) * lighten) * (1 - darken) | 0;
  return `rgb(${r},${g},${b})`;
}
