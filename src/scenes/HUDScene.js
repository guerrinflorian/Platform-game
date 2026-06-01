import Phaser from 'phaser'

const W = 1280
const H = 720

export class HUDScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HUDScene' })
    this._lastHp   = -1
    this._lastMaxHp = -1
  }

  create() {
    // ── HP Panel ──────────────────────────────────────────────────────────
    const px = 20, py = 20
    const barW = 210, barH = 14

    // Dark panel background
    this.add.rectangle(px + barW / 2 + 12, py + 18, barW + 44, 48, 0x000000, 0.38).setOrigin(0.5)

    this.add.text(px + 12, py + 4, 'HP', {
      fontSize: '11px', color: '#80b4d4', fontFamily: 'monospace', fontStyle: 'bold'
    })

    // Bar track
    this.add.rectangle(px + 12, py + 22, barW, barH, 0x111e2d).setOrigin(0)

    // HP bar fill (starts full width)
    this.hpBarFill = this.add.rectangle(px + 12, py + 22, barW, barH, 0x4fc3f7).setOrigin(0)

    // Shine overlay
    this.add.rectangle(px + 12, py + 22, barW, 4, 0xffffff, 0.10).setOrigin(0)

    // HP numeric text
    this.hpText = this.add.text(px + 12 + barW + 10, py + 22, '6 / 6', {
      fontSize: '11px', color: '#cce8ff', fontFamily: 'monospace'
    }).setOrigin(0, 0.1)

    this._barW  = barW
    this._barX  = px + 12
    this._barY  = py + 22

    // ── Controls legend (bottom center) ───────────────────────────────────
    this._buildControls()

    // ── Debug state text ──────────────────────────────────────────────────
    this.stateText = this.add.text(W - 10, 10, '', {
      fontSize: '10px', color: 'rgba(120,140,160,0.55)', fontFamily: 'monospace'
    }).setOrigin(1, 0)
  }

  _buildControls() {
    const lines = [
      { key: 'Q / D',        label: 'Déplacer'    },
      { key: 'SPC / ↑',      label: 'Sauter'      },
      { key: 'CLIC + Z/S',   label: 'Atk ↑ / ↓'  },
      { key: 'SHIFT',        label: 'Courir'      },
    ]

    const cx = W / 2, cy = H - 24
    const panW = 460, panH = 36
    const colW  = panW / lines.length
    const baseX = cx - panW / 2 + colW / 2

    const items = []
    items.push(this.add.rectangle(cx, cy, panW, panH, 0x000000, 0.38).setOrigin(0.5))

    lines.forEach(({ key, label }, i) => {
      const bx = baseX + i * colW
      items.push(
        this.add.text(bx, cy - 7, key, {
          fontSize: '10px', color: '#80b4d4', fontFamily: 'monospace', fontStyle: 'bold'
        }).setOrigin(0.5),
        this.add.text(bx, cy + 7, label, {
          fontSize: '10px', color: '#90a4b0', fontFamily: 'monospace'
        }).setOrigin(0.5)
      )
    })

    // Fade out after 6 s
    this.time.delayedCall(6000, () => {
      this.tweens.add({ targets: items, alpha: 0, duration: 1400, ease: 'Power2' })
    })
  }

  // Called by GameScene once it's ready
  setGameScene(gs) {
    this._gameScene = gs
  }

  _updateHp(hp, maxHp) {
    this._lastHp    = hp
    this._lastMaxHp = maxHp

    const ratio  = Math.max(0, hp / maxHp)
    const fillW  = Math.max(2, Math.round(this._barW * ratio))

    this.tweens.add({
      targets: this.hpBarFill,
      displayWidth: fillW,
      duration: 220,
      ease: 'Power2'
    })

    const color = ratio > 0.60 ? 0x4fc3f7
                : ratio > 0.35 ? 0xffa726
                :                0xef5350
    this.hpBarFill.setFillStyle(color)
    this.hpText.setText(`${hp} / ${maxHp}`)
  }

  update() {
    const gs = this._gameScene
    if (!gs?.player) return

    const p  = gs.player
    const hp = p.hp, mhp = p.maxHp

    // Update HP bar only when value changed
    if (hp !== this._lastHp || mhp !== this._lastMaxHp) {
      this._updateHp(hp, mhp)
    }

    this.stateText.setText(`${p.state} | ${p.facing}`)
  }
}
