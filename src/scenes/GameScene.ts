import Phaser from 'phaser';
import {
  ELEMENTS, GAME_WIDTH, GAME_HEIGHT,
  WALL_T, CONTAINER_TOP, DROP_Y, DANGER_Y, MAX_DROP_LEVEL,
} from '../config';
import { ParticleManager }             from '../fx/ParticleManager';
import { SoundManager, getOrCreateSoundManager } from '../fx/SoundManager';
import { buildElementTextures, buildRockTexture, ROCK_RADIUS, ORB_SCALE } from '../utils/buildTextures';
import { gameplayStart, gameplayStop, requestMidgameAd, isCrazyReady } from '../ads/CrazySDK';
import { gdRequestMidgameAd } from '../ads/GameDistributionSDK';
import { TutorialOverlay }    from '../ui/TutorialOverlay';

// ── Deterministic seeded RNG (same as buildTextures, inlined here) ──────────
function seededRng(seed: number): () => number {
  let s = (seed * 999 + 42) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

// ── Simple hash of a string → integer ───────────────────────────────────────
function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export class GameScene extends Phaser.Scene {

  // ── State ──────────────────────────────────────────────────────────────────
  private score        = 0;
  private currentLevel = 1;
  private nextLevel    = 1;
  private canDrop      = true;
  private gameOver     = false;
  private lastDropTime = 0;
  private bestScore    = 0;

  // next-drop: true = rock, false = element
  private currentIsRock = false;
  private nextIsRock    = false;

  // water level (0 = none, max 8, each step raises floor 55px)
  private waterLevels = 0;
  private waterBody:  MatterJS.BodyType | null = null;
  private waterGfx!:  Phaser.GameObjects.Graphics;
  private waterPhase  = 0;

  // rock hit debounce: key = `rockUid_elUid`, value = timestamp
  private rockHitTimes: Map<string, number> = new Map();

  // ── FX ────────────────────────────────────────────────────────────────────
  private particles!: ParticleManager;
  private sfx!:       SoundManager;
  private tutorial:   TutorialOverlay | null = null;
  private dropCount   = 0;

  // ── Game objects ──────────────────────────────────────────────────────────
  private scoreText!:    Phaser.GameObjects.Text;
  private bestText!:     Phaser.GameObjects.Text;
  private nextPreview!:  Phaser.GameObjects.Image;
  private aimIndicator!: Phaser.GameObjects.Image;
  private dropGuide!:    Phaser.GameObjects.Graphics;

  // Active elements (NOT rocks)
  private activeEls: Phaser.Physics.Matter.Image[] = [];
  // Active rocks
  private activeRocks: Phaser.Physics.Matter.Image[] = [];

  // Overlays: emoji texts + crack graphics, keyed by element uid
  private elementTexts:  Map<string, Phaser.GameObjects.Text>     = new Map();
  private crackOverlays: Map<string, Phaser.GameObjects.Graphics> = new Map();

  private nextPreviewText!:  Phaser.GameObjects.Text;
  private aimIndicatorText:  Phaser.GameObjects.Text | null = null;

  // Constants
  private readonly ROCK_CHANCE  = 0.18;
  private readonly MAX_WATER    = 8;
  private readonly WATER_STEP   = 55;
  private readonly HIT_COOLDOWN = 380;

  constructor() { super({ key: 'GameScene' }); }

  // ───────────────────────────────────────────────────────────────────────────
  //  LIFECYCLE
  // ───────────────────────────────────────────────────────────────────────────

  create() {
    this.score         = 0;
    this.activeEls     = [];
    this.activeRocks   = [];
    this.elementTexts  = new Map();
    this.crackOverlays = new Map();
    this.rockHitTimes  = new Map();
    this.waterLevels   = 0;
    this.waterBody     = null;
    this.gameOver      = false;
    this.canDrop       = true;
    this.currentIsRock = false;
    this.nextIsRock    = false;
    this.bestScore     = parseInt(localStorage.getItem('elementra_best') ?? '0', 10);

    this.sfx       = getOrCreateSoundManager();
    this.particles = new ParticleManager(this);

    this.dropCount = 0;
    this.tutorial  = null;

    this.buildTextures();
    this.buildBackground();
    this.waterGfx  = this.add.graphics().setDepth(1.8);
    this.dropGuide = this.add.graphics().setDepth(1);
    this.buildWalls();
    this.buildUI();
    this.prepareNext();
    this.setupInput();
    this.setupCollisions();
    gameplayStart();
    this.sfx.startMusic();

    if (TutorialOverlay.shouldShow()) {
      this.tutorial = new TutorialOverlay(this);
      this.tutorial.show();
    }
  }

  update() {
    if (this.gameOver) return;
    this.updateAim();
    this.checkGameOver();
    this.syncOverlays();
    this.updateWaterWave();
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  SETUP
  // ───────────────────────────────────────────────────────────────────────────

  private async buildTextures() {
    await buildElementTextures(this);
    buildRockTexture(this);
  }

  private buildBackground() {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x07071a, 0x07071a, 0x1a0a2e, 0x1a0a2e, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const sg = this.add.graphics();
    let seed = 137;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    for (let i = 0; i < 90; i++) {
      const x = rand() * GAME_WIDTH;
      const y = rand() * GAME_HEIGHT;
      const r = rand() * 1.2 + 0.3;
      const a = rand() * 0.5 + 0.4;
      sg.fillStyle(0xffffff, a);
      sg.fillCircle(x, y, r);
    }

    const cw = GAME_WIDTH - WALL_T * 2;
    const ch = GAME_HEIGHT - CONTAINER_TOP - WALL_T;
    this.add.rectangle(GAME_WIDTH / 2, CONTAINER_TOP + ch / 2, cw, ch, 0x0d0d22);

    const g = this.add.graphics().setDepth(2);
    g.lineStyle(1, 0xff3333, 0.5);
    g.lineBetween(WALL_T, DANGER_Y, GAME_WIDTH - WALL_T, DANGER_Y);
    this.add.text(WALL_T + 4, DANGER_Y - 11, 'DANGER', {
      fontSize: '9px', color: '#ff3333',
    }).setAlpha(0.6).setDepth(2);
  }

  private buildWalls() {
    const opts = { isStatic: true, label: 'wall', friction: 0.3, restitution: 0.05 };
    const W = GAME_WIDTH, H = GAME_HEIGHT, T = WALL_T;
    this.matter.add.rectangle(W / 2,     H - T / 2, W - T * 2, T,  opts);
    this.matter.add.rectangle(T / 2,     H / 2,     T,         H,  opts);
    this.matter.add.rectangle(W - T / 2, H / 2,     T,         H,  opts);
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

    const mx = GAME_WIDTH / 2, my = 22;
    const muteBg = this.add.graphics().setDepth(5);
    const drawMuteBg = (hover = false) => {
      muteBg.clear();
      muteBg.fillStyle(hover ? 0x3a4f66 : 0x1e2d3d, 0.90);
      muteBg.fillRoundedRect(mx - 17, my - 14, 34, 28, 8);
      muteBg.lineStyle(1, 0x445566, 0.8);
      muteBg.strokeRoundedRect(mx - 17, my - 14, 34, 28, 8);
    };
    drawMuteBg();

    const muteBtn = this.add.text(mx, my, this.sfx.isMuted() ? '🔇' : '🔊', {
      fontSize: '16px', padding: { x: 4, y: 3 },
    }).setOrigin(0.5).setDepth(6).setInteractive({ useHandCursor: true });

    muteBtn.on('pointerover', () => drawMuteBg(true));
    muteBtn.on('pointerout',  () => drawMuteBg(false));
    muteBtn.on('pointerup', (_p: any, _lx: any, _ly: any, event: any) => {
      muteBtn.setText(this.sfx.toggleMute() ? '🔇' : '🔊');
      event.stopPropagation();
    });

    this.add.text(GAME_WIDTH - 62, 10, 'NEXT', { fontSize: '11px', color: '#556' }).setDepth(5);
    this.nextPreview     = this.add.image(GAME_WIDTH - 42, 52, 'el_1').setDepth(5);
    this.nextPreviewText = this.add.text(GAME_WIDTH - 42, 52, '', {
      fontSize: '16px', padding: { x: 6, y: 16 },
    }).setOrigin(0.5).setDepth(6);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  DROP FLOW
  // ───────────────────────────────────────────────────────────────────────────

  private rollIsRock(): boolean {
    return Math.random() < this.ROCK_CHANCE;
  }

  private prepareNext() {
    this.currentLevel  = this.nextLevel;
    this.currentIsRock = this.nextIsRock;
    this.nextLevel     = Phaser.Math.Between(1, MAX_DROP_LEVEL);
    this.nextIsRock    = this.rollIsRock();

    // Update NEXT preview
    if (this.nextIsRock) {
      this.nextPreview.setTexture('rock');
      const ps = Math.min(ROCK_RADIUS * 2.6 * 0.65, 48 * (ORB_SCALE / 2));
      this.nextPreview.setDisplaySize(ps, ps);
      this.nextPreviewText.setText('🪨').setFontSize(`${Math.round(ps * 0.52)}px`);
    } else {
      const nextEl = ELEMENTS[this.nextLevel - 1];
      this.nextPreview.setTexture(`el_${this.nextLevel}`);
      const ps = Math.min(nextEl.radius * ORB_SCALE * 0.65, 48 * (ORB_SCALE / 2));
      this.nextPreview.setDisplaySize(ps, ps);
      this.nextPreviewText.setText(nextEl.emoji).setFontSize(`${Math.round(ps * 0.52)}px`);
    }

    // Create aim indicator for current
    this.aimIndicator?.destroy();
    this.aimIndicatorText?.destroy();

    if (this.currentIsRock) {
      const ds = ROCK_RADIUS * 2.6;
      this.aimIndicator = this.add
        .image(GAME_WIDTH / 2, DROP_Y, 'rock')
        .setAlpha(0.85).setDepth(4).setDisplaySize(ds, ds);
      this.aimIndicatorText = this.add
        .text(GAME_WIDTH / 2, DROP_Y, '🪨', {
          fontSize: `${Math.round(ROCK_RADIUS * 0.9)}px`,
          padding:  { x: 6, y: 16 },
        }).setOrigin(0.5).setAlpha(0.85).setDepth(5);
    } else {
      const curEl = ELEMENTS[this.currentLevel - 1];
      this.aimIndicator = this.add
        .image(GAME_WIDTH / 2, DROP_Y, `el_${this.currentLevel}`)
        .setAlpha(0.85).setDepth(4);
      this.aimIndicator.setDisplaySize(curEl.radius * ORB_SCALE, curEl.radius * ORB_SCALE);
      this.aimIndicatorText = this.add
        .text(GAME_WIDTH / 2, DROP_Y, curEl.emoji, {
          fontSize: `${Math.round(curEl.radius * 0.9)}px`,
          padding:  { x: 6, y: 16 },
        }).setOrigin(0.5).setAlpha(0.85).setDepth(5);
    }
  }

  private setupInput() {
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.gameOver || !this.canDrop) return;
      this.executeDrop(p.x);
    });
  }

  private executeDrop(pointerX: number) {
    let radius: number;
    if (this.currentIsRock) {
      radius = ROCK_RADIUS;
    } else {
      radius = ELEMENTS[this.currentLevel - 1].radius;
    }
    const x = Phaser.Math.Clamp(pointerX, WALL_T + radius, GAME_WIDTH - WALL_T - radius);

    this.sfx.resume();
    this.sfx.playDrop();

    if (this.currentIsRock) {
      this.spawnRock(x, DROP_Y);
    } else {
      this.spawnElement(x, DROP_Y, this.currentLevel);
    }

    this.lastDropTime = this.time.now;
    this.dropCount++;
    if (this.dropCount === 1) this.tutorial?.onFirstDrop();

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

  // ───────────────────────────────────────────────────────────────────────────
  //  SPAWN HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  private spawnElement(x: number, y: number, level: number): Phaser.Physics.Matter.Image {
    const el  = ELEMENTS[level - 1];
    const img = this.matter.add.image(x, y, `el_${level}`);

    img.setCircle(el.radius);
    img.setBounce(0.1);
    img.setFriction(0.5);
    img.setFrictionAir(0.01);
    img.setDepth(3);
    img.setData('level', level);
    img.setData('hits',  0);    // 0 = pristine, 1 = cracked, will shatter at 2nd hit
    img.setData('isRock', false);

    const uid = `${Date.now()}_${Math.random()}`;
    img.setData('uid', uid);

    const fontSize = Math.round(el.radius * 0.9);
    const txt = this.add.text(x, y, el.emoji, {
      fontSize: `${fontSize}px`,
      padding:  { x: 6, y: 16 },
    }).setOrigin(0.5).setDepth(4);
    this.elementTexts.set(uid, txt);

    this.activeEls.push(img);
    return img;
  }

  private spawnRock(x: number, y: number): Phaser.Physics.Matter.Image {
    const img = this.matter.add.image(x, y, 'rock');
    const ds  = ROCK_RADIUS * 2.6;
    img.setDisplaySize(ds, ds);
    img.setCircle(ROCK_RADIUS);
    img.setBounce(0.45);   // more bounce than elements
    img.setFriction(0.3);
    img.setFrictionAir(0.008);
    img.setDepth(3);
    img.setData('isRock', true);

    const uid = `rock_${Date.now()}_${Math.random()}`;
    img.setData('uid', uid);

    this.activeRocks.push(img);
    return img;
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  OVERLAYS (emoji texts + crack graphics)
  // ───────────────────────────────────────────────────────────────────────────

  private syncOverlays() {
    for (const el of this.activeEls) {
      if (!el.active) continue;
      const uid = el.getData('uid') as string;
      const txt = this.elementTexts.get(uid);
      if (txt) txt.setPosition(el.x, el.y).setRotation(el.rotation);
      const crack = this.crackOverlays.get(uid);
      if (crack) crack.setPosition(el.x, el.y).setRotation(el.rotation);
    }
  }

  // Draw 5 crack lines from (0,0) in local coordinates, seeded by uid hash
  private addCrackOverlay(el: Phaser.Physics.Matter.Image) {
    const uid  = el.getData('uid') as string;
    const r    = ELEMENTS[(el.getData('level') as number) - 1].radius;
    const rand = seededRng(hashStr(uid));

    const gfx = this.add.graphics().setDepth(4.2);
    gfx.lineStyle(1.5, 0x552200, 0.85);
    for (let i = 0; i < 5; i++) {
      const a0 = rand() * Math.PI * 2;
      gfx.beginPath();
      gfx.moveTo(0, 0);
      let lx = 0, ly = 0;
      for (let j = 0; j < 3; j++) {
        lx += Math.cos(a0 + (rand() - 0.5) * 0.8) * r * 0.30;
        ly += Math.sin(a0 + (rand() - 0.5) * 0.8) * r * 0.30;
        gfx.lineTo(lx, ly);
      }
      gfx.strokePath();
    }

    gfx.setPosition(el.x, el.y).setRotation(el.rotation);
    this.crackOverlays.set(uid, gfx);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  MERGE
  // ───────────────────────────────────────────────────────────────────────────

  private setupCollisions() {
    this.matter.world.on('collisionstart', (event: any) => {
      for (const pair of event.pairs) {
        const goA = pair.bodyA.gameObject as Phaser.Physics.Matter.Image | null;
        const goB = pair.bodyB.gameObject as Phaser.Physics.Matter.Image | null;
        if (!goA || !goB) continue;

        const aIsRock = goA.getData('isRock');
        const bIsRock = goB.getData('isRock');

        if (!aIsRock && !bIsRock) {
          // element vs element — try merge
          this.tryMerge(goA, goB);
        } else if (aIsRock && !bIsRock) {
          this.tryRockHit(goA, goB);
        } else if (!aIsRock && bIsRock) {
          this.tryRockHit(goB, goA);
        }
        // rock vs rock — do nothing
      }
    });
  }

  private tryMerge(a: Phaser.Physics.Matter.Image, b: Phaser.Physics.Matter.Image) {
    if (!a?.active || !b?.active) return;
    if (a.getData('merging') || b.getData('merging')) return;

    const lvA: number = a.getData('level');
    const lvB: number = b.getData('level');
    if (!lvA || !lvB || lvA !== lvB || lvA >= ELEMENTS.length) return;

    a.setData('merging', true);
    b.setData('merging', true);

    this.time.delayedCall(16, () => {
      if (!a.active || !b.active) return;
      this.doMerge(a, b, lvA);
    });
  }

  private doMerge(a: Phaser.Physics.Matter.Image, b: Phaser.Physics.Matter.Image, level: number) {
    const mx  = (a.x + b.x) / 2;
    const my  = (a.y + b.y) / 2;
    const nxt = level + 1;

    this.addScore(ELEMENTS[level - 1].points);
    this.sfx.playMerge(level);
    this.particles.burst(mx, my, level);
    this.flashMerge(mx, my, level);
    this.showMergeLabel(mx, my, nxt);
    this.tutorial?.onFirstMerge();

    this.cameras.main.shake(55 + level * 8, 0.002 + level * 0.0008);
    this.time.timeScale = 0;
    setTimeout(() => {
      if (!this.scene.isActive('GameScene')) return;
      this.time.timeScale = 1;
    }, 50 + level * 5);

    const uidA = a.getData('uid') as string;
    const uidB = b.getData('uid') as string;
    const txtA = this.elementTexts.get(uidA);
    const txtB = this.elementTexts.get(uidB);
    const crA  = this.crackOverlays.get(uidA);
    const crB  = this.crackOverlays.get(uidB);

    this.tweens.add({
      targets: [a, b, txtA, txtB, crA, crB].filter(Boolean),
      alpha: 0,
      duration: 100,
      onComplete: () => {
        txtA?.destroy(); this.elementTexts.delete(uidA);
        txtB?.destroy(); this.elementTexts.delete(uidB);
        crA?.destroy();  this.crackOverlays.delete(uidA);
        crB?.destroy();  this.crackOverlays.delete(uidB);
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

  // ───────────────────────────────────────────────────────────────────────────
  //  ROCK HIT SYSTEM
  // ───────────────────────────────────────────────────────────────────────────

  private tryRockHit(rock: Phaser.Physics.Matter.Image, el: Phaser.Physics.Matter.Image) {
    if (!rock.active || !el.active) return;
    if (el.getData('merging')) return;
    if (rock.getData('used')) return; // each rock hits once then vanishes

    rock.setData('used', true);

    const hits = (el.getData('hits') as number ?? 0) + 1;
    el.setData('hits', hits);

    if (hits === 1) {
      el.setTint(0xCC7755);
      this.addCrackOverlay(el);
    } else {
      this.shatterElement(el);
    }

    // Rock bounces away for ~350ms then fades out and is removed
    this.time.delayedCall(350, () => {
      if (!rock.active) return;
      this.tweens.add({
        targets: rock, alpha: 0, duration: 180,
        onComplete: () => {
          this.activeRocks = this.activeRocks.filter(r => r !== rock);
          if (rock.active) rock.destroy();
        },
      });
    });
  }

  private shatterElement(el: Phaser.Physics.Matter.Image) {
    if (!el.active) return;
    const level = el.getData('level') as number;
    const x     = el.x;
    const y     = el.y;
    const uid   = el.getData('uid') as string;

    // Award 75% of points
    this.addScore(Math.round(ELEMENTS[level - 1].points * 0.75));

    // Burst particles
    this.particles.burst(x, y, level);
    this.cameras.main.shake(80, 0.008);

    // Remove crack overlay
    const crack = this.crackOverlays.get(uid);
    crack?.destroy();
    this.crackOverlays.delete(uid);

    // Remove emoji text
    const txt = this.elementTexts.get(uid);
    txt?.destroy();
    this.elementTexts.delete(uid);

    // Remove from active list and destroy
    this.activeEls = this.activeEls.filter(e => e !== el);
    el.destroy();

    // Trigger release effect
    this.triggerRelease(x, y, level, false);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  SCORE
  // ───────────────────────────────────────────────────────────────────────────

  private addScore(pts: number) {
    this.score += pts;
    this.scoreText.setText(this.score.toString());
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.bestText.setText(this.bestScore.toString());
      localStorage.setItem('elementra_best', this.bestScore.toString());
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  ELEMENT RELEASE DISPATCH
  // ───────────────────────────────────────────────────────────────────────────

  /** Remove an element cleanly (award 75% pts, particles, trigger release effect). */
  private releaseElement(el: Phaser.Physics.Matter.Image, noChain = false) {
    if (!el.active) return;
    const level = el.getData('level') as number;
    const x     = el.x;
    const y     = el.y;
    const uid   = el.getData('uid') as string;

    this.addScore(Math.round(ELEMENTS[level - 1].points * 0.75));
    this.particles.burst(x, y, level);

    const crack = this.crackOverlays.get(uid);
    crack?.destroy();
    this.crackOverlays.delete(uid);

    const txt = this.elementTexts.get(uid);
    txt?.destroy();
    this.elementTexts.delete(uid);

    this.activeEls = this.activeEls.filter(e => e !== el);
    el.destroy();

    this.triggerRelease(x, y, level, noChain);
  }

  private triggerRelease(x: number, y: number, level: number, noChain: boolean) {
    switch (level) {
      case 1:  this.releaseL1Spark(x, y);                  break;
      case 2:  this.releaseL2Flame(x, y);                  break;
      case 3:  this.releaseL3Water(x, y);                  break;
      case 4:  this.releaseL4Earth(x, y);                  break;
      case 5:  this.releaseL5Wind(x, y);                   break;
      case 6:  this.releaseL6Lightning(x, y);              break;
      case 7:  this.releaseL7Ice(x, y, noChain);           break;
      case 8:  this.releaseL8Lava(x, y);                   break;
      case 9:  this.releaseL9Storm(x, y);                  break;
      case 10: this.releaseL10Cosmos(x, y);                break;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  RELEASE EFFECTS
  // ───────────────────────────────────────────────────────────────────────────

  /** L1 Spark — orange particle burst */
  private releaseL1Spark(x: number, y: number) {
    const em = this.add.particles(0, 0, 'ptcl', {
      speed:    { min: 80, max: 220 },
      angle:    { min: 0,  max: 360 },
      scale:    { start: 0.7, end: 0 },
      alpha:    { start: 1,   end: 0 },
      lifespan: 600,
      tint:     0xFF8800,
      emitting: false,
    }).setDepth(10);
    em.explode(18, x, y);
    this.time.delayedCall(800, () => em.destroy());
  }

  /** L2 Flame — AOE ~92px, destroy elements within radius, fire ring */
  private releaseL2Flame(x: number, y: number) {
    const RADIUS = 92;
    const toDestroy = this.activeEls.filter(e =>
      e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) <= RADIUS,
    );
    toDestroy.forEach(e => this.releaseElement(e, true));

    // Expanding fire ring
    const ring = this.add.graphics().setDepth(10);
    let t = 0;
    const timer = this.time.addEvent({
      delay: 16, repeat: 18,
      callback: () => {
        t++;
        const r = (t / 18) * RADIUS;
        ring.clear();
        ring.lineStyle(4, 0xFF4400, 1 - t / 18);
        ring.strokeCircle(x, y, r);
      },
    });
    this.time.delayedCall(16 * 20, () => { timer.destroy(); ring.destroy(); });
  }

  /** L3 Water — raise water level by 1 */
  private releaseL3Water(_x: number, _y: number) {
    if (this.waterLevels >= this.MAX_WATER) return;
    this.waterLevels++;
    this.applyWaterLevel();
  }

  /** L4 Earth — lower water level by 1, destroy 30px-wide column below */
  private releaseL4Earth(x: number, y: number) {
    if (this.waterLevels > 0) {
      this.waterLevels--;
      this.applyWaterLevel();
    }
    // Destroy elements in column below
    const COL_W = 30;
    const toDestroy = this.activeEls.filter(e =>
      e.active && Math.abs(e.x - x) <= COL_W / 2 && e.y > y,
    );
    toDestroy.forEach(e => this.releaseElement(e, true));

    // Dark streak falling visual
    const streak = this.add.graphics().setDepth(10);
    streak.fillStyle(0x331100, 0.7);
    streak.fillRect(x - 15, y, 30, GAME_HEIGHT - WALL_T - y);
    this.tweens.add({
      targets: streak, alpha: 0, duration: 500,
      onComplete: () => streak.destroy(),
    });
  }

  /** L5 Wind — random velocity impulse to all active elements */
  private releaseL5Wind(_x: number, _y: number) {
    for (const el of this.activeEls) {
      if (!el.active) continue;
      const body = el.body as any;
      body.velocity.x += (Math.random() - 0.5) * 24;
      body.velocity.y += (Math.random() - 0.5) * 24;
    }
    // Purple/white swirl particles
    const em = this.add.particles(0, 0, 'ptcl', {
      speed:    { min: 60, max: 200 },
      angle:    { min: 0,  max: 360 },
      scale:    { start: 0.6, end: 0 },
      alpha:    { start: 0.9, end: 0 },
      lifespan: 700,
      tint:     [0xCC88FF, 0xFFFFFF, 0xAA66EE],
      emitting: false,
    }).setDepth(10);
    em.explode(24, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.time.delayedCall(900, () => em.destroy());
  }

  /** L6 Lightning — vertical bolt at x, destroys elements within 28px of that column */
  private releaseL6Lightning(x: number, _y: number) {
    const COL_W = 28;
    const toDestroy = this.activeEls.filter(e =>
      e.active && Math.abs(e.x - x) <= COL_W,
    );
    toDestroy.forEach(e => this.releaseElement(e, true));

    // Bright yellow bolt visual
    const bolt = this.add.graphics().setDepth(12);
    const rand = seededRng(Date.now() & 0xffff);
    bolt.lineStyle(3, 0xFFFF44, 1.0);
    bolt.beginPath();
    let bx = x;
    bolt.moveTo(bx, CONTAINER_TOP);
    for (let sy = CONTAINER_TOP + 30; sy < GAME_HEIGHT - WALL_T; sy += 30) {
      bx = x + (rand() - 0.5) * 18;
      bolt.lineTo(bx, sy);
    }
    bolt.strokePath();

    // Glow pass
    bolt.lineStyle(8, 0xFFFF88, 0.3);
    bolt.beginPath();
    bx = x;
    bolt.moveTo(bx, CONTAINER_TOP);
    let bx2 = x;
    const rand2 = seededRng(Date.now() & 0xffff);
    for (let sy = CONTAINER_TOP + 30; sy < GAME_HEIGHT - WALL_T; sy += 30) {
      bx2 = x + (rand2() - 0.5) * 18;
      bolt.lineTo(bx2, sy);
    }
    bolt.strokePath();

    this.cameras.main.flash(120, 255, 255, 200);
    this.tweens.add({
      targets: bolt, alpha: 0, duration: 300,
      onComplete: () => bolt.destroy(),
    });
  }

  /** L7 Ice — destroy elements within ~110px AND trigger their release (no chain) */
  private releaseL7Ice(x: number, y: number, noChain: boolean) {
    const RADIUS = 110;
    const toDestroy = this.activeEls.filter(e =>
      e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) <= RADIUS,
    );
    toDestroy.forEach(e => this.releaseElement(e, noChain ? true : false));

    // Expanding ice ring visual
    const ring = this.add.graphics().setDepth(10);
    let t = 0;
    const timer = this.time.addEvent({
      delay: 16, repeat: 20,
      callback: () => {
        t++;
        const r = (t / 20) * RADIUS;
        ring.clear();
        ring.lineStyle(5, 0xAAEEFF, 1 - t / 20);
        ring.strokeCircle(x, y, r);
      },
    });
    this.time.delayedCall(16 * 22, () => { timer.destroy(); ring.destroy(); });
  }

  /** L8 Lava — destroy horizontal band (±65px Y) + column below (±30px X, y > lava.y) */
  private releaseL8Lava(x: number, y: number) {
    const BAND_Y = 65;
    const COL_X  = 30;
    const toDestroy = this.activeEls.filter(e => {
      if (!e.active) return false;
      const inBand   = Math.abs(e.y - y) <= BAND_Y;
      const inColumn = Math.abs(e.x - x) <= COL_X && e.y > y;
      return inBand || inColumn;
    });
    toDestroy.forEach(e => this.releaseElement(e, true));

    // Visual streaks
    const gfx = this.add.graphics().setDepth(10);
    gfx.fillStyle(0xFF4400, 0.55);
    gfx.fillRect(WALL_T, y - BAND_Y, GAME_WIDTH - WALL_T * 2, BAND_Y * 2);
    gfx.fillRect(x - COL_X, y, COL_X * 2, GAME_HEIGHT - WALL_T - y);
    this.tweens.add({
      targets: gfx, alpha: 0, duration: 600,
      onComplete: () => gfx.destroy(),
    });
  }

  /** L9 Storm — random impulse to ALL elements + destroy column ~38px at storm X */
  private releaseL9Storm(x: number, y: number) {
    for (const el of this.activeEls) {
      if (!el.active) continue;
      const body = el.body as any;
      body.velocity.x += (Math.random() - 0.5) * 36;
      body.velocity.y += (Math.random() - 0.5) * 36;
    }
    const COL_W = 38;
    const toDestroy = this.activeEls.filter(e =>
      e.active && Math.abs(e.x - x) <= COL_W / 2,
    );
    toDestroy.forEach(e => this.releaseElement(e, true));

    // Purple vortex ring
    const ring = this.add.graphics().setDepth(10);
    let t = 0;
    const timer = this.time.addEvent({
      delay: 16, repeat: 22,
      callback: () => {
        t++;
        const r = (t / 22) * 140;
        ring.clear();
        ring.lineStyle(6, 0x9900EE, 1 - t / 22);
        ring.strokeCircle(x, y, r);
      },
    });
    this.time.delayedCall(16 * 24, () => { timer.destroy(); ring.destroy(); });
  }

  /** L10 Cosmos — destroy ALL elements with black-hole suck animation */
  private releaseL10Cosmos(x: number, y: number) {
    const targets = [...this.activeEls];

    // Flash camera purple
    this.cameras.main.flash(300, 80, 0, 180);

    // Show COSMOS CLEAR! text
    const cosmosText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, '🌌 COSMOS CLEAR!', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '32px', color: '#CC88FF', fontStyle: 'bold',
      stroke: '#220044', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30).setAlpha(0);
    this.tweens.add({
      targets: cosmosText, alpha: 1, scale: 1.1, duration: 400, ease: 'Back.Out',
    });
    this.time.delayedCall(2000, () => {
      this.tweens.add({ targets: cosmosText, alpha: 0, duration: 400, onComplete: () => cosmosText.destroy() });
    });

    targets.forEach((el, i) => {
      if (!el.active) return;
      const uid   = el.getData('uid') as string;
      const level = el.getData('level') as number;
      const ex    = el.x;
      const ey    = el.y;

      this.addScore(Math.round(ELEMENTS[level - 1].points * 0.75));

      // Remove emoji text + crack overlay
      const txt   = this.elementTexts.get(uid);
      txt?.destroy(); this.elementTexts.delete(uid);
      const crack = this.crackOverlays.get(uid);
      crack?.destroy(); this.crackOverlays.delete(uid);

      // Create ghost image (no physics) for the suck animation
      const ghost = this.add.image(ex, ey, `el_${level}`)
        .setDisplaySize(ELEMENTS[level - 1].radius * 2, ELEMENTS[level - 1].radius * 2)
        .setDepth(25).setAlpha(0.9);

      // Destroy the physics object immediately
      this.activeEls = this.activeEls.filter(e => e !== el);
      el.destroy();

      this.time.delayedCall(i * 40, () => {
        this.tweens.add({
          targets: ghost,
          x: x, y: y,
          scaleX: 0.05, scaleY: 0.05,
          alpha: 0,
          duration: 600, ease: 'Cubic.In',
          onComplete: () => ghost.destroy(),
        });
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  WATER LEVEL SYSTEM
  // ───────────────────────────────────────────────────────────────────────────

  private applyWaterLevel() {
    // Remove old water floor body if exists
    if (this.waterBody) {
      this.matter.world.remove(this.waterBody as MatterJS.BodyType, true);
      this.waterBody = null;
    }

    this.waterGfx.clear();

    if (this.waterLevels <= 0) return;

    const surfaceY = GAME_HEIGHT - WALL_T - this.waterLevels * this.WATER_STEP;

    // Create static water floor body
    const floorBody = this.matter.add.rectangle(
      GAME_WIDTH / 2,
      surfaceY + WALL_T / 2,
      GAME_WIDTH - WALL_T * 2,
      WALL_T,
      { isStatic: true, label: 'waterfloor', friction: 0.08, restitution: 0.1 },
    );
    this.waterBody = floorBody as unknown as MatterJS.BodyType;

    // Push elements below new floor upward
    for (const el of this.activeEls) {
      if (!el.active) continue;
      if (el.y > surfaceY) {
        const body = el.body as any;
        body.velocity.y = -8;
      }
    }

    // waterGfx is drawn every frame by updateWaterWave()
  }

  // Animated water surface — redrawn every frame in update()
  private updateWaterWave() {
    this.waterGfx.clear();
    if (this.waterLevels <= 0) return;

    this.waterPhase += 0.045;

    const x0      = WALL_T;
    const x1      = GAME_WIDTH - WALL_T;
    const w       = x1 - x0;
    const yB      = GAME_HEIGHT - WALL_T;
    const baseY   = GAME_HEIGHT - WALL_T - this.waterLevels * this.WATER_STEP;
    const AMP     = 5;
    const STEPS   = 60;
    const p       = this.waterPhase;

    // Shared helper: y of the wave at progress t
    const waveY = (t: number, phaseShift: number) =>
      baseY
      + Math.sin(t * Math.PI * 2.8 + p + phaseShift) * AMP
      + Math.sin(t * Math.PI * 5.1 - p * 0.65 + phaseShift) * AMP * 0.38;

    // ── Deep fill (dark blue body) ──────────────────────────────────────────
    this.waterGfx.fillStyle(0x002266, 0.55);
    this.waterGfx.beginPath();
    this.waterGfx.moveTo(x0, yB);
    this.waterGfx.lineTo(x0, waveY(0, 0));
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      this.waterGfx.lineTo(x0 + t * w, waveY(t, 0));
    }
    this.waterGfx.lineTo(x1, yB);
    this.waterGfx.closePath();
    this.waterGfx.fillPath();

    // ── Mid fill (lighter blue, second wave for depth) ──────────────────────
    this.waterGfx.fillStyle(0x1166CC, 0.28);
    this.waterGfx.beginPath();
    this.waterGfx.moveTo(x0, yB);
    this.waterGfx.lineTo(x0, waveY(0, 0.8) + 6);
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      this.waterGfx.lineTo(x0 + t * w, waveY(t, 0.8) + 6);
    }
    this.waterGfx.lineTo(x1, yB);
    this.waterGfx.closePath();
    this.waterGfx.fillPath();

    // ── Surface highlight wave ──────────────────────────────────────────────
    this.waterGfx.lineStyle(2.2, 0x44BBFF, 0.82);
    this.waterGfx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const wx = x0 + t * w;
      const wy = waveY(t, 0);
      if (i === 0) this.waterGfx.moveTo(wx, wy);
      else         this.waterGfx.lineTo(wx, wy);
    }
    this.waterGfx.strokePath();

    // ── Foam crest (brighter, faster secondary wave slightly above) ─────────
    this.waterGfx.lineStyle(1.4, 0xAAEEFF, 0.48);
    this.waterGfx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const t  = i / STEPS;
      const wx = x0 + t * w;
      const wy = baseY - 4
        + Math.sin(t * Math.PI * 3.9 + p * 1.6) * AMP * 0.55
        + Math.sin(t * Math.PI * 6.5 - p * 1.1) * AMP * 0.25;
      if (i === 0) this.waterGfx.moveTo(wx, wy);
      else         this.waterGfx.lineTo(wx, wy);
    }
    this.waterGfx.strokePath();

    // ── Shimmer sparkles (small bright dashes riding the wave) ─────────────
    this.waterGfx.lineStyle(1.2, 0xCCF4FF, 0.55);
    for (let s = 0; s < 6; s++) {
      const t   = ((s / 6) + (p * 0.04) % 1);
      const wx  = x0 + (t % 1) * w;
      const wy  = waveY(t % 1, 0) - 1;
      this.waterGfx.beginPath();
      this.waterGfx.moveTo(wx - 5, wy);
      this.waterGfx.lineTo(wx + 5, wy);
      this.waterGfx.strokePath();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  UPDATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  private updateAim() {
    if (!this.canDrop || !this.aimIndicator?.visible) {
      this.dropGuide.clear();
      return;
    }

    const radius = this.currentIsRock
      ? ROCK_RADIUS
      : ELEMENTS[this.currentLevel - 1].radius;

    const px = this.input.activePointer.x;
    const x  = Phaser.Math.Clamp(px, WALL_T + radius, GAME_WIDTH - WALL_T - radius);
    this.aimIndicator.x = x;
    if (this.aimIndicatorText) this.aimIndicatorText.x = x;

    this.dropGuide.clear();
    this.dropGuide.lineStyle(1, 0xffffff, 0.2);
    const toY = GAME_HEIGHT - WALL_T;
    let   y   = DROP_Y + radius + 2;
    while (y < toY) {
      this.dropGuide.lineBetween(x, y, x, Math.min(y + 5, toY));
      y += 10;
    }
  }

  private checkGameOver() {
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
    this.time.timeScale = 1;
    gameplayStop();
    this.sfx.stopMusic();
    this.sfx.playGameOver();
    this.aimIndicator?.setVisible(false);
    this.aimIndicatorText?.setVisible(false);
    this.dropGuide.clear();

    const cx        = GAME_WIDTH / 2;
    const cy        = GAME_HEIGHT / 2;
    const isNewBest = this.score > 0 && this.score === this.bestScore;
    const finalScore = this.score;

    this.cameras.main.shake(220, 0.012);

    const overlay = this.add.rectangle(cx, cy, 320, 220, 0x000000, 0).setDepth(20);
    this.tweens.add({ targets: overlay, fillAlpha: 0.9, duration: 280 });

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

    const bw = 172, bh = 48, br = 14;
    const btnContainer = this.add.container(cx, cy + 80).setDepth(21).setAlpha(0);

    const btnShadow = this.add.graphics();
    btnShadow.fillStyle(0x000000, 0.35);
    btnShadow.fillRoundedRect(-bw/2 + 3, -bh/2 + 6, bw, bh, br);

    const btnEdge = this.add.graphics();
    btnEdge.fillStyle(0x005522, 1);
    btnEdge.fillRoundedRect(-bw/2, -bh/2 + 4, bw, bh, br);

    const btnBody = this.add.graphics();
    const drawBtnBody = (color: number, dy = 0) => {
      btnBody.clear();
      btnBody.fillStyle(color, 1);
      btnBody.fillRoundedRect(-bw/2, -bh/2 + dy, bw, bh, br);
    };
    drawBtnBody(0x00cc66);

    const btnShine = this.add.graphics();
    btnShine.fillStyle(0xffffff, 0.20);
    btnShine.fillRoundedRect(-bw/2 + 4, -bh/2 + 4, bw - 8, bh * 0.42,
      { tl: br - 4, tr: br - 4, bl: 4, br: 4 });

    const btnLabel = this.add.text(0, 0, '▶  PLAY AGAIN', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#005533', strokeThickness: 2,
    }).setOrigin(0.5);

    const btnHit = this.add.rectangle(0, 0, bw, bh);
    btnContainer.add([btnShadow, btnEdge, btnBody, btnShine, btnLabel, btnHit]);

    this.time.delayedCall(1150, () => {
      this.tweens.add({
        targets: btnContainer, alpha: 1, y: cy + 55,
        duration: 320, ease: 'Back.Out',
      });
      btnHit.setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { drawBtnBody(0x00aa55, 3); btnShine.setAlpha(0.08); })
        .on('pointerup', () => {
          btnHit.removeInteractive();
          btnContainer.setAlpha(0.5);
          const adCallbacks = {
            adStarted:  () => this.sfx.forceMute(true),
            adFinished: () => { this.sfx.forceMute(false); this.scene.restart(); },
            adError:    () => { this.sfx.forceMute(false); this.scene.restart(); },
          };
          if (isCrazyReady()) {
            requestMidgameAd(adCallbacks);
          } else {
            gdRequestMidgameAd(adCallbacks);
          }
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

  // ───────────────────────────────────────────────────────────────────────────
  //  FX HELPERS
  // ───────────────────────────────────────────────────────────────────────────

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
