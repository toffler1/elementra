import Phaser from 'phaser';
import {
  ELEMENTS, GAME_WIDTH, GAME_HEIGHT,
  WALL_T, CONTAINER_TOP, DROP_Y, DANGER_Y, MAX_DROP_LEVEL,
} from '../config';
import { ParticleManager } from '../fx/ParticleManager';
import { SoundManager }    from '../fx/SoundManager';

export class GameScene extends Phaser.Scene {

  // --- state ---
  private score        = 0;
  private currentLevel = 1;
  private nextLevel    = 1;
  private canDrop      = true;
  private gameOver     = false;
  private lastDropTime = 0;

  // --- fx ---
  private particles!: ParticleManager;
  private sfx!:       SoundManager;

  // --- game objects ---
  private scoreText!:    Phaser.GameObjects.Text;
  private nextPreview!:  Phaser.GameObjects.Image;
  private aimIndicator!: Phaser.GameObjects.Image;
  private activeEls: Phaser.Physics.Matter.Image[] = [];

  constructor() { super({ key: 'GameScene' }); }

  // ─────────────────────────────────────────────
  //  LIFECYCLE
  // ─────────────────────────────────────────────

  create() {
    this.score     = 0;
    this.activeEls = [];
    this.gameOver  = false;
    this.canDrop      = true;

    this.sfx       = new SoundManager();
    this.particles = new ParticleManager(this);

    this.buildTextures();
    this.buildBackground();
    this.buildWalls();
    this.buildUI();
    this.prepareNext();
    this.setupInput();
    this.setupCollisions();
  }

  update() {
    if (this.gameOver) return;
    this.updateAim();
    this.checkGameOver();
  }

  // ─────────────────────────────────────────────
  //  SETUP
  // ─────────────────────────────────────────────

