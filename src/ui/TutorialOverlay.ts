import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WALL_T, DROP_Y, CONTAINER_TOP } from '../config';

const STORAGE_KEY = 'elementra_tutorial_done';

export class TutorialOverlay {
  private scene:     Phaser.Scene;
  private layer:     Phaser.GameObjects.Container | null = null;
  private step       = 0;          // 0 = aim, 1 = merge hint
  private dismissed  = false;

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
    this.dismiss();
  }

  // ── step 1: aim & drop ────────────────────────────────────────────────

  private showAimStep() {
    const s     = this.scene;
    const cx    = GAME_WIDTH / 2;
    const arrowY = CONTAINER_TOP - 10;

    const c = s.add.container(0, 0).setDepth(20);
    this.layer = c;

    // dim backdrop for readability — only top strip
    const dim = s.add.graphics();
    dim.fillStyle(0x000000, 0.45);
    dim.fillRect(0, 0, GAME_WIDTH, CONTAINER_TOP + 20);
    c.add(dim);

    // moving aim-line (mimics the drop guide)
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

    // SKIP button — dedicated hit area so a game-drop doesn't accidentally dismiss
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

    // animate aim line + arrow left → right → left
    const range = (GAME_WIDTH / 2) - WALL_T - 30;
    s.tweens.add({
      targets: { x: cx },
      x: cx + range,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      onUpdate: (_t, obj) => {
        drawLine(obj.x);
        arrow.x = obj.x;
        label.x = obj.x;
      },
    });

    // bounce arrow
    s.tweens.add({
      targets: arrow, y: arrowY + 6,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });

    // auto-dismiss after 8 s so it never blocks
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

    // background pill
    const pill = s.add.graphics();
    pill.fillStyle(0x000000, 0.60);
    pill.fillRoundedRect(cx - 138, y - 18, 276, 40, 12);
    c.add(pill);

    // text with emoji icons
    const hint = s.add.text(cx, y + 2,
      '✨ + ✨  →  🔥  Merge identical elements!', {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '14px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
    c.add(hint);

    // auto-hide after 4 s
    s.time.delayedCall(4000, () => this.dismiss());
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
