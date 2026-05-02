---
name: Elementra – Style & Architecture Snapshot
description: Visual style, color palette, code architecture and known weaknesses of Elementra as of first polish session
type: project
---

Elementra is a Suika-style drop/merge game. Phaser 3.80.1 + TypeScript + Vite. No external assets — everything is procedurally generated (canvas textures for elements, Web Audio API for sound).

**Color palette in use (as of 2026-04-30):**
- Background: #1a1a2e / #0d0d1a (very dark navy)
- Container fill: #16213e
- Accent green (buttons): #00ff88 / #003322
- Score text: white
- Danger line: #ff3333
- Title stroke: #3333cc

**Element colors (from config.ts):**
- Level 1 Funke: 0xFF6B35 (orange)
- Level 2 Flamme: 0xFF2200 (red)
- Level 3 Wasser: 0x0099FF (blue)
- Level 4 Erde: 0x9B6B3A (brown)
- Level 5 Wind: 0x99CCFF (light blue)
- Level 6 Blitz: 0xFFDD00 (yellow)
- Level 7 Eis: 0xCCEEFF (ice white)
- Level 8 Lava: 0xCC2200 (dark red)
- Level 9 Sturm: 0xAA00EE (purple)
- Level 10 Kosmos: 0x220066 (near-black purple)

**Scene structure:**
- MenuScene: title, floating element row, play button, best score display
- GameScene: full gameplay, walls via Matter.js, merge logic, UI overlay

**FX modules:**
- src/fx/ParticleManager.ts — element-colored circle bursts, per-level gravity
- src/fx/SoundManager.ts — Web Audio API procedural tones, no audio files
- src/utils/buildTextures.ts — canvas-based radial gradient textures + emoji

**Known weaknesses identified in first polish session:**
1. Kosmos (level 10, color 0x220066) is nearly invisible against dark background — critical UX fail
2. Game Over screen is static raw text box — zero juice, kills momentum
3. Menu uses system font — looks unprofessional; no Google Font loaded
4. Screenshake only starts at level 5 merges — levels 1-4 feel dead
5. No hit-stop on any merge
6. Particle system uses single white circle tinted — no shape variety
7. Background is flat rectangle, no animation or depth
8. Score pop-up shows element name (+Flamme!) not points (+20) — confusing UX

**Dev server port:** 3001 (port 3000 was occupied)

Why: Foundation is solid — mechanics work, FX hooks exist. Polish layer is thin but fixable fast.
How to apply: Prioritize font, Kosmos visibility, and Game Over screen for portal submission readiness.
