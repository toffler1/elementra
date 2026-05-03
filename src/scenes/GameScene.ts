import Phaser from 'phaser';
import {
  ELEMENTS, GAME_WIDTH, GAME_HEIGHT,
  WALL_T, CONTAINER_TOP, DROP_Y, DANGER_Y, MAX_DROP_LEVEL,
} from '../config';
import { ParticleManager }             from '../fx/ParticleManager';
import { SoundManager, getOrCreateSoundManager } from '../fx/SoundManager';
import { buildElementTextures } from '../utils/buildTextures';
import { gameplayStart, gameplayStop, requestMidgameAd } from '../ads/CrazySDK';

export class GameScene extends Phaser.Scene {

  // --- state ---
  private score        = 0;
  private currentLevel = 1;
  private nextLevel    = 1;
  private canDrop      = true;
  private gameOver     = false;
  private lastDropTime = 0;
  private bestScore    = 0;

  // --- fx ---
  private particles!: ParticleManager;
  private sfx!:       SoundManager;

  // --- game objects ---
  private scoreText!:    Phaser.GameObjects.Text;
  private bestText!:     Phaser.GameObjects.Text;
  private nextPreview!:  Phaser.GameObjects.Image;
  private aimIndicator!: Phaser.GameObjects.Image;
  private dropGuide!:    Phaser.GameObjects.Graphics;
  private activeEls:       Phaser.Physics.Matter.Image[]         = [];
  private elementTexts:    Map<string, Phaser.GameObjects.Text>  = new Map();
  private nextPreviewText!: Phaser.GameObjects.Text;
  private aimIndicatorText: Phaser.GameObjects.Text | null       = null;

  constructor() { super({ key: 'GameScene' }); }

  // ─────────────────────────────────────────────
  //  LIFECYCLE
  // ─────────────────────────────────────────────

  create() {
    this.score        = 0;
    this.activeEls    = [];
    this.elementTexts = new Map();
    this.gameOver     = false;
    this.canDrop   = true;
    this.bestScore = parseInt(localStorage.getItem('elementra_best') ?? '0', 10);

    this.sfx       = getOrCreateSoundManager();
    this.particles = new ParticleManager(this);

    this.buildTextures();
    this.buildBackground();
    this.dropGuide = this.add.graphics().setDepth(1);
    this.buildWalls();
    this.buildUI();
    this.prepareNext();
    this.setupInput();
    this.setupCollisions();
    gameplayStart();
  }

  update() {
    if (this.gameOver) return;
    this.updateAim();
    this.checkGameOver();
    this.syncElementTexts();
  }

  // ─────────────────────────────────────────────
  //  SETUP
  // ─────────────────────────────────────────────

