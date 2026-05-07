import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { initCrazySDK } from './ads/CrazySDK';
import { initGameDistributionSDK } from './ads/GameDistributionSDK';
import { getOrCreateSoundManager } from './fx/SoundManager';

initCrazySDK();            // degrades silently off CrazyGames
initGameDistributionSDK(); // wires GD audio pause/resume events

// iOS suspends Web Audio unless a silent buffer is played within each
// user-gesture. Keep the listener persistent — iOS can re-suspend after idle.
const keepAudioAlive = () => getOrCreateSoundManager().playSilent();
document.addEventListener('touchstart', keepAudioAlive, { passive: true });
document.addEventListener('pointerdown', keepAudioAlive, { passive: true });
document.addEventListener('click',       keepAudioAlive, { passive: true });

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#07071a',
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
