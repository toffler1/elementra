import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WALL_T, DROP_Y, CONTAINER_TOP } from '../config';

const STORAGE_KEY = 'elementra_tutorial_done';

export class TutorialOverlay {
  private scene:    Phaser.Scene;
  private layer:    Phaser.GameObjects.Container | null = null;
  private step      = 0;       // 0 = aim, 1 = merge hint, 2 = rock hint
  private dismissed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  static shouldShow(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  }

  // ── public lifecycle ───────────────────────────────────────────────────

  show() {
    if (this.dismissed) return;
    this.showAimStep();
  }

  /** Call after the player's first successful drop */
  onFirstDrop() {
    if (this.dismissed || this.step !== 0) return;
    this.step = 1;
    this.layer?.destroy();
    this.layer = null;
    this.showMergeHint();
  }

  /** Call after the player's first merge */
  onFirstMerge() {
    if (this.dismissed || this.step !== 1) return;
    this.advanceToRockHint();
  }

  // ── step 1: aim & drop ────────────────────────────────────────────────

  private showAimStep() {
    const s      = this.scene;
    const cx     = GAME_WIDTH / 2;
    const arrowY = CONTAINER_TOP - 10;

    const c = s.add.container(0, 0).setDepth(20);
    this.layer = c;

    // dim backdrop — only top strip
    const dim = s.add.graphics();
    dim.fillStyle(0x000000, 0.45);
    dim.fillRect(0, 0, GAME_WIDTH, CONTAINER_TOP + 20);
    c.add(dim);

    // animated aim line
    const aimLine = s.add.graphics();
    c.add(aimLine);
    const drawLine = (x: number) => {
      aimLine.clear();
      aimLine.lineStyle(1, 0xffffff, 0.5);
      aimLine.lineBetween(x, CONTAINER_TOP, x, GAME_HEIGHT - WALL_T);
    };
    drawLine(cx);

    // bouncing arrow
    const arrow = s.add.text(cx, arrowY, '▼', {
      fontSize: '24px', color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0.9);
    c.add(arrow);

    // label
    const label = s.add.text(cx, arrowY - 28, 'Move & tap to drop', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '16px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    c.add(label);

    // SKIP button
    const skipBg = s.add.graphics();
    skipBg.fillStyle(0x000000, 0.50);
    skipBg.fillRoundedRect(GAME_WIDTH - 68, GAME_HEIGHT - 38, 58, 26, 8);
    const skipTxt = s.add.text(GAME_WIDTH - 39, GAME_HEIGHT - 25, 'SKIP', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '13px', color: '#aabbcc',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(21).setInteractive({ useHandCursor: true });
    skipTxt.on('pointerup', (_p: any, _lx: any, _ly: any, event: any) => {
      event.stopPropagation();
      this.dismiss();
    });
    c.add([skipBg, skipTxt]);

    // sweep aim line left ↔ right
    const range = (GAME_WIDTH / 2) - WALL_T - 30;
    s.tweens.add({
      targets: { x: cx },
      x: cx + range,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      onUpdate: (_t, obj) => {
        drawLine(obj.x);
        arrow.x = obj.x;
        label.x = obj.x;
      },
    });

    s.tweens.add({
      targets: arrow, y: arrowY + 6,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });

    // auto-advance after 8 s
    s.time.delayedCall(8000, () => {
      if (!this.dismissed && this.step === 0) this.dismiss();
    });
  }

  // ── step 2: merge hint ────────────────────────────────────────────────

  private showMergeHint() {
    if (this.dismissed) return;

    const s  = this.scene;
    const cx = GAME_WIDTH / 2;
    const y  = CONTAINER_TOP + 44;

    const c = s.add.container(0, 0).setDepth(20).setAlpha(0);
    this.layer = c;
    s.tweens.add({ targets: c, alpha: 1, duration: 300 });

    const pill = s.add.graphics();
    pill.fillStyle(0x000000, 0.60);
    pill.fillRoundedRect(cx - 138, y - 18, 276, 40, 12);
    c.add(pill);

    const hint = s.add.text(cx, y + 2,
      '✨ + ✨  →  🔥  Merge identical elements!', {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '14px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
    c.add(hint);

    // after 4 s advance to rock hint regardless of merge
    s.time.delayedCall(4000, () => {
      if (!this.dismissed && this.step === 1) this.advanceToRockHint();
    });
  }

  // ── step 3: rock hint ─────────────────────────────────────────────────

  private advanceToRockHint() {
    this.step = 2;
    this.layer?.destroy();
    this.layer = null;
    this.showRockHint();
  }

  private showRockHint() {
    if (this.dismissed) return;

    const s  = this.scene;
    const cx = GAME_WIDTH / 2;
    const y  = CONTAINER_TOP + 72;

    const c = s.add.container(0, 0).setDepth(20).setAlpha(0);
    this.layer = c;
    s.tweens.add({ targets: c, alpha: 1, duration: 300 });

    // card background with brown/stone tint
    const card = s.add.graphics();
    card.fillStyle(0x1a0a00, 0.82);
    card.fillRoundedRect(cx - 158, y - 30, 316, 68, 14);
    card.lineStyle(1.5, 0xaa7733, 0.55);
    card.strokeRoundedRect(cx - 158, y - 30, 316, 68, 14);
    c.add(card);

    // rock icon (small image if texture exists, otherwise emoji fallback)
    const rockIcon = s.add.text(cx - 130, y - 8, '🪨', {
      fontSize: '22px',
    }).setOrigin(0.5);
    c.add(rockIcon);

    // line 1
    const line1 = s.add.text(cx + 12, y - 10,
      'Rocks crack marbles on impact!', {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '13px', color: '#ddbb88',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
    c.add(line1);

    // line 2
    const line2 = s.add.text(cx + 12, y + 13,
      '💥  2nd hit shatters & releases their power!', {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '12px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
    c.add(line2);

    // SKIP button (reuse style)
    const skipBg = s.add.graphics();
    skipBg.fillStyle(0x000000, 0.50);
    skipBg.fillRoundedRect(GAME_WIDTH - 68, GAME_HEIGHT - 38, 58, 26, 8);
    const skipTxt = s.add.text(GAME_WIDTH - 39, GAME_HEIGHT - 25, 'SKIP', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '13px', color: '#aabbcc',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(21).setInteractive({ useHandCursor: true });
    skipTxt.on('pointerup', (_p: any, _lx: any, _ly: any, event: any) => {
      event.stopPropagation();
      this.dismiss();
    });
    c.add([skipBg, skipTxt]);

    // rock icon animation: small bounce
    s.tweens.add({
      targets: rockIcon, y: rockIcon.y - 5,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });

    // auto-dismiss after 5 s
    s.time.delayedCall(5000, () => this.dismiss());
  }

  // ── dismiss ───────────────────────────────────────────────────────────

  private dismiss() {
    if (this.dismissed) return;
    this.dismissed = true;
    localStorage.setItem(STORAGE_KEY, '1');

    if (this.layer) {
      this.scene.tweens.add({
        targets: this.layer, alpha: 0, duration: 250,
        onComplete: () => { this.layer?.destroy(); this.layer = null; },
      });
    }
  }
}
