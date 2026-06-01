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

// ─── Attack visual offsets (pixel-analysed) ───────────────────────────────────
// halfslash_128 is 128×128 (192×192 at 1.5×). Fixed origin (0.5, 0.9375) places
// the anchor at (96, 180) in the 192px frame.
// Reference idle position: idle char at (28px, 61px) in 64px sprite
//   → display (42, 91.5) → world char at (phys.x-6, phys.y+40.5)
//
// Measured character body in halfslash sprites (PIL pixel analysis):
//   right avg body_cx=49.7/128 (f1=42, f3-6≈53), feet_y=93/128 → Δx=16, Δy=42
//   left  avg body_cx=77.3/128 (f1=85, f3-6≈73), feet_y=93/128 → Δx=-26, Δy=42
//   up    avg body_cx≈49/128,   feet_y≈90/128               → Δx=17, Δy=46
//
// Δy=42 is the critical fix: previously wrong at -3 → caused 45px upward shift.
const ATK_VISUAL_OFFSET = {
  right: { x:  16, y: 42 },
  left:  { x: -26, y: 42 },
  up:    { x:  17, y: 46 },
  down:  { x:   0, y: 42 },
}

// ─── Attack hitbox offsets from body center ───────────────────────────────────
const ATK_OFFSETS = {
  right: { x:  60, y: -10, w: 90, h: 55 },
  left:  { x: -60, y: -10, w: 90, h: 55 },
  up:    { x:   0, y: -70, w: 70, h: 80 },
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

    // Z/S = direction d'attaque verticale (pas pour sauter)
    const aimUp   = keys.z.isDown
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
      const dir = aimUp ? 'up' : aimDown ? 'down' : this.facing
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
      // Plongeon vertical (meteor slam) : gravité renforcée + pas de frein X
      this.phys.body.setGravityY(1400)  // tombe vite
    } else if (this._atkDir === 'up') {
      // Attaque vers le haut : mini-élévation + gravité très faible (hang)
      this.phys.body.setGravityY(-700)  // quasi flottant
      // Léger drift horizontal autorisé
      const moveL = keys.q.isDown || keys.arrowLeft.isDown
      const moveR = keys.d.isDown || keys.arrowRight.isDown
      if (moveL)      this.phys.body.setVelocityX(-WALK_SPEED * 0.5)
      else if (moveR) this.phys.body.setVelocityX( WALK_SPEED * 0.5)
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
    this.state      = 'idle'
    this._atkInAir  = false
    this.atkBox.body.enable = false
    // Réinitialise la gravité custom de l'attaque
    this.phys.body.setGravityY(0)
    this._updateStateAnim(false, false)
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
