import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { initCrazySDK } from './ads/CrazySDK';
import { getOrCreateSoundManager } from './fx/SoundManager';

initCrazySDK(); // fire and forget — degrades silently off-platform

// iOS suspends Web Audio unless a silent buffer is played within each
// user-gesture. Keep the listener persistent — iOS can re-suspend after idle.
const keepAudioAlive = () => getOrCreateSoundManager().playSilent();
document.addEventListener('touchstart', keepAudioAlive, { passive: true });
document.addEventListener('pointerdown', keepAudioAlive, { passive: true });

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 2 },
      debug: false,
    },
  },
  scene: [MenuScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  parent: document.body,
};

new Phaser.Game(config);