  private buildTextures() {
    ELEMENTS.forEach(el => {
      const key = `el_${el.level}`;
      if (this.textures.exists(key)) return;

      const r      = el.radius;
      const size   = r * 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx    = canvas.getContext('2d')!;

      // radial gradient — offset focal point simulates top-left light source
      const grad = ctx.createRadialGradient(r * 0.55, r * 0.38, 0, r, r, r);
      grad.addColorStop(0,   cssColor(el.color, 0.60,  0));
      grad.addColorStop(0.6, cssColor(el.color, 0,     0));
      grad.addColorStop(1,   cssColor(el.color, 0,     0.50));
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // dark rim
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // emoji — font stack covers Win/Mac/Android
      const fontSize = Math.round(r * 1.05);
      ctx.font          = `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillText(el.emoji, r, r + r * 0.04);

      this.textures.addCanvas(key, canvas);
    });
  }

  private buildBackground() {
    // container box
    const cw = GAME_WIDTH - WALL_T * 2;
    const ch = GAME_HEIGHT - CONTAINER_TOP - WALL_T;
    this.add.rectangle(GAME_WIDTH / 2, CONTAINER_TOP + ch / 2, cw, ch, 0x16213e);

    // danger line
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(1, 0xff3333, 0.5);
    g.lineBetween(WALL_T, DANGER_Y, GAME_WIDTH - WALL_T, DANGER_Y);

    // small label
    this.add.text(WALL_T + 4, DANGER_Y - 11, 'DANGER', {
      fontSize: '9px', color: '#ff3333',
    }).setAlpha(0.6).setDepth(2);
  }

  private buildWalls() {
    const opts = { isStatic: true, label: 'wall', friction: 0.3, restitution: 0.05 };
    const W = GAME_WIDTH, H = GAME_HEIGHT, T = WALL_T;

    this.matter.add.rectangle(W / 2,     H - T / 2, W - T * 2, T,  opts); // bottom
    this.matter.add.rectangle(T / 2,     H / 2,     T,         H,  opts); // left
    this.matter.add.rectangle(W - T / 2, H / 2,     T,         H,  opts); // right
  }

  private buildUI() {
    this.add.text(16, 10, 'SCORE', { fontSize: '11px', color: '#556' }).setDepth(5);
    this.scoreText = this.add.text(16, 24, '0', {
      fontSize: '28px', color: '#fff', fontStyle: 'bold',
    }).setDepth(5);

    this.add.text(GAME_WIDTH - 62, 10, 'NEXT', { fontSize: '11px', color: '#556' }).setDepth(5);
    // placeholder, replaced in prepareNext()
    this.nextPreview = this.add.image(GAME_WIDTH - 42, 52, 'el_1').setDepth(5);
  }

  // ─────────────────────────────────────────────
  //  DROP FLOW
  // ─────────────────────────────────────────────

  private prepareNext() {
    // shift current ← next, roll new next
    this.currentLevel = this.nextLevel;
    this.nextLevel    = Phaser.Math.Between(1, MAX_DROP_LEVEL);

    // update "NEXT" preview
    const nextEl = ELEMENTS[this.nextLevel - 1];
    this.nextPreview.setTexture(`el_${this.nextLevel}`);
    const ps = Math.min(nextEl.radius * 1.3, 48);
    this.nextPreview.setDisplaySize(ps, ps);

    // create aim indicator for current
    this.aimIndicator?.destroy();
    const curEl = ELEMENTS[this.currentLevel - 1];
    this.aimIndicator = this.add
      .image(GAME_WIDTH / 2, DROP_Y, `el_${this.currentLevel}`)
      .setAlpha(0.85)
      .setDepth(4);
    this.aimIndicator.setDisplaySize(curEl.radius * 2, curEl.radius * 2);
  }

  private setupInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.gameOver || !this.canDrop) return;
      this.executeDrop(p.x);
    });
  }

  private executeDrop(pointerX: number) {
    const el = ELEMENTS[this.currentLevel - 1];
    const x  = Phaser.Math.Clamp(pointerX, WALL_T + el.radius, GAME_WIDTH - WALL_T - el.radius);

    this.sfx.resume();
    this.sfx.playDrop();
    this.spawnElement(x, DROP_Y, this.currentLevel);
    this.lastDropTime = this.time.now;

    this.canDrop = false;
    this.aimIndicator.setVisible(false);

    this.time.delayedCall(380, () => {
      if (!this.gameOver) {
        this.prepareNext();
        this.canDrop = true;
      }
    });
  }

  private spawnElement(x: number, y: number, level: number): Phaser.Physics.Matter.Image {
    const el  = ELEMENTS[level - 1];
    const img = this.matter.add.image(x, y, `el_${level}`);

    img.setCircle(el.radius);
    img.setBounce(0.1);
    img.setFriction(0.5);
    img.setFrictionAir(0.01);

    img.setDepth(3);
    img.setData('level', level);
    img.setData('uid',   `${Date.now()}_${Math.random()}`);

    this.activeEls.push(img);
    return img;
  }

  // ─────────────────────────────────────────────
  //  MERGE
  // ─────────────────────────────────────────────

  private setupCollisions() {
    this.matter.world.on('collisionstart', (event: any) => {
      for (const pair of event.pairs) {
        this.tryMerge(
          pair.bodyA.gameObject as Phaser.Physics.Matter.Image,
          pair.bodyB.gameObject as Phaser.Physics.Matter.Image,
        );
      }
    });
  }

  private tryMerge(a: Phaser.Physics.Matter.Image, b: Phaser.Physics.Matter.Image) {
    if (!a?.active || !b?.active) return;
    if (a.getData('merging') || b.getData('merging')) return;

    const lvA: number = a.getData('level');
    const lvB: number = b.getData('level');
    if (!lvA || !lvB || lvA !== lvB || lvA >= ELEMENTS.length) return;

    // Mark immediately — blocks all future collision events for this pair
    a.setData('merging', true);
    b.setData('merging', true);

    // One-frame delay so we're outside the physics step before destroying bodies
    this.time.delayedCall(16, () => {
      if (!a.active || !b.active) return;
      this.doMerge(a, b, lvA);
    });
  }

  private doMerge(a: Phaser.Physics.Matter.Image, b: Phaser.Physics.Matter.Image, level: number) {
    const mx  = (a.x + b.x) / 2;
    const my  = (a.y + b.y) / 2;
    const nxt = level + 1;

    this.score += ELEMENTS[level - 1].points;
    this.scoreText.setText(this.score.toString());

    this.sfx.playMerge(level);
    this.particles.burst(mx, my, level);
    this.flashMerge(mx, my, level);
    this.showMergeLabel(mx, my, nxt);
    if (level >= 5) {
      this.cameras.main.shake(
        60 + (level - 5) * 12,
        0.004 + (level - 5) * 0.002,
      );
    }

    // Alpha-only tween — scale tweens change the Matter body size and cause overlap explosions
    this.tweens.add({
      targets: [a, b],
      alpha: 0,
      duration: 100,
      onComplete: () => {
        a.destroy();
        b.destroy();
        this.activeEls = this.activeEls.filter(e => e !== a && e !== b);

        const newEl = this.spawnElement(mx, my, nxt);
        this.tweens.add({
          targets: newEl,
          alpha: { from: 0, to: 1 },
          duration: 180,
        });
      },
    });
  }

  // ─────────────────────────────────────────────
  //  UPDATE HELPERS
  // ─────────────────────────────────────────────

  private updateAim() {
    if (!this.canDrop || !this.aimIndicator?.visible) return;
    const el = ELEMENTS[this.currentLevel - 1];
    const px = this.input.activePointer.x;
    this.aimIndicator.x = Phaser.Math.Clamp(
      px, WALL_T + el.radius, GAME_WIDTH - WALL_T - el.radius,
    );
  }

  private checkGameOver() {
    // skip grace period right after a drop
    if (this.time.now - this.lastDropTime < 600) return;

    for (const el of this.activeEls) {
      if (!el.active || el.getData('merging')) continue;
      const body = el.body as any;
      const vel  = Math.hypot(body.velocity.x, body.velocity.y);
      if (el.y < DANGER_Y && vel < 1.5) {
        this.triggerGameOver();
        return;
      }
    }
  }

  private triggerGameOver() {
    this.gameOver = true;
    this.canDrop  = false;
    this.sfx.playGameOver();
    this.aimIndicator?.setVisible(false);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add.rectangle(cx, cy, 310, 190, 0x000000, 0.88).setDepth(20);
    this.add.text(cx, cy - 55, 'GAME OVER', {
      fontSize: '34px', color: '#ff4455', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    this.add.text(cx, cy - 10, `Score: ${this.score}`, {
      fontSize: '22px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(21);

    this.add.text(cx, cy + 45, '▶  NEU STARTEN', {
      fontSize: '18px', color: '#00ff88',
      backgroundColor: '#003322',
      padding: { x: 18, y: 10 },
    })
      .setOrigin(0.5).setDepth(21)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.restart());
  }

  // ─────────────────────────────────────────────
  //  FX HELPERS
  // ─────────────────────────────────────────────

  private flashMerge(x: number, y: number, level: number) {
    const r   = ELEMENTS[level - 1].radius * 1.8;
    const gfx = this.add.graphics().setDepth(11);
    gfx.fillStyle(0xffffff, 0.75);
    gfx.fillCircle(x, y, r);
    this.tweens.add({
      targets: gfx, alpha: 0, duration: 200,
      onComplete: () => gfx.destroy(),
    });
  }

  private showMergeLabel(x: number, y: number, nxt: number) {
    if (nxt > ELEMENTS.length) return;
    const el  = ELEMENTS[nxt - 1];
    const hex = '#' + el.color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, `+${el.name}!`, {
      fontSize:        `${11 + nxt * 1.5}px`,
      color:           hex,
      fontStyle:       'bold',
      stroke:          '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(15);

    this.tweens.add({
      targets: txt, y: y - 48, alpha: 0,
      duration: 850, ease: 'Cubic.out',
      onComplete: () => txt.destroy(),
    });
  }
}

// Returns a CSS rgb() string with the hex color lightened (+lighten) or darkened (+darken).
function cssColor(hex: number, lighten: number, darken: number): string {
  let r = (hex >> 16) & 0xff;
  let g = (hex >>  8) & 0xff;
  let b =  hex        & 0xff;
  r = Math.round(r + (255 - r) * lighten) * (1 - darken) | 0;
  g = Math.round(g + (255 - g) * lighten) * (1 - darken) | 0;
  b = Math.round(b + (255 - b) * lighten) * (1 - darken) | 0;
  return `rgb(${r},${g},${b})`;
}
