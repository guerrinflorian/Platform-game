import Phaser from 'phaser'

// All animations with their dirs and frame counts
const ANIM_DEFS = [
  { key: 'idle',          dirs: ['right','left','up','down'], frames: 2,  fps: 4,  repeat: -1 },
  { key: 'walk',          dirs: ['right','left','up','down'], frames: 9,  fps: 9,  repeat: -1 },
  { key: 'run',           dirs: ['right','left','up','down'], frames: 8,  fps: 14, repeat: -1 },
  { key: 'jump',          dirs: ['right','left','up','down'], frames: 5,  fps: 10, repeat: 0  },
  { key: 'halfslash_128', dirs: ['right','left','up','down'], frames: 6,  fps: 16, repeat: 0  },
  { key: 'hurt',          dirs: ['up'],                        frames: 6,  fps: 10, repeat: 0  },
  { key: 'combat',        dirs: ['right','left','up','down'], frames: 2,  fps: 4,  repeat: -1 },
]

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }) }

  preload() {
    const bar  = document.getElementById('js-bar')
    const txt  = document.getElementById('js-loading-text')

    this.load.on('progress', v => {
      if (bar) bar.style.width = `${v * 100}%`
    })
    this.load.on('complete', () => {
      if (txt) txt.textContent = 'PRET !'
    })

    // Load all player sprites individually
    for (const { key, dirs, frames } of ANIM_DEFS) {
      for (const dir of dirs) {
        for (let i = 1; i <= frames; i++) {
          this.load.image(
            `p_${key}_${dir}_${i}`,
            `assets/player/${key}/${dir}/${i}.png`
          )
        }
      }
    }
  }

  create() {
    // Generate shared textures
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xffffff)
    g.fillRect(0, 0, 1, 1)
    g.generateTexture('pixel', 1, 1)
    g.destroy()

    // Register animations in the global animation manager
    for (const { key, dirs, frames, fps, repeat } of ANIM_DEFS) {
      for (const dir of dirs) {
        const frameKeys = Array.from({ length: frames }, (_, i) => ({
          key: `p_${key}_${dir}_${i + 1}`
        }))
        this.anims.create({
          key: `player_${key}_${dir}`,
          frames: frameKeys,
          frameRate: fps,
          repeat
        })
      }
    }

    // Hide loading overlay
    const overlay = document.getElementById('loading-overlay')
    if (overlay) {
      setTimeout(() => overlay.classList.add('hidden'), 300)
    }

    this.scene.start('GameScene')
    this.scene.launch('HUDScene')
  }
}
