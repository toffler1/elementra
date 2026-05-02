export interface ElementConfig {
  level:  number;
  name:   string;
  emoji:  string;
  color:  number;
  radius: number;
  points: number;
}

export const ELEMENTS: ElementConfig[] = [
  { level: 1,  name: 'Spark',     emoji: '✨', color: 0xFF6B35, radius: 18, points: 10   },
  { level: 2,  name: 'Flame',     emoji: '🔥', color: 0xFF2200, radius: 26, points: 20   },
  { level: 3,  name: 'Water',     emoji: '💧', color: 0x0099FF, radius: 34, points: 40   },
  { level: 4,  name: 'Earth',     emoji: '⛰️', color: 0x9B6B3A, radius: 42, points: 80   },
  { level: 5,  name: 'Wind',      emoji: '💨', color: 0x99CCFF, radius: 50, points: 160  },
  { level: 6,  name: 'Lightning', emoji: '⚡', color: 0xFFDD00, radius: 58, points: 320  },
  { level: 7,  name: 'Ice',       emoji: '❄️', color: 0xCCEEFF, radius: 66, points: 640  },
  { level: 8,  name: 'Lava',      emoji: '🌋', color: 0xFF4400, radius: 74, points: 1280 },
  { level: 9,  name: 'Storm',     emoji: '🌪️', color: 0xAA00EE, radius: 82, points: 2560 },
  { level: 10, name: 'Cosmos',    emoji: '🌌', color: 0x9933FF, radius: 90, points: 5120 },
];

export const GAME_WIDTH     = 400;
export const GAME_HEIGHT    = 700;
export const WALL_T         = 20;
export const CONTAINER_TOP  = 90;
export const DROP_Y         = 55;
export const DANGER_Y       = 140;
export const MAX_DROP_LEVEL = 4;
