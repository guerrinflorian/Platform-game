import Phaser from 'phaser'
import { PreloadScene } from './scenes/PreloadScene.js'
import { GameScene }    from './scenes/GameScene.js'
import { HUDScene }     from './scenes/HUDScene.js'

const config = {
  type: Phaser.AUTO,
  width:  1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#f5f5f7',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 900 },
      debug: false
    }
  },
  scene: [PreloadScene, GameScene, HUDScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720
  },
  render: {
    pixelArt: true,
    antialias: false
  }
}

window.game = new Phaser.Game(config)
