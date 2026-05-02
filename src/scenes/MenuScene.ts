import Phaser from 'phaser';
import { ELEMENTS, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { buildElementTextures } from '../utils/buildTextures';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    buildElementTextures(this);

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
    this.add.text(GAME_WIDTH / 2, 155, 'ELEMENTRA', {
      fontSize: '52px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#3333cc',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    // fade + slide in
    const title = this.add.text(GAME_WIDTH / 2, 175, 'ELEMENTRA', {
      fontSize: '52px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#3333cc',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: title, alpha: 1, y: 165,
      duration: 700, ease: 'Back.out',
    });

    this.add.text(GAME_WIDTH / 2, 222, 'Gleiche Elemente verschmelzen!', {
      fontSize: '15px', color: '#7777aa',
    }).setOrigin(0.5).setAlpha(0.85);
  }

  private buildElementRow() {
    const y      = 310;
    const size   = 32;
    const gap    = 36;
    const total  = ELEMENTS.length * gap;
    const startX = (GAME_WIDTH - total) / 2 + gap / 2;

    ELEMENTS.forEach((el, i) => {
      const img = this.add.image(startX + i * gap, y, `el_${el.level}`)
        .setDisplaySize(size, size);

      // staggered floating animation
      this.tweens.add({
        targets:  img,
        y:        y - 7,
        duration: 700 + i * 60,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.inOut',
        delay:    i * 70,
      });
    });

    // merge arrow hint
    this.add.text(GAME_WIDTH / 2, y + 30, '✨ + ✨  →  🔥', {
      fontSize: '13px', color: '#556677',
    }).setOrigin(0.5);
  }

  private buildPlayButton() {
    const btn = this.add.text(GAME_WIDTH / 2, 415, '▶  SPIELEN', {
      fontSize: '26px',
      color: '#00ff88',
      backgroundColor: '#003322',
      padding: { x: 32, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover',  () => btn.setStyle({ color: '#ffffff', backgroundColor: '#005533' }));
    btn.on('pointerout',   () => btn.setStyle({ color: '#00ff88', backgroundColor: '#003322' }));
    btn.on('pointerdown',  () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
    });

    this.tweens.add({
      targets: btn, scale: 1.04,
      duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }

  private buildBestScore() {
    const best = parseInt(localStorage.getItem('elementra_best') ?? '0', 10);
    if (best <= 0) return;
    this.add.text(GAME_WIDTH / 2, 490, `🏆  Bestleistung: ${best}`, {
      fontSize: '15px', color: '#665500',
    }).setOrigin(0.5);
  }
}
