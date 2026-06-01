import Phaser from 'phaser'
import { Player } from '../entities/Player.js'

// ─── World dimensions ─────────────────────────────────────────────────────────
const WORLD_W = 3200
const WORLD_H = 960

// ─── Platform definitions [x, y, width, height] ───────────────────────────────
// Layout designed so all jumps are reachable (max height diff ~180px, gaps ~80-120px)
const PLAT_DEFS = [
  // Ground
  [0, 880, WORLD_W, 120],
  // ── Zone 1: start (0-800) ──
  [200, 760, 180, 22],
  [460, 720, 160, 22],
  [700, 660, 200, 22],
  // ── Zone 2 (800-1600) ──
  [990, 780, 160, 22],
  [1230, 700, 180, 22],
  [1480, 620, 200, 22],
  [1700, 520, 160, 22],  // high platform needs double jump
  // ── Zone 3 (1600-2400) ──
  [1760, 760, 220, 22],
  [2060, 680, 180, 22],
  [2320, 580, 200, 22],
  // ── Zone 4 (2400-3200) ──
  [2600, 700, 180, 22],
  [2820, 620, 180, 22],
  [3020, 760, 160, 22],
]

// Visual style: modern flat design on white background
const STYLE = {
  bg:          0xf5f5f7,
  grid:        0x000000,
  gridAlpha:   0.035,
  platMain:    0x607d8b,
  platEdge:    0x90a4ae,
  platShadow:  0x000000,
  groundMain:  0x546e7a,
  groundEdge:  0x78909c,
}

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }) }

  create() {
    // ── World bounds ───────────────────────────────────────────────────────
    this.physics.world.setBounds(0, -200, WORLD_W, WORLD_H + 400)

    // ── Background ────────────────────────────────────────────────────────
    this._drawBackground()

    // ── Platforms ─────────────────────────────────────────────────────────
    // Platform bodies stored as an array of Rectangles with static bodies
    this.platformRects = []
    this._buildPlatforms()

    // ── Player ────────────────────────────────────────────────────────────
    this.player = new Player(this, 90, 820)

    // ── Collisions ────────────────────────────────────────────────────────
    this.physics.add.collider(this.player.phys, this.platformRects)

    // ── Camera ────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.player.phys, true, 0.08, 0.08)
    this.cameras.main.setDeadzone(160, 80)

    // ── Controls ──────────────────────────────────────────────────────────
    // ZQSD (AZERTY) + flèches, Shift sprint, Espace/Z saut, Clic gauche attaque
    this.keys = this.input.keyboard.addKeys({
      q:          Phaser.Input.Keyboard.KeyCodes.Q,
      d:          Phaser.Input.Keyboard.KeyCodes.D,
      z:          Phaser.Input.Keyboard.KeyCodes.Z,
      s:          Phaser.Input.Keyboard.KeyCodes.S,
      shift:      Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space:      Phaser.Input.Keyboard.KeyCodes.SPACE,
      arrowLeft:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      arrowUp:    Phaser.Input.Keyboard.KeyCodes.UP,
    })

    // Clic gauche → attaque
    this.input.on('pointerdown', (ptr) => {
      if (ptr.button === 0 && this.player) this.player._attackRequested = true
    })

    // ── Respawn on fall ───────────────────────────────────────────────────
    this._spawnX = 90
    this._spawnY = 820

    // Expose to HUD (HUDScene polls via update, no timing issues)
    this.scene.get('HUDScene').setGameScene(this)
  }

  // ── Draw background with subtle grid ────────────────────────────────────
  _drawBackground() {
    // Base
    const bg = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, STYLE.bg)
    bg.setDepth(0)

    // Grid
    const gfx = this.add.graphics().setDepth(1)
    gfx.lineStyle(1, STYLE.grid, STYLE.gridAlpha)
    for (let x = 0; x <= WORLD_W; x += 64) {
      gfx.lineBetween(x, 0, x, WORLD_H)
    }
    for (let y = 0; y <= WORLD_H; y += 64) {
      gfx.lineBetween(0, y, WORLD_W, y)
    }
  }

  // ── Build platforms visually + physics ──────────────────────────────────
  _buildPlatforms() {
    const gfx = this.add.graphics().setDepth(5)

    PLAT_DEFS.forEach(([x, y, w, h], i) => {
      const isGround = i === 0
      const main  = isGround ? STYLE.groundMain : STYLE.platMain
      const edge  = isGround ? STYLE.groundEdge : STYLE.platEdge

      // Drop shadow
      gfx.fillStyle(STYLE.platShadow, 0.12)
      gfx.fillRect(x + 4, y + 5, w, h)

      // Main body
      gfx.fillStyle(main)
      gfx.fillRect(x, y, w, h)

      // Top highlight edge
      gfx.fillStyle(edge)
      gfx.fillRect(x, y, w, isGround ? 5 : 4)

      // Left/right edge shine (platforms only)
      if (!isGround) {
        gfx.fillStyle(edge, 0.4)
        gfx.fillRect(x, y, 3, h)
        gfx.fillRect(x + w - 3, y, 3, h)
      }

      // Physics body: invisible Rectangle with a static arcade body.
      // Using Rectangle avoids pixel-texture scaling issues with staticGroup.
      const rect = this.add.rectangle(x, y, w, h, 0x000000, 0).setOrigin(0, 0)
      this.physics.add.existing(rect, true) // true = static
      this.platformRects.push(rect)
    })
  }

  // ── Respawn ──────────────────────────────────────────────────────────────
  _respawn() {
    this.player.phys.setPosition(this._spawnX, this._spawnY)
    this.player.phys.body.setVelocity(0, 0)
    this.player.state  = 'idle'
    this.player.hp     = this.player.maxHp
    this.player._invTimer = 0
    this.player.visual.setAlpha(1)
    this.events.emit('playerHpChange', this.player.hp, this.player.maxHp)
  }

  update(time, delta) {
    const dt = delta // ms

    this.player.update(dt, this.keys)

    // Fall off world → respawn
    if (this.player.phys.y > WORLD_H + 80) {
      this._respawn()
    }
  }
}
