import Phaser from 'phaser'

// ─── Constants ────────────────────────────────────────────────────────────────
const WALK_SPEED   = 165
const RUN_SPEED    = 290
const JUMP_VEL     = -600
const MAX_HP       = 6
const COYOTE_MS    = 120
const JUMP_BUF_MS  = 150
const INV_MS       = 1400
const ATK_COOLDOWN = 420

const ATK_VISUAL_OFFSET = {
  right: { x:  16, y: 42 },
  left:  { x: -26, y: 42 },
  down:  { x:   0, y: 42 },
}

const ATK_OFFSETS = {
  right: { x:  60, y: -10, w: 90, h: 55 },
  left:  { x: -60, y: -10, w: 90, h: 55 },
  down:  { x:   0, y:  50, w: 70, h: 60 },
}

// ─── Player class ─────────────────────────────────────────────────────────────
export class Player {
  constructor(scene, x, y) {
    this.scene   = scene
    this.hp      = MAX_HP
    this.maxHp   = MAX_HP
    this.facing  = 'right'
    this.state   = 'idle'

    this._coyote        = 0
    this._jumpBuf       = 0
    this._invTimer      = 0
    this._atkCool       = 0
    this._jumpHeld        = false
    this._isOnGround      = false
    this._canDblJump      = false
    this._atkDir          = 'right'
    this._atkInAir        = false   // attaque démarrée en l'air
    this._attackRequested = false

    // ── Physics body ──────────────────────────────────────────────────────
    this.phys = scene.add.rectangle(x, y, 42, 78, 0x000000, 0)
    this.phys.setOrigin(0.5, 0.5)
    scene.physics.add.existing(this.phys, false)
    this.phys.body.setMaxVelocity(500, 1400)
    this.phys.body.setCollideWorldBounds(false)

    // ── Visual sprite (cosmetic only) ─────────────────────────────────────
    // Origin (0.5, 0.9375) stays FIXED for ALL animations.
    // For halfslash_128, we shift the position offset instead.
    this.visual = scene.add.sprite(x, y + 39, 'p_idle_right_1')
    this.visual.setScale(1.5)
    this.visual.setOrigin(0.5, 0.9375)
    this.visual.setDepth(20)

    // ── Attack hitbox ─────────────────────────────────────────────────────
    this.atkBox = scene.add.rectangle(0, 0, 90, 55, 0x000000, 0)
    scene.physics.add.existing(this.atkBox, false)
    this.atkBox.body.allowGravity = false
    this.atkBox.body.enable = false

    // ── Animation-complete callback ───────────────────────────────────────
    this.visual.on(Phaser.Animations.Events.ANIMATION_COMPLETE, anim => {
      if (anim.key.includes('halfslash') && this.state === 'attack') this._endAttack()
      if (anim.key.includes('hurt')      && this.state === 'hurt')   this.state = 'idle'
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  update(dt, keys) {
    if (this.state === 'dead') return

    const body = this.phys.body
    this._isOnGround = body.blocked.down

    // Tick timers
    this._coyote  = this._isOnGround ? COYOTE_MS : Math.max(0, this._coyote  - dt)
    this._jumpBuf = Math.max(0, this._jumpBuf - dt)
    this._atkCool = Math.max(0, this._atkCool - dt)
    this._tickInvincible(dt)

    // Read input
    const moveL  = keys.q.isDown || keys.arrowLeft.isDown
    const moveR  = keys.d.isDown || keys.arrowRight.isDown
    const sprint = keys.shift.isDown

    const aimDown = keys.s.isDown

    // Saut : ESPACE ou flèche haut uniquement
    const upHeld  = keys.space.isDown || keys.arrowUp.isDown
    const jumpJust = Phaser.Input.Keyboard.JustDown(keys.space)
                  || Phaser.Input.Keyboard.JustDown(keys.arrowUp)

    const atkJust = this._attackRequested
    this._attackRequested = false

    if (jumpJust) this._jumpBuf = JUMP_BUF_MS
    this._jumpHeld = upHeld

    // Blocked states
    if (this.state === 'hurt') {
      this._applyGravity(); this._syncVisual(); return
    }
    if (this.state === 'attack') {
      this._applyAttackPhysics(keys)
      this._updateAtkBox(); this._syncVisual(); return
    }

    // Horizontal movement
    if (moveL) {
      body.setVelocityX(-(sprint ? RUN_SPEED : WALK_SPEED))
      this.facing = 'left'
    } else if (moveR) {
      body.setVelocityX(sprint ? RUN_SPEED : WALK_SPEED)
      this.facing = 'right'
    } else {
      body.setVelocityX(0)
    }

    // Jump
    const canJump = this._coyote > 0
    if (this._jumpBuf > 0 && canJump) {
      body.setVelocityY(JUMP_VEL)
      this._coyote = 0; this._jumpBuf = 0; this._canDblJump = true
    } else if (jumpJust && !this._isOnGround && this._canDblJump) {
      body.setVelocityY(JUMP_VEL * 0.82)
      this._canDblJump = false
    }

    this._applyGravity()

    // Attack — direction : Z=haut, S=bas, sinon côté regardé
    if (atkJust && this._atkCool <= 0) {
      const dir = aimDown ? 'down' : this.facing
      this._startAttack(dir)
      this._syncVisual(); return
    }

    this._updateStateAnim(moveL || moveR, sprint)
    this._syncVisual()
  }

  // ── Physique pendant l'attaque ────────────────────────────────────────────
  _applyAttackPhysics(keys) {
    const onGround = this._isOnGround

    if (onGround) {
      // Au sol : immobile (ancré)
      this.phys.body.setVelocityX(0)
      this.phys.body.setGravityY(0)
      return
    }

    // En l'air : comportement selon direction d'attaque
    if (this._atkDir === 'down') {
      // Plongeon vertical (meteor slam) : gravité renforcée
      this.phys.body.setGravityY(1400)
    } else {
      // Attaque côté : "hang" seulement au pic ou en descente
      // (si on monte encore, gravité normale pour ne pas prolonger le saut)
      if (this.phys.body.velocity.y >= -80) {
        this.phys.body.setGravityY(-550) // flotte au pic/descente
      } else {
        this._applyGravity() // montée : arc normal
      }
      // Drift léger dans le sens d'attaque
      const target = this._atkDir === 'right' ? WALK_SPEED * 0.4 : -WALK_SPEED * 0.4
      const cur = this.phys.body.velocity.x
      this.phys.body.setVelocityX(cur + (target - cur) * 0.08)
    }
  }

  // ── Variable gravity ──────────────────────────────────────────────────────
  _applyGravity() {
    const vy = this.phys.body.velocity.y
    if (this._isOnGround) {
      this.phys.body.setGravityY(0)
    } else if (vy < 0 && !this._jumpHeld) {
      this.phys.body.setGravityY(900)   // cut jump early → fall faster
    } else if (vy > 0) {
      this.phys.body.setGravityY(400)   // heavier on the way down
    } else {
      this.phys.body.setGravityY(0)
    }
  }

  // ── State → animation ─────────────────────────────────────────────────────
  _updateStateAnim(isMoving, sprint) {
    if (!this._isOnGround) {
      this.state = this.phys.body.velocity.y <= 0 ? 'jump' : 'fall'
    } else if (isMoving) {
      this.state = sprint ? 'run' : 'walk'
    } else {
      this.state = 'idle'
    }

    const dir = this.facing
    const key = {
      idle: `player_idle_${dir}`,
      walk: `player_walk_${dir}`,
      run:  `player_run_${dir}`,
      jump: `player_jump_${dir}`,
      fall: `player_jump_${dir}`,
    }[this.state]

    if (key) this._playAnim(key)
  }

  // ── Attack ────────────────────────────────────────────────────────────────
  _startAttack(dir) {
    this.state      = 'attack'
    this._atkDir    = dir
    this._atkCool   = ATK_COOLDOWN
    this._atkInAir  = !this._isOnGround

    // Au sol : ancre le perso. En l'air : conserve la vélocité (gérée par _applyAttackPhysics)
    if (this._isOnGround) this.phys.body.setVelocityX(0)

    // Down-air : impulsion vers le bas pour le plongeon
    if (dir === 'down' && !this._isOnGround) {
      this.phys.body.setVelocityY(500)
    }

    this._playAnim(`player_halfslash_128_${dir}`, true)

    // Activate hitbox at frame 2 (~90 ms)
    this.scene.time.delayedCall(90, () => {
      if (this.state !== 'attack') return
      const off = ATK_OFFSETS[dir] || ATK_OFFSETS.right
      this.atkBox.body.setSize(off.w, off.h)
      this.atkBox.body.enable = true
      this._updateAtkBox()
    })
    // Deactivate at frame 5 (~300 ms)
    this.scene.time.delayedCall(300, () => { this.atkBox.body.enable = false })
  }

  _endAttack() {
    this._spawnHitParticles()
    this.state      = 'idle'
    this._atkInAir  = false
    this.atkBox.body.enable = false
    this.phys.body.setGravityY(0)
    this._updateStateAnim(false, false)
  }

  // ── Sword-tip burst à la fin de chaque slash ──────────────────────────────
  _spawnHitParticles() {
    const dir = this._atkDir

    // Pointe de l'épée = bord externe de la hitbox
    const TIP = {
      right: { x: this.phys.x + 105, y: this.phys.y - 10 },
      left:  { x: this.phys.x - 105, y: this.phys.y - 10 },
      down:  { x: this.phys.x,        y: this.phys.y + 80  },
    }
    const SPRAY = {
      right: { min: -55, max: 55  },
      left:  { min: 125, max: 235 },
      down:  { min: 35,  max: 145 },
    }

    const pos = TIP[dir]
    const ang = SPRAY[dir]

    // Flash blanc au bout de la lame
    const flash = this.scene.add.circle(pos.x, pos.y, 14, 0xffffff, 0.95)
      .setDepth(35)
    this.scene.tweens.add({
      targets:  flash,
      scaleX:   3, scaleY: 3,
      alpha:    0,
      duration: 160,
      ease:     'Power2',
      onComplete: () => flash.destroy(),
    })

    // Éclats de sparks
    const emitter = this.scene.add.particles(pos.x, pos.y, 'pixel', {
      speed:    { min: 70, max: 280 },
      angle:    ang,
      scale:    { start: 3.2, end: 0 },
      lifespan: { min: 200, max: 480 },
      tint:     [0xffffff, 0xfff3a0, 0xffcc33, 0xff8800, 0x88ddff],
      gravityY: 520,
      emitting: false,
    }).setDepth(30)
    emitter.explode(18)

    // Quelques traînées fines (longues, rapides)
    const trails = this.scene.add.particles(pos.x, pos.y, 'pixel', {
      speed:    { min: 160, max: 380 },
      angle:    ang,
      scale:    { start: 1.5, end: 0 },
      lifespan: { min: 120, max: 260 },
      tint:     [0xffffff, 0xffe0a0],
      gravityY: 200,
      emitting: false,
    }).setDepth(31)
    trails.explode(10)

    this.scene.time.delayedCall(700, () => { emitter.destroy(); trails.destroy() })
  }

  _updateAtkBox() {
    const off = ATK_OFFSETS[this._atkDir] || ATK_OFFSETS.right
    this.atkBox.setPosition(this.phys.x + off.x, this.phys.y + off.y)
  }

  // ── Visual sync ───────────────────────────────────────────────────────────
  // Origin (0.5, 0.9375) is fixed. During attack, shift position so the
  // character (not the sprite center) stays at the physics body's feet point.
  _syncVisual() {
    let vx = this.phys.x
    let vy = this.phys.y + 39   // body center → feet (39 = half of 78)

    if (this.state === 'attack') {
      const off = ATK_VISUAL_OFFSET[this._atkDir] || { x: 0, y: 0 }
      vx += off.x
      vy += off.y
    }

    this.visual.setPosition(Math.round(vx), Math.round(vy))
  }

  // ── Invincibility flash ───────────────────────────────────────────────────
  _tickInvincible(dt) {
    if (this._invTimer <= 0) return
    this._invTimer -= dt
    if (this._invTimer <= 0) {
      this._invTimer = 0; this.visual.setAlpha(1)
    } else {
      this.visual.setAlpha(Math.sin(this._invTimer * 0.022) > 0 ? 1 : 0.3)
    }
  }

  _playAnim(key, force = false) {
    if (force || this.visual.anims.currentAnim?.key !== key) {
      this.visual.play(key, true)
    }
  }

  // ── Public ────────────────────────────────────────────────────────────────
  takeDamage(amount = 1) {
    if (this._invTimer > 0 || this.state === 'dead') return false
    this.hp = Math.max(0, this.hp - amount)
    this._invTimer = INV_MS
    const kx = this.facing === 'right' ? -260 : 260
    this.phys.body.setVelocity(kx, -320)
    if (this.hp <= 0) {
      this.state = 'dead'
    } else {
      this.state = 'hurt'
      this._playAnim('player_hurt_up', true)
    }
    this.scene.events.emit('playerHpChange', this.hp, this.maxHp)
    return true
  }

  get x()           { return this.phys.x }
  get y()           { return this.phys.y }
  get isAttacking() { return this.state === 'attack' }
  get isDead()      { return this.state === 'dead' }

  destroy() {
    this.phys.destroy()
    this.visual.destroy()
    this.atkBox.destroy()
  }
}
