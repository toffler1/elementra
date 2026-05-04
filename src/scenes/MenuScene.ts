import Phaser from 'phaser';
import { ELEMENTS, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { buildElementTextures } from '../utils/buildTextures';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  async create() {
    await buildElementTextures(this);

    // background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e);

    // decorative gradient overlay at top
    const grad = this.add.graphics();
    grad.fillGradientStyle(0x0d0d2e, 0x0d0d2e, 0x1a1a2e, 0x1a1a2e, 1);
    grad.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT / 2);

    this.buildTitle();
    this.buildElementRow();
    this.buildPlayButton();
    this.buildBestScore();

    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private buildTitle() {
    const title = this.add.text(GAME_WIDTH / 2, 175, 'ELEMENTRA', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '58px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#3333cc',
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: title, alpha: 1, y: 162,
      duration: 700, ease: 'Back.out',
    });

    this.add.text(GAME_WIDTH / 2, 222, 'Merge identical elements!', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '18px', color: '#aaaadd',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
  }

  private buildElementRow() {
    const y      = 310;
    const size   = 32;
    const gap    = 36;
    const total  = ELEMENTS.length * gap;
    const startX = (GAME_WIDTH - total) / 2 + gap / 2;

    ELEMENTS.forEach((el, i) => {
      const x   = startX + i * gap;
      const img = this.add.image(x, y, `el_${el.level}`).setDisplaySize(size, size);
      const txt = this.add.text(x, y, el.emoji, {
        fontSize: `${Math.round(size * 0.52)}px`,
        padding:  { x: 6, y: 16 },
      }).setOrigin(0.5);

      this.tweens.add({
        targets:  [img, txt],
        y:        y - 7,
        duration: 700 + i * 60,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.inOut',
        delay:    i * 70,
      });
    });

    // merge arrow hint
    this.add.text(GAME_WIDTH / 2, y + 32, '✨ + ✨  →  🔥', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '15px', color: '#7788aa',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
  }

  private buildPlayButton() {
    const cx = GAME_WIDTH / 2, cy = 415;
    const bw = 200, bh = 58, br = 18;

    const container = this.add.container(cx, cy);

    // drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillRoundedRect(-bw / 2 + 4, -bh / 2 + 8, bw, bh, br);

    // bottom depth edge (gives 3-D raised look)
    const edge = this.add.graphics();
    edge.fillStyle(0x005522, 1);
    edge.fillRoundedRect(-bw / 2, -bh / 2 + 5, bw, bh, br);

    // main button face
    const body = this.add.graphics();
    const drawBody = (color: number, dy = 0) => {
      body.clear();
      body.fillStyle(color, 1);
      body.fillRoundedRect(-bw / 2, -bh / 2 + dy, bw, bh, br);
    };
    drawBody(0x00cc66);

    // gloss highlight — top half only
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.20);
    shine.fillRoundedRect(-bw / 2 + 5, -bh / 2 + 5, bw - 10, bh * 0.42,
      { tl: br - 4, tr: br - 4, bl: 4, br: 4 });

    const label = this.add.text(0, 1, '▶  PLAY', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#005533', strokeThickness: 2,
    }).setOrigin(0.5);

    // transparent hit-rect handles pointer events
    const hit = this.add.rectangle(0, 0, bw, bh).setInteractive({ useHandCursor: true });

    container.add([shadow, edge, body, shine, label, hit]);

    hit.on('pointerover',  () => drawBody(0x00dd77));
    hit.on('pointerout',   () => drawBody(0x00cc66));
    hit.on('pointerdown',  () => { drawBody(0x00aa55, 3); shine.setAlpha(0.08); });
    hit.on('pointerup',    () => {
      drawBody(0x00cc66);
      shine.setAlpha(0.20);
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
    });

    this.tweens.add({
      targets: container, scale: 1.04,
      duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }

  private buildBestScore() {
    const best = parseInt(localStorage.getItem('elementra_best') ?? '0', 10);
    if (best <= 0) return;
    this.add.text(GAME_WIDTH / 2, 500, `🏆  Best: ${best}`, {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '17px', color: '#ffcc44',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
  }
}
