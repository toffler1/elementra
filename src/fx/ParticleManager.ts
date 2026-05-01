import Phaser from 'phaser';
import { ELEMENTS } from '../config';

// Y-gravity per element level — negative = rises (flame, wind, ice, kosmos), positive = falls (water, earth, lava)
const GRAVITY = [30, -120, 180, 260, -80, 0, -60, 350, 10, -200] as const;

export class ParticleManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (!scene.textures.exists('ptcl')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('ptcl', 8, 8);
      g.destroy();
    }
  }

  burst(x: number, y: number, level: number) {
    const el    = ELEMENTS[level - 1];
    const count = 8 + level * 2;
    const speed = 60 + level * 22;
    const life  = 380 + level * 20;

    const em = this.scene.add.particles(0, 0, 'ptcl', {
      speed:    { min: speed * 0.3, max: speed },
      angle:    { min: 0, max: 360 },
      scale:    { start: 0.25 + level * 0.055, end: 0 },
      alpha:    { start: 1, end: 0 },
      lifespan: life,
      gravityY: GRAVITY[level - 1],
      tint:     el.color,
      emitting: false,
    });
    em.setDepth(10);

    em.explode(count, x, y);
    this.scene.time.delayedCall(life + 150, () => em.destroy());
  }
}