  private async buildTextures() {
    await buildElementTextures(this);
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
    this.scoreText = this.add.text(16, 22, '0', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '30px', color: '#fff', fontStyle: 'bold',
    }).setDepth(5);
    this.add.text(16, 58, 'BEST', { fontSize: '11px', color: '#445' }).setDepth(5);
    this.bestText = this.add.text(16, 71, this.bestScore > 0 ? this.bestScore.toString() : '-', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '19px', color: '#888', fontStyle: 'bold',
    }).setDepth(5);

    // mute toggle — centered in header
    const muteBtn = this.add.text(GAME_WIDTH / 2, 10, this.sfx.isMuted() ? '🔇' : '🔊', {
      fontSize: '18px',
    }).setOrigin(0.5, 0).setDepth(5).setInteractive({ useHandCursor: true });
    muteBtn.on('pointerdown', () => {
      muteBtn.setText(this.sfx.toggleMute() ? '🔇' : '🔊');
    });

    this.add.text(GAME_WIDTH - 62, 10, 'NEXT', { fontSize: '11px', color: '#556' }).setDepth(5);
    this.nextPreview     = this.add.image(GAME_WIDTH - 42, 52, 'el_1').setDepth(5);
    this.nextPreviewText = this.add.text(GAME_WIDTH - 42, 52, '', { fontSize: '16px' })
      .setOrigin(0.5).setDepth(6);
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
    this.nextPreviewText
      .setText(nextEl.emoji)
      .setFontSize(`${Math.round(ps * 0.52)}px`);

    // create aim indicator for current
    this.aimIndicator?.destroy();
    this.aimIndicatorText?.destroy();
    const curEl = ELEMENTS[this.currentLevel - 1];
    this.aimIndicator = this.add
      .image(GAME_WIDTH / 2, DROP_Y, `el_${this.currentLevel}`)
      .setAlpha(0.85).setDepth(4);
    this.aimIndicator.setDisplaySize(curEl.radius * 2, curEl.radius * 2);
    this.aimIndicatorText = this.add
      .text(GAME_WIDTH / 2, DROP_Y, curEl.emoji, {
        fontSize: `${Math.round(curEl.radius * 1.05)}px`,
      }).setOrigin(0.5).setAlpha(0.85).setDepth(5);
  }

  private setupInput() {
    // pointerup = finger lifted / mouse released — lets mobile users drag to aim first
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
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
    this.aimIndicatorText?.setVisible(false);

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
    const uid = `${Date.now()}_${Math.random()}`;
    img.setData('uid', uid);

    // Emoji rendered as a Phaser Text so it works reliably on iOS/Brave
    const fontSize = Math.round(el.radius * 1.05);
    const txt = this.add.text(x, y, el.emoji, { fontSize: `${fontSize}px` })
      .setOrigin(0.5).setDepth(4);
    this.elementTexts.set(uid, txt);

    this.activeEls.push(img);
    return img;
  }

  private syncElementTexts() {
    for (const el of this.activeEls) {
      if (!el.active) continue;
      const txt = this.elementTexts.get(el.getData('uid'));
      if (txt) txt.setPosition(el.x, el.y).setRotation(el.rotation);
    }
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
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.bestText.setText(this.bestScore.toString());
      localStorage.setItem('elementra_best', this.bestScore.toString());
    }

    this.sfx.playMerge(level);
    this.particles.burst(mx, my, level);
    this.flashMerge(mx, my, level);
    this.showMergeLabel(mx, my, nxt);

    // screenshake on ALL levels — scales with level
    this.cameras.main.shake(55 + level * 8, 0.002 + level * 0.0008);

    // hit-stop — brief freeze frame (50ms L1 → 100ms L10)
    this.time.timeScale = 0;
    setTimeout(() => {
      if (!this.scene.isActive('GameScene')) return;
      this.time.timeScale = 1;
    }, 50 + level * 5);

    const uidA = a.getData('uid') as string;
    const uidB = b.getData('uid') as string;
    const txtA = this.elementTexts.get(uidA);
    const txtB = this.elementTexts.get(uidB);

    // Alpha-only tween — scale tweens change the Matter body size and cause overlap explosions
    this.tweens.add({
      targets: [a, b, txtA, txtB].filter(Boolean),
      alpha: 0,
      duration: 100,
      onComplete: () => {
        txtA?.destroy(); this.elementTexts.delete(uidA);
        txtB?.destroy(); this.elementTexts.delete(uidB);
        a.destroy();
        b.destroy();
        this.activeEls = this.activeEls.filter(e => e !== a && e !== b);

        const newEl  = this.spawnElement(mx, my, nxt);
        const newTxt = this.elementTexts.get(newEl.getData('uid'));
        this.tweens.add({
          targets: [newEl, newTxt].filter(Boolean),
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
    if (!this.canDrop || !this.aimIndicator?.visible) {
      this.dropGuide.clear();
      return;
    }
    const el = ELEMENTS[this.currentLevel - 1];
    const px = this.input.activePointer.x;
    const x  = Phaser.Math.Clamp(px, WALL_T + el.radius, GAME_WIDTH - WALL_T - el.radius);
    this.aimIndicator.x = x;
    if (this.aimIndicatorText) this.aimIndicatorText.x = x;

    this.dropGuide.clear();
    this.dropGuide.lineStyle(1, 0xffffff, 0.2);
    const toY = GAME_HEIGHT - WALL_T;
    let   y   = DROP_Y + el.radius + 2;
    while (y < toY) {
      this.dropGuide.lineBetween(x, y, x, Math.min(y + 5, toY));
      y += 10;
    }
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
    this.gameOver       = true;
    this.canDrop        = false;
    this.time.timeScale = 1; // reset any leftover hit-stop
    gameplayStop();
    this.sfx.playGameOver();
    this.aimIndicator?.setVisible(false);
    this.aimIndicatorText?.setVisible(false);
    this.dropGuide.clear();

    const cx        = GAME_WIDTH / 2;
    const cy        = GAME_HEIGHT / 2;
    const isNewBest = this.score > 0 && this.score === this.bestScore;
    const finalScore = this.score;

    // initial shake
    this.cameras.main.shake(220, 0.012);

    // 1 — overlay fades in
    const overlay = this.add.rectangle(cx, cy, 320, 220, 0x000000, 0).setDepth(20);
    this.tweens.add({ targets: overlay, fillAlpha: 0.9, duration: 280 });

    // 2 — "GAME OVER" slams in
    const goText = this.add.text(cx, cy - 40, 'GAME OVER', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '38px', color: '#ff4455', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21).setAlpha(0).setScale(0.3);

    this.time.delayedCall(180, () => {
      this.tweens.add({
        targets: goText, alpha: 1, scale: 1, y: cy - 68,
        duration: 380, ease: 'Back.Out',
      });
      this.cameras.main.shake(100, 0.007);
    });

    // 3 — score counts up
    const scoreText = this.add.text(cx, cy - 15, 'Score: 0', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '24px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(21).setAlpha(0);

    this.time.delayedCall(560, () => {
      this.tweens.add({ targets: scoreText, alpha: 1, duration: 180 });
      const steps = Math.min(finalScore, 24);
      const inc   = steps > 0 ? Math.ceil(finalScore / steps) : 0;
      let   cur   = 0;
      this.time.addEvent({
        delay: 28, repeat: steps,
        callback: () => {
          cur = Math.min(cur + inc, finalScore);
          scoreText.setText(`Score: ${cur}`);
        },
      });
    });

    // 4 — best score / new record line
    const bestText = this.add.text(cx, cy + 22, '', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '15px',
      color: isNewBest ? '#ffdd00' : '#666666',
    }).setOrigin(0.5).setDepth(21).setAlpha(0);

    this.time.delayedCall(920, () => {
      bestText.setText(isNewBest ? '🏆 New Record!' : `Best: ${this.bestScore}`);
      this.tweens.add({ targets: bestText, alpha: 1, duration: 260 });
      if (isNewBest) {
        this.confettiBurst(cx, cy);
        this.tweens.add({
          targets: bestText, scale: 1.18,
          duration: 180, yoyo: true, repeat: 2, ease: 'Sine.InOut',
        });
      }
    });

    // 5 — restart button slides up
    const btn = this.add.text(cx, cy + 80, '▶  PLAY AGAIN', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '18px', color: '#00ff88',
      backgroundColor: '#003322',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(21).setAlpha(0);

    this.time.delayedCall(1150, () => {
      this.tweens.add({
        targets: btn, alpha: 1, y: cy + 55,
        duration: 320, ease: 'Back.Out',
      });
      btn.setInteractive({ useHandCursor: true })
         .on('pointerup', () => {
           btn.removeInteractive();
           btn.setAlpha(0.5);
           requestMidgameAd({
             adStarted:  () => this.sfx.forceMute(true),
             adFinished: () => { this.sfx.forceMute(false); this.scene.restart(); },
             adError:    () => { this.sfx.forceMute(false); this.scene.restart(); },
           });
         });
    });
  }

  private confettiBurst(cx: number, cy: number) {
    const colors = [0xFF4455, 0x00FF88, 0xFFDD00, 0x00AAFF, 0xFF6B35, 0x9933FF];
    colors.forEach((color, i) => {
      const em = this.add.particles(0, 0, 'ptcl', {
        speed:    { min: 100, max: 300 },
        angle:    { min: -130, max: -50 },
        scale:    { start: 0.7, end: 0 },
        alpha:    { start: 1, end: 0 },
        lifespan: 1100,
        gravityY: 280,
        tint:     color,
        emitting: false,
      }).setDepth(22);
      this.time.delayedCall(i * 45, () => em.explode(10, cx, cy));
      this.time.delayedCall(1400, () => em.destroy());
    });
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

