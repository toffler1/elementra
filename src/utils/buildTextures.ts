import Phaser from 'phaser';
import { ELEMENTS } from '../config';

export async function buildElementTextures(scene: Phaser.Scene): Promise<void> {
  // Wait for fonts so emoji render correctly on Android/mobile
  await document.fonts.ready;

  ELEMENTS.forEach(el => {
    const key = `el_${el.level}`;
    if (scene.textures.exists(key)) return;

    const r      = el.radius;
    const size   = r * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx    = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(r * 0.55, r * 0.38, 0, r, r, r);
    grad.addColorStop(0,   cssColor(el.color, 0.60, 0));
    grad.addColorStop(0.6, cssColor(el.color, 0,    0));
    grad.addColorStop(1,   cssColor(el.color, 0,    0.50));
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    const fontSize = Math.round(r * 1.05);
    // Use sans-serif only — lets the browser's built-in emoji substitution
    // handle rendering, which works reliably on Android and iOS
    ctx.font         = `${fontSize}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.emoji, r, r + r * 0.04);

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
