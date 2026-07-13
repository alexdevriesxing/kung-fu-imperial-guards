(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 1280;
  const H = 720;
  const WORLD_W = 6400;
  const TAU = Math.PI * 2;

  const ui = {
    hud: document.getElementById('hud'),
    health: document.getElementById('health-fill'),
    chi: document.getElementById('chi-fill'),
    score: document.getElementById('score'),
    seals: document.getElementById('seal-count'),
    combo: document.getElementById('combo'),
    bossHud: document.getElementById('boss-hud'),
    bossFill: document.getElementById('boss-fill'),
    objective: document.getElementById('objective'),
    objectiveText: document.getElementById('objective-text'),
    toast: document.getElementById('toast'),
    touch: document.getElementById('touch-controls'),
    flash: document.getElementById('flash'),
    bars: document.getElementById('cinematic-bars'),
    best: document.getElementById('best-score')
  };

  const screens = [...document.querySelectorAll('.screen')];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const pad = n => Math.max(0, Math.floor(n)).toString().padStart(6, '0');

  let pixelRatio = 1;
  function resizeCanvas() {
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * pixelRatio;
    canvas.height = H * pixelRatio;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.nextBeat = 0;
      this.beat = 0;
    }
    wake() {
      if (!this.enabled) return;
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    tone(freq, duration = .08, type = 'sine', volume = .18, slide = 0) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + duration + .02);
    }
    noise(duration = .08, volume = .16) {
      if (!this.ctx || !this.enabled) return;
      const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      filter.type = 'bandpass';
      filter.frequency.value = 540;
      filter.Q.value = .6;
      gain.gain.value = volume;
      src.buffer = buffer;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
    }
    punch() { this.tone(120, .07, 'square', .18, -60); this.noise(.045, .11); }
    kick() { this.tone(86, .11, 'sawtooth', .22, -42); this.noise(.075, .14); }
    chi() { this.tone(260, .32, 'sine', .16, 520); this.tone(130, .34, 'triangle', .12, 300); }
    hurt() { this.tone(95, .16, 'sawtooth', .2, -45); }
    seal() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, .22, 'sine', .12), i * 70)); }
    updateMusic(game) {
      if (!this.ctx || game.mode !== 'play') return;
      const now = this.ctx.currentTime;
      if (now < this.nextBeat) return;
      const boss = game.bossActive;
      const pattern = boss ? [82, 82, 98, 73, 82, 110, 98, 73] : [73, 98, 110, 98, 65, 82, 98, 82];
      const f = pattern[this.beat % pattern.length];
      this.tone(f, boss ? .19 : .28, 'triangle', boss ? .075 : .048, -4);
      if (this.beat % 2 === 0) this.tone(f * 2, .12, 'sine', .025, 7);
      this.beat++;
      this.nextBeat = now + (boss ? .22 : .36);
    }
  }
  const sound = new SoundEngine();

  const input = {
    held: new Set(),
    pressed: new Set(),
    gamepadPrev: {},
    down(name) { return this.held.has(name); },
    tap(name) { return this.pressed.has(name); },
    endFrame() { this.pressed.clear(); }
  };

  const keyMap = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyJ: 'punch', KeyK: 'kick', KeyL: 'chi',
    ShiftLeft: 'dash', ShiftRight: 'dash'
  };

  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      e.preventDefault();
      game.togglePause();
      return;
    }
    const action = keyMap[e.code];
    if (!action) return;
    e.preventDefault();
    if (!input.held.has(action)) input.pressed.add(action);
    input.held.add(action);
    sound.wake();
  });
  window.addEventListener('keyup', e => {
    const action = keyMap[e.code];
    if (action) input.held.delete(action);
  });
  window.addEventListener('blur', () => { if (game.mode === 'play') game.pause(); });

  document.querySelectorAll('[data-control]').forEach(button => {
    const action = button.dataset.control;
    const press = e => {
      e.preventDefault();
      sound.wake();
      if (!input.held.has(action)) input.pressed.add(action);
      input.held.add(action);
      button.setPointerCapture?.(e.pointerId);
    };
    const release = e => { e.preventDefault(); input.held.delete(action); };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
  });

  function pollGamepad() {
    const gp = navigator.getGamepads?.()[0];
    if (!gp) return;
    const states = {
      left: gp.axes[0] < -.35 || gp.buttons[14]?.pressed,
      right: gp.axes[0] > .35 || gp.buttons[15]?.pressed,
      up: gp.axes[1] < -.45 || gp.buttons[12]?.pressed,
      down: gp.axes[1] > .45 || gp.buttons[13]?.pressed,
      jump: gp.buttons[0]?.pressed,
      punch: gp.buttons[2]?.pressed,
      kick: gp.buttons[1]?.pressed,
      chi: gp.buttons[3]?.pressed,
      dash: gp.buttons[5]?.pressed
    };
    Object.entries(states).forEach(([name, active]) => {
      if (active) {
        if (!input.gamepadPrev[name]) input.pressed.add(name);
        input.held.add(name);
      } else if (input.gamepadPrev[name]) input.held.delete(name);
      input.gamepadPrev[name] = active;
    });
  }

  const stars = Array.from({ length: 95 }, (_, i) => ({
    x: (i * 173.33) % W,
    y: 24 + ((i * 83.17) % 330),
    r: .35 + (i % 4) * .25,
    a: .22 + (i % 7) * .08
  }));

  class Game {
    constructor() {
      this.mode = 'title';
      this.time = 0;
      this.runTime = 0;
      this.camera = { x: 0, target: 0, shake: 0 };
      this.particles = [];
      this.decor = this.makeDecor();
      this.best = Number(localStorage.getItem('kfig-best') || 0);
      ui.best.textContent = `BEST ${pad(this.best)}`;
      this.resetWorld();
    }

    makeDecor() {
      const lanterns = [];
      for (let x = 170; x < WORLD_W; x += 310) lanterns.push({ x, y: 360 + ((x / 310) % 3) * 62, phase: x * .013 });
      return { lanterns };
    }

    resetWorld() {
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.comboTimer = 0;
      this.sealCount = 0;
      this.bossActive = false;
      this.bossDefeated = false;
      this.toastTimer = 0;
      this.objectiveTimer = 5;
      this.runTime = 0;
      this.attackSerial = 0;
      this.player = {
        x: 130, y: 620, prevY: 620, vx: 0, vy: 0,
        w: 42, h: 82, facing: 1, onGround: true, climbing: false,
        health: 100, chi: 75, attack: null, cooldown: 0, invuln: 0,
        dashTimer: 0, respawnX: 130, respawnY: 620, anim: 0
      };

      this.platforms = [
        { x: 0, y: 620, w: 920, h: 100, zone: 0 },
        { x: 920, y: 620, w: 880, h: 100, zone: 1 },
        { x: 1800, y: 620, w: 900, h: 100, zone: 2 },
        { x: 2700, y: 620, w: 920, h: 100, zone: 3 },
        { x: 3620, y: 620, w: 980, h: 100, zone: 4 },
        { x: 4600, y: 620, w: 920, h: 100, zone: 5 },
        { x: 5520, y: 620, w: 880, h: 100, zone: 6 },
        { x: 470, y: 494, w: 250, h: 28, zone: 0 },
        { x: 960, y: 502, w: 330, h: 28, zone: 1 },
        { x: 1370, y: 400, w: 285, h: 28, zone: 1 },
        { x: 1850, y: 500, w: 285, h: 28, zone: 2 },
        { x: 2210, y: 388, w: 320, h: 28, zone: 2 },
        { x: 2760, y: 510, w: 300, h: 28, zone: 3 },
        { x: 3130, y: 414, w: 280, h: 28, zone: 3 },
        { x: 3670, y: 498, w: 310, h: 28, zone: 4 },
        { x: 4050, y: 382, w: 310, h: 28, zone: 4 },
        { x: 4480, y: 290, w: 250, h: 28, zone: 4 },
        { x: 4690, y: 502, w: 300, h: 28, zone: 5 },
        { x: 5050, y: 404, w: 330, h: 28, zone: 5 },
        { x: 5230, y: 294, w: 220, h: 28, zone: 5 },
        { x: 5740, y: 470, w: 250, h: 28, zone: 6 }
      ];

      this.ladders = [
        { x: 585, top: 494, bottom: 620 },
        { x: 1100, top: 400, bottom: 620 },
        { x: 1510, top: 400, bottom: 502 },
        { x: 1980, top: 388, bottom: 620 },
        { x: 2370, top: 388, bottom: 500 },
        { x: 2905, top: 414, bottom: 620 },
        { x: 3260, top: 414, bottom: 510 },
        { x: 3830, top: 382, bottom: 620 },
        { x: 4200, top: 290, bottom: 498 },
        { x: 4840, top: 404, bottom: 620 },
        { x: 5260, top: 294, bottom: 620 },
        { x: 5850, top: 470, bottom: 620 }
      ];

      this.seals = [
        { x: 600, y: 450, taken: false },
        { x: 1515, y: 354, taken: false },
        { x: 2365, y: 342, taken: false },
        { x: 4505, y: 244, taken: false },
        { x: 5340, y: 248, taken: false }
      ];

      this.hazards = [
        { type: 'spikes', x: 760, y: 620, w: 120, phase: 0 },
        { type: 'fire', x: 1640, y: 620, w: 78, phase: .8 },
        { type: 'spikes', x: 2580, y: 620, w: 105, phase: .3 },
        { type: 'fire', x: 3430, y: 620, w: 76, phase: 1.6 },
        { type: 'spikes', x: 4370, y: 620, w: 105, phase: .5 },
        { type: 'fire', x: 5415, y: 620, w: 80, phase: 2.2 }
      ];

      this.checkpoints = [
        { x: 1745, y: 620, lit: false },
        { x: 3570, y: 620, lit: false },
        { x: 5480, y: 620, lit: false }
      ];

      this.enemies = [
        this.makeEnemy('sword', 780, 620, 680, 900),
        this.makeEnemy('spear', 1180, 502, 970, 1270),
        this.makeEnemy('acrobat', 1560, 400, 1380, 1640),
        this.makeEnemy('sword', 1700, 620, 1500, 1780),
        this.makeEnemy('spear', 2050, 500, 1860, 2120),
        this.makeEnemy('sword', 2490, 620, 2260, 2650),
        this.makeEnemy('acrobat', 3000, 510, 2760, 3050),
        this.makeEnemy('spear', 3360, 620, 3150, 3530),
        this.makeEnemy('sword', 3900, 498, 3680, 3970),
        this.makeEnemy('acrobat', 4320, 382, 4060, 4350),
        this.makeEnemy('spear', 4770, 502, 4700, 4980),
        this.makeEnemy('sword', 5160, 404, 5050, 5370),
        this.makeEnemy('acrobat', 5420, 620, 5250, 5500),
        this.makeEnemy('boss', 5950, 620, 5650, 6250)
      ];
      this.boss = this.enemies[this.enemies.length - 1];
      this.camera.x = 0;
      this.particles.length = 0;
      this.updateHud();
    }

    makeEnemy(type, x, y, min, max) {
      const stats = {
        sword: { health: 46, speed: 88, damage: 10, reach: 58 },
        spear: { health: 56, speed: 70, damage: 14, reach: 92 },
        acrobat: { health: 40, speed: 120, damage: 11, reach: 64 },
        boss: { health: 260, speed: 105, damage: 18, reach: 100 }
      }[type];
      return {
        type, x, y, vx: 0, vy: 0, facing: -1, patrolMin: min, patrolMax: max,
        health: stats.health, maxHealth: stats.health, speed: stats.speed,
        damage: stats.damage, reach: stats.reach, cooldown: .4 + Math.random(),
        attack: 0, hurt: 0, invuln: 0, dead: false, death: 0,
        active: type !== 'boss', anim: Math.random() * 10, hitBy: new Set()
      };
    }

    start() {
      this.resetWorld();
      this.mode = 'play';
      showScreen(null);
      ui.hud.classList.remove('hidden');
      ui.objective.classList.remove('hidden');
      ui.touch.classList.remove('hidden');
      ui.bossHud.classList.add('hidden');
      ui.objectiveText.textContent = 'Recover the five Imperial Seals';
      sound.wake();
      this.showToast('ENTER THE MOON GATE');
    }

    title() {
      this.mode = 'title';
      ui.hud.classList.add('hidden');
      ui.objective.classList.add('hidden');
      ui.touch.classList.add('hidden');
      ui.bossHud.classList.add('hidden');
      ui.bars.classList.remove('active');
      showScreen('title-screen');
      this.best = Number(localStorage.getItem('kfig-best') || 0);
      ui.best.textContent = `BEST ${pad(this.best)}`;
    }

    pause() {
      if (this.mode !== 'play') return;
      this.mode = 'paused';
      showScreen('pause-screen');
    }
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'play';
      showScreen(null);
      sound.wake();
    }
    togglePause() {
      if (this.mode === 'play') this.pause();
      else if (this.mode === 'paused') this.resume();
    }

    end(win) {
      this.mode = win ? 'victory' : 'defeat';
      ui.hud.classList.add('hidden');
      ui.objective.classList.add('hidden');
      ui.touch.classList.add('hidden');
      ui.bossHud.classList.add('hidden');
      ui.bars.classList.add('active');
      const score = Math.floor(this.score + (win ? Math.max(0, 90000 - this.runTime * 300) : 0));
      if (score > this.best) {
        this.best = score;
        localStorage.setItem('kfig-best', String(score));
      }
      document.getElementById('result-eyebrow').textContent = win ? 'FORTRESS BREACHED' : 'THE FORTRESS ENDURES';
      document.getElementById('result-title').textContent = win ? 'Victory' : 'Defeated';
      document.getElementById('result-copy').textContent = win
        ? 'The seals are safe. Dawn returns to the mountain provinces.'
        : 'The Cloud Hand bends, but does not break. Rise and enter again.';
      document.getElementById('result-score').textContent = pad(score);
      document.getElementById('result-combo').textContent = String(this.bestCombo);
      document.getElementById('result-time').textContent = this.formatTime(this.runTime);
      showScreen('result-screen');
    }

    formatTime(seconds) {
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = Math.floor(seconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    }

    showToast(text, duration = 2.2) {
      ui.toast.textContent = text;
      ui.toast.classList.add('show');
      this.toastTimer = duration;
    }

    flash(alpha = .55) {
      ui.flash.style.transition = 'none';
      ui.flash.style.opacity = alpha;
      requestAnimationFrame(() => {
        ui.flash.style.transition = 'opacity .22s ease';
        ui.flash.style.opacity = 0;
      });
    }

    emit(x, y, color, count = 8, power = 180) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const p = power * (.35 + Math.random() * .65);
        this.particles.push({ x, y, vx: Math.cos(a) * p, vy: Math.sin(a) * p - 40, life: .3 + Math.random() * .35, max: .65, size: 2 + Math.random() * 4, color });
      }
    }

    update(dt) {
      this.time += dt;
      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0) ui.toast.classList.remove('show');
      }
      this.updateParticles(dt);
      if (this.mode !== 'play') return;
      this.runTime += dt;
      pollGamepad();
      sound.updateMusic(this);
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateWorld(dt);
      this.camera.target = clamp(this.player.x - W * .42, 0, WORLD_W - W);
      this.camera.x = lerp(this.camera.x, this.camera.target, 1 - Math.pow(.0005, dt));
      this.camera.shake = Math.max(0, this.camera.shake - dt * 28);
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }
      this.updateHud();
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 420 * dt;
        p.vx *= Math.pow(.08, dt);
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    }

    updatePlayer(dt) {
      const p = this.player;
      p.prevY = p.y;
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.invuln = Math.max(0, p.invuln - dt);
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      p.anim += dt * (2 + Math.abs(p.vx) * .035);

      const dir = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
      if (dir) p.facing = dir;

      const ladder = this.findLadder(p.x, p.y);
      if (ladder && (input.down('up') || input.down('down'))) p.climbing = true;
      if (p.climbing) {
        if (!ladder || input.tap('jump')) {
          p.climbing = false;
          if (input.tap('jump')) p.vy = -430;
        } else {
          p.x = lerp(p.x, ladder.x, clamp(dt * 10, 0, 1));
          p.vy = ((input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0)) * 190;
          p.y += p.vy * dt;
          p.y = clamp(p.y, ladder.top, ladder.bottom + 4);
          p.vx = 0;
          p.onGround = false;
          if (p.y <= ladder.top + 2 && input.down('up')) {
            p.climbing = false;
            p.y = ladder.top;
            p.onGround = true;
          }
        }
      }

      if (!p.climbing) {
        let speed = 275;
        if (input.down('dash') && p.chi > 0 && dir) {
          speed = 520;
          p.dashTimer = .1;
          p.chi = Math.max(0, p.chi - 24 * dt);
          if (Math.random() < .35) this.particles.push({ x: p.x - p.facing * 20, y: p.y - 28, vx: -p.facing * 90, vy: -20, life: .25, max: .25, size: 8, color: '#b9e8f5' });
        } else p.chi = Math.min(100, p.chi + 8 * dt);
        const targetVx = dir * speed;
        p.vx = lerp(p.vx, targetVx, 1 - Math.pow(p.onGround ? .00004 : .025, dt));
        if (!dir) p.vx *= Math.pow(p.onGround ? .0003 : .09, dt);
        if (input.tap('jump') && p.onGround) {
          p.vy = -575;
          p.onGround = false;
          sound.tone(150, .12, 'triangle', .09, 80);
          this.emit(p.x, p.y - 3, '#756b5c', 5, 90);
        }
        p.x += p.vx * dt;
        p.vy += 1500 * dt;
        p.y += p.vy * dt;
        p.x = clamp(p.x, 20, WORLD_W - 20);
        this.resolveGround(p);
      }

      if (input.tap('punch')) this.beginAttack('punch');
      if (input.tap('kick')) this.beginAttack(p.onGround ? 'kick' : 'airkick');
      if (input.tap('chi')) this.beginAttack('chi');

      if (p.attack) {
        p.attack.t += dt;
        this.resolvePlayerAttack();
        if (p.attack.t >= p.attack.duration) p.attack = null;
      }

      if (p.y > H + 180) this.damagePlayer(100, p.x, true);
      input.endFrame();
    }

    beginAttack(kind) {
      const p = this.player;
      if (p.cooldown > 0 || p.climbing) return;
      const data = {
        punch: { duration: .25, a: .07, b: .18, damage: 13, reach: 68, height: 52, cost: 0 },
        kick: { duration: .39, a: .13, b: .29, damage: 22, reach: 92, height: 58, cost: 0 },
        airkick: { duration: .42, a: .08, b: .34, damage: 25, reach: 96, height: 76, cost: 0 },
        chi: { duration: .52, a: .16, b: .42, damage: 42, reach: 160, height: 92, cost: 35 }
      }[kind];
      if (p.chi < data.cost) {
        this.showToast('NOT ENOUGH CHI', .8);
        return;
      }
      p.chi -= data.cost;
      p.cooldown = kind === 'punch' ? .12 : .18;
      p.attack = { ...data, kind, t: 0, id: ++this.attackSerial, hit: new Set() };
      if (kind === 'punch') sound.punch();
      else if (kind === 'chi') sound.chi();
      else sound.kick();
    }

    resolvePlayerAttack() {
      const p = this.player;
      const a = p.attack;
      if (!a || a.t < a.a || a.t > a.b) return;
      const hitbox = {
        x: p.facing > 0 ? p.x + 10 : p.x - a.reach - 10,
        y: p.y - a.height,
        w: a.reach,
        h: a.height
      };
      for (const e of this.enemies) {
        if (e.dead || !e.active || a.hit.has(e)) continue;
        const box = { x: e.x - (e.type === 'boss' ? 34 : 24), y: e.y - (e.type === 'boss' ? 105 : 78), w: e.type === 'boss' ? 68 : 48, h: e.type === 'boss' ? 105 : 78 };
        if (!overlap(hitbox, box)) continue;
        a.hit.add(e);
        const force = a.kind === 'chi' ? 420 : a.kind.includes('kick') ? 260 : 150;
        this.damageEnemy(e, a.damage, p.facing * force, a.kind);
      }
    }

    damageEnemy(e, damage, force, kind) {
      if (e.invuln > 0 || e.dead) return;
      e.health -= damage;
      e.invuln = .09;
      e.hurt = .22;
      e.vx = force;
      this.score += Math.floor(damage * 42 * (1 + Math.min(this.combo, 12) * .08));
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.comboTimer = 2.2;
      this.camera.shake = Math.max(this.camera.shake, kind === 'chi' ? 14 : 7);
      this.emit(e.x, e.y - 48, kind === 'chi' ? '#70dfff' : '#f5c563', kind === 'chi' ? 18 : 10, kind === 'chi' ? 300 : 190);
      if (kind === 'chi') this.flash(.25);
      if (e.health <= 0) {
        e.dead = true;
        e.death = .75;
        this.score += e.type === 'boss' ? 25000 : 1600;
        this.emit(e.x, e.y - 45, '#d84b2f', 20, 260);
        if (e.type === 'boss') {
          this.bossDefeated = true;
          this.bossActive = false;
          ui.bossHud.classList.add('hidden');
          ui.bars.classList.add('active');
          this.showToast('THE CRIMSON CAPTAIN FALLS', 3);
          sound.seal();
          setTimeout(() => ui.bars.classList.remove('active'), 1800);
        }
      }
    }

    damagePlayer(damage, sourceX, fatalFall = false) {
      const p = this.player;
      if (p.invuln > 0 || this.mode !== 'play') return;
      p.health -= damage;
      p.invuln = 1.05;
      p.vx = sourceX < p.x ? 300 : -300;
      p.vy = -260;
      p.climbing = false;
      this.combo = 0;
      this.comboTimer = 0;
      this.camera.shake = 13;
      sound.hurt();
      this.flash(.36);
      this.emit(p.x, p.y - 45, '#e6503a', 14, 240);
      if (p.health <= 0 || fatalFall) {
        p.health = 0;
        setTimeout(() => { if (this.mode === 'play') this.end(false); }, 650);
      }
    }

    resolveGround(entity) {
      entity.onGround = false;
      if (entity.vy < 0) return;
      let landing = null;
      for (const platform of this.platforms) {
        if (entity.x < platform.x + 10 || entity.x > platform.x + platform.w - 10) continue;
        if (entity.prevY <= platform.y + 2 && entity.y >= platform.y) {
          if (!landing || platform.y < landing.y) landing = platform;
        }
      }
      if (landing) {
        entity.y = landing.y;
        entity.vy = 0;
        entity.onGround = true;
      }
    }

    findLadder(x, y) {
      return this.ladders.find(l => Math.abs(x - l.x) < 30 && y >= l.top - 16 && y <= l.bottom + 18);
    }

    updateEnemies(dt) {
      const p = this.player;
      for (const e of this.enemies) {
        e.anim += dt * (2 + Math.abs(e.vx) * .04);
        e.cooldown -= dt;
        e.invuln = Math.max(0, e.invuln - dt);
        e.hurt = Math.max(0, e.hurt - dt);
        if (e.dead) { e.death -= dt; continue; }
        if (e.type === 'boss' && !e.active) continue;

        const dx = p.x - e.x;
        const dy = Math.abs(p.y - e.y);
        const near = Math.abs(dx) < (e.type === 'boss' ? 650 : 390) && dy < 105;
        let dir = 0;
        if (e.hurt <= 0) {
          if (near) {
            e.facing = dx >= 0 ? 1 : -1;
            if (Math.abs(dx) > e.reach * .72) dir = e.facing;
            else if (e.cooldown <= 0) {
              e.attack = e.type === 'boss' ? .58 : .43;
              e.cooldown = e.type === 'boss' ? .72 : 1.05 + Math.random() * .55;
              sound.tone(e.type === 'boss' ? 72 : 105, .08, 'square', .05, -20);
            }
          } else {
            if (e.x <= e.patrolMin + 8) e.facing = 1;
            if (e.x >= e.patrolMax - 8) e.facing = -1;
            dir = e.facing * .42;
          }
        }

        const bossPhase = e.type === 'boss' ? (e.health < e.maxHealth * .35 ? 1.42 : e.health < e.maxHealth * .7 ? 1.2 : 1) : 1;
        const target = dir * e.speed * bossPhase;
        e.vx = lerp(e.vx, target, 1 - Math.pow(.002, dt));
        e.x += e.vx * dt;
        e.x = clamp(e.x, e.patrolMin, e.patrolMax);

        if (e.attack > 0) {
          const before = e.attack;
          e.attack -= dt;
          const strikeMoment = e.type === 'boss' ? .31 : .23;
          if (before > strikeMoment && e.attack <= strikeMoment && Math.abs(p.x - e.x) < e.reach && Math.abs(p.y - e.y) < 92) {
            this.damagePlayer(e.damage * bossPhase, e.x);
          }
        }
      }
    }

    updateWorld(dt) {
      const p = this.player;
      for (const seal of this.seals) {
        if (!seal.taken && Math.hypot(p.x - seal.x, (p.y - 42) - seal.y) < 52) {
          seal.taken = true;
          this.sealCount++;
          this.score += 5000;
          p.chi = Math.min(100, p.chi + 38);
          this.emit(seal.x, seal.y, '#ffd76b', 30, 290);
          sound.seal();
          this.flash(.18);
          this.showToast(`IMPERIAL SEAL ${this.sealCount} OF 5`);
          if (this.sealCount === 5) {
            ui.objectiveText.textContent = 'Enter the Crimson Captain’s arena';
            this.showToast('THE FINAL GATE IS OPEN', 3);
          }
        }
      }

      for (const c of this.checkpoints) {
        if (!c.lit && Math.abs(p.x - c.x) < 42 && Math.abs(p.y - c.y) < 90) {
          this.checkpoints.forEach(x => x.lit = false);
          c.lit = true;
          p.respawnX = c.x;
          p.respawnY = c.y;
          this.showToast('CHECKPOINT LIT');
          sound.tone(330, .3, 'sine', .12, 220);
        }
      }

      for (const h of this.hazards) {
        const active = h.type === 'spikes' || ((this.time + h.phase) % 3.2) < 1.35;
        if (!active) continue;
        const height = h.type === 'fire' ? 90 : 28;
        if (p.x + 18 > h.x && p.x - 18 < h.x + h.w && p.y > h.y - height && p.y < h.y + 16) this.damagePlayer(h.type === 'fire' ? 18 : 14, h.x + h.w / 2);
      }

      if (this.sealCount < 5 && p.x > 5540) {
        p.x = 5540;
        p.vx = Math.min(0, p.vx);
        if (this.toastTimer <= 0) this.showToast('FIVE SEALS ARE REQUIRED', 1.1);
      }

      if (this.sealCount === 5 && !this.bossActive && !this.bossDefeated && p.x > 5600) {
        this.bossActive = true;
        this.boss.active = true;
        ui.bossHud.classList.remove('hidden');
        ui.objectiveText.textContent = 'Defeat the Crimson Captain';
        ui.bars.classList.add('active');
        this.showToast('CRIMSON CAPTAIN', 2.5);
        sound.tone(65, .8, 'sawtooth', .15, -15);
        setTimeout(() => ui.bars.classList.remove('active'), 1250);
      }

      if (this.bossDefeated && p.x > 6320) this.end(true);
    }

    updateHud() {
      const p = this.player;
      ui.health.style.transform = `scaleX(${clamp(p.health / 100, 0, 1)})`;
      ui.chi.style.transform = `scaleX(${clamp(p.chi / 100, 0, 1)})`;
      ui.score.textContent = pad(this.score);
      ui.seals.textContent = `${this.sealCount} / 5`;
      ui.combo.textContent = this.combo > 1 ? `×${this.combo}` : '—';
      if (this.boss) ui.bossFill.style.transform = `scaleX(${clamp(this.boss.health / this.boss.maxHealth, 0, 1)})`;
    }

    draw() {
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      this.drawSky();
      const shakeX = this.camera.shake ? (Math.random() - .5) * this.camera.shake : 0;
      const shakeY = this.camera.shake ? (Math.random() - .5) * this.camera.shake * .5 : 0;
      ctx.save();
      ctx.translate(-this.camera.x + shakeX, shakeY);
      this.drawWorld();
      ctx.restore();
      this.drawAtmosphere();
    }

    drawSky() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#07111d');
      g.addColorStop(.46, '#132330');
      g.addColorStop(1, '#291a17');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      for (const s of stars) {
        ctx.globalAlpha = s.a * (.72 + Math.sin(this.time * 1.6 + s.x) * .2);
        ctx.fillStyle = '#dcecff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }
      ctx.restore();

      const moonX = 1000 - this.camera.x * .018;
      const moonY = 120;
      const mg = ctx.createRadialGradient(moonX - 12, moonY - 18, 6, moonX, moonY, 82);
      mg.addColorStop(0, '#ffffff');
      mg.addColorStop(.54, '#dceaf0');
      mg.addColorStop(.56, '#a8c3d0');
      mg.addColorStop(1, 'rgba(135,183,208,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(moonX, moonY, 82, 0, TAU); ctx.fill();
      ctx.globalAlpha = .2;
      ctx.fillStyle = '#596e77';
      ctx.beginPath(); ctx.arc(moonX - 22, moonY - 12, 18, 0, TAU); ctx.arc(moonX + 25, moonY + 22, 12, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;

      this.drawMountains(.09, 400, '#0a151d', 125, 70);
      this.drawMountains(.16, 475, '#111c23', 170, 90);
      this.drawPagodaSilhouette(160 - this.camera.x * .1, 390, .75, '#071015');
      this.drawPagodaSilhouette(915 - this.camera.x * .13, 430, .55, '#0a1217');
    }

    drawMountains(parallax, baseY, color, size, variation) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = -size; x <= W + size; x += size) {
        const wx = x + (this.camera.x * parallax) % size;
        const peak = baseY - size * .55 - Math.sin((x + 300) * .013) * variation;
        ctx.lineTo(wx, baseY);
        ctx.lineTo(wx + size * .48, peak);
        ctx.lineTo(wx + size, baseY);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }

    drawPagodaSilhouette(x, y, scale, color) {
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = color;
      for (let floor = 0; floor < 3; floor++) {
        const yy = -floor * 55;
        const width = 145 - floor * 25;
        ctx.fillRect(-width * .35, yy - 42, width * .7, 46);
        ctx.beginPath();
        ctx.moveTo(-width / 2 - 20, yy - 40); ctx.lineTo(width / 2 + 20, yy - 40);
        ctx.lineTo(width / 2 - 4, yy - 62); ctx.lineTo(-width / 2 + 4, yy - 62); ctx.closePath(); ctx.fill();
      }
      ctx.fillRect(-9, -205, 18, 70); ctx.restore();
    }

    drawWorld() {
      this.drawFortressBackdrop();
      for (const p of this.platforms) this.drawPlatform(p);
      for (const l of this.ladders) this.drawLadder(l);
      for (const h of this.hazards) this.drawHazard(h);
      for (const c of this.checkpoints) this.drawCheckpoint(c);
      for (const s of this.seals) if (!s.taken) this.drawSeal(s);
      this.drawFinalGate();
      for (const e of this.enemies) if (e.death > 0 || !e.dead) this.drawFighter(e, false);
      this.drawFighter(this.player, true);
      for (const p of this.particles) this.drawParticle(p);
      this.drawForegroundProps();
    }

    drawFortressBackdrop() {
      const start = Math.floor((this.camera.x - 200) / 420) * 420;
      for (let x = start; x < this.camera.x + W + 500; x += 420) {
        const zone = Math.floor(x / 920);
        const height = 240 + (zone % 3) * 38;
        ctx.fillStyle = zone % 2 ? '#15191c' : '#11171b';
        ctx.fillRect(x, 620 - height, 420, height);
        ctx.fillStyle = '#1e2223';
        for (let y = 620 - height + 22; y < 610; y += 34) {
          for (let bx = x + ((y / 34) % 2) * 30; bx < x + 420; bx += 62) ctx.fillRect(bx, y, 58, 3);
        }
        for (let wx = x + 74; wx < x + 390; wx += 135) {
          const glow = ctx.createRadialGradient(wx, 620 - height + 88, 2, wx, 620 - height + 88, 42);
          glow.addColorStop(0, 'rgba(255,162,53,.42)'); glow.addColorStop(1, 'rgba(255,100,20,0)');
          ctx.fillStyle = glow; ctx.fillRect(wx - 44, 620 - height + 44, 88, 90);
          ctx.fillStyle = '#d36a27'; ctx.fillRect(wx - 10, 620 - height + 72, 20, 34);
          ctx.fillStyle = '#2b1711'; ctx.fillRect(wx - 7, 620 - height + 77, 14, 28);
        }
        ctx.fillStyle = '#090d10';
        ctx.beginPath();
        ctx.moveTo(x - 20, 620 - height); ctx.lineTo(x + 440, 620 - height); ctx.lineTo(x + 400, 620 - height - 34); ctx.lineTo(x + 20, 620 - height - 34); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#20272a';
        for (let i = 0; i < 10; i++) ctx.fillRect(x + i * 44, 620 - height - 41, 30, 12);
      }

      const names = [
        [180, 'OUTER COURTYARD'], [1080, 'MOON GATE'], [1940, 'IMPERIAL ARMOURY'],
        [2850, 'FLOODED PRISON'], [3770, 'PALACE ROOFTOPS'], [4750, 'HALL OF LANTERNS'], [5660, 'CAPTAIN’S ARENA']
      ];
      ctx.font = '700 12px Cinzel, serif';
      ctx.textAlign = 'left';
      for (const [x, name] of names) {
        ctx.fillStyle = 'rgba(232,196,120,.35)'; ctx.fillText(name, x, 342);
        ctx.fillRect(x, 350, 150, 1);
      }

      for (const lamp of this.decor.lanterns) this.drawLantern(lamp);
    }

    drawLantern(lamp) {
      if (lamp.x < this.camera.x - 120 || lamp.x > this.camera.x + W + 120) return;
      const sway = Math.sin(this.time * 1.25 + lamp.phase) * 4;
      ctx.save(); ctx.translate(lamp.x + sway, lamp.y);
      ctx.strokeStyle = '#161719'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -90); ctx.lineTo(0, -28); ctx.stroke();
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 70);
      glow.addColorStop(0, 'rgba(255,190,82,.42)'); glow.addColorStop(1, 'rgba(255,84,25,0)');
      ctx.fillStyle = glow; ctx.fillRect(-75, -70, 150, 140);
      ctx.fillStyle = '#b23922'; ctx.beginPath(); ctx.roundRect(-13, -25, 26, 42, 8); ctx.fill();
      ctx.strokeStyle = '#e5a44b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#25140f'; ctx.fillRect(-15, -29, 30, 5); ctx.fillRect(-15, 17, 30, 5);
      ctx.restore();
    }

    drawPlatform(p) {
      if (p.x + p.w < this.camera.x - 100 || p.x > this.camera.x + W + 100) return;
      const top = ctx.createLinearGradient(0, p.y, 0, p.y + Math.min(p.h, 80));
      top.addColorStop(0, '#665d4d'); top.addColorStop(.12, '#3e3932'); top.addColorStop(1, '#17191a');
      ctx.fillStyle = top; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#a09376'; ctx.fillRect(p.x, p.y, p.w, 4);
      ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fillRect(p.x, p.y + 8, p.w, 5);
      ctx.strokeStyle = 'rgba(146,130,102,.18)'; ctx.lineWidth = 2;
      for (let y = p.y + 22; y < p.y + p.h; y += 26) {
        const offset = ((y - p.y) / 26) % 2 ? 26 : 0;
        for (let x = p.x - offset; x < p.x + p.w; x += 54) ctx.strokeRect(x, y, 52, 24);
      }
      if (p.h < 40) {
        ctx.fillStyle = '#1a1310';
        for (let x = p.x + 18; x < p.x + p.w; x += 62) {
          ctx.beginPath(); ctx.moveTo(x, p.y + p.h); ctx.lineTo(x + 14, p.y + p.h + 28); ctx.lineTo(x + 28, p.y + p.h); ctx.fill();
        }
      }
    }

    drawLadder(l) {
      if (l.x < this.camera.x - 80 || l.x > this.camera.x + W + 80) return;
      ctx.strokeStyle = '#795934'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(l.x - 20, l.top - 8); ctx.lineTo(l.x - 20, l.bottom + 6); ctx.moveTo(l.x + 20, l.top - 8); ctx.lineTo(l.x + 20, l.bottom + 6); ctx.stroke();
      ctx.strokeStyle = '#b08348'; ctx.lineWidth = 4;
      for (let y = l.top + 8; y < l.bottom; y += 28) { ctx.beginPath(); ctx.moveTo(l.x - 20, y); ctx.lineTo(l.x + 20, y); ctx.stroke(); }
    }

    drawHazard(h) {
      if (h.x + h.w < this.camera.x - 80 || h.x > this.camera.x + W + 80) return;
      if (h.type === 'spikes') {
        ctx.fillStyle = '#85827a'; ctx.strokeStyle = '#242728'; ctx.lineWidth = 2;
        const count = Math.ceil(h.w / 20);
        for (let i = 0; i < count; i++) {
          const x = h.x + i * (h.w / count);
          ctx.beginPath(); ctx.moveTo(x, h.y); ctx.lineTo(x + h.w / count / 2, h.y - 28); ctx.lineTo(x + h.w / count, h.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      } else {
        const cycle = (this.time + h.phase) % 3.2;
        const active = cycle < 1.35;
        ctx.fillStyle = '#1c1d1d'; ctx.fillRect(h.x, h.y - 8, h.w, 8);
        if (!active) return;
        for (let i = 0; i < 5; i++) {
          const x = h.x + (i + .5) * h.w / 5;
          const height = 45 + Math.sin(this.time * 13 + i * 2) * 18 + (i % 2) * 18;
          const g = ctx.createLinearGradient(0, h.y, 0, h.y - height);
          g.addColorStop(0, '#ff361d'); g.addColorStop(.48, '#ff9d2e'); g.addColorStop(1, 'rgba(255,232,130,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 11, h.y); ctx.quadraticCurveTo(x - 18, h.y - height * .55, x + Math.sin(this.time * 8 + i) * 8, h.y - height); ctx.quadraticCurveTo(x + 17, h.y - height * .45, x + 11, h.y); ctx.fill();
        }
      }
    }

    drawCheckpoint(c) {
      if (c.x < this.camera.x - 100 || c.x > this.camera.x + W + 100) return;
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.strokeStyle = '#3d2d22'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -116); ctx.stroke();
      if (c.lit) {
        const g = ctx.createRadialGradient(0, -95, 1, 0, -95, 75); g.addColorStop(0, 'rgba(255,192,74,.5)'); g.addColorStop(1, 'rgba(255,89,20,0)'); ctx.fillStyle = g; ctx.fillRect(-80, -175, 160, 160);
      }
      ctx.fillStyle = c.lit ? '#b72b20' : '#392a2a'; ctx.beginPath(); ctx.moveTo(2, -112); ctx.lineTo(60, -96); ctx.lineTo(5, -68); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.lit ? '#f3c268' : '#70635a'; ctx.font = '700 18px serif'; ctx.fillText('雲', 15, -86); ctx.restore();
    }

    drawSeal(s) {
      const bob = Math.sin(this.time * 2.8 + s.x) * 7;
      ctx.save(); ctx.translate(s.x, s.y + bob);
      ctx.rotate(this.time * .35);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 62); glow.addColorStop(0, 'rgba(255,222,120,.6)'); glow.addColorStop(1, 'rgba(255,142,27,0)'); ctx.fillStyle = glow; ctx.fillRect(-70, -70, 140, 140);
      ctx.rotate(-this.time * .7);
      ctx.fillStyle = '#b77823'; ctx.strokeStyle = '#ffe39b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#6c3114'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#301810'; ctx.font = '700 18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('印', 0, 1); ctx.restore();
    }

    drawFinalGate() {
      const x = 5560;
      ctx.save(); ctx.translate(x, 620);
      ctx.fillStyle = '#120e0e'; ctx.fillRect(-34, -250, 68, 250);
      ctx.fillStyle = '#512118'; ctx.fillRect(-24, -225, 48, 225);
      ctx.strokeStyle = '#b58744'; ctx.lineWidth = 3; ctx.strokeRect(-24, -225, 48, 225);
      for (let y = -200; y < -20; y += 42) { ctx.beginPath(); ctx.moveTo(-22, y); ctx.lineTo(22, y); ctx.stroke(); }
      if (this.sealCount < 5) {
        const g = ctx.createLinearGradient(-30, 0, 30, 0); g.addColorStop(0, 'rgba(190,31,23,.05)'); g.addColorStop(.5, 'rgba(255,70,43,.72)'); g.addColorStop(1, 'rgba(190,31,23,.05)'); ctx.fillStyle = g; ctx.fillRect(-20, -230, 40, 230);
        ctx.fillStyle = '#ff8c58'; ctx.font = '700 20px serif'; ctx.textAlign = 'center'; ctx.fillText('封', 0, -120);
      }
      ctx.restore();

      if (this.bossDefeated) {
        const exitX = 6325;
        const glow = ctx.createRadialGradient(exitX, 500, 10, exitX, 500, 160); glow.addColorStop(0, 'rgba(244,209,128,.55)'); glow.addColorStop(1, 'rgba(244,209,128,0)'); ctx.fillStyle = glow; ctx.fillRect(exitX - 170, 330, 340, 300);
        ctx.fillStyle = '#f6deb1'; ctx.font = '700 13px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillText('DAWN AWAITS', exitX, 430);
      }
    }

    drawFighter(f, player) {
      if (f.x < this.camera.x - 140 || f.x > this.camera.x + W + 140) return;
      const boss = !player && f.type === 'boss';
      const alpha = f.dead ? clamp(f.death / .75, 0, 1) : 1;
      const hurtFlash = !player && f.hurt > 0;
      const moving = Math.abs(f.vx) > 25;
      const walk = Math.sin(f.anim) * (moving ? 1 : .15);
      const scale = boss ? 1.24 : 1;
      const attack = player ? f.attack : (f.attack > 0 ? { kind: f.type === 'spear' ? 'spear' : 'enemy', t: 1 - f.attack } : null);
      const attackProgress = player && attack ? clamp(attack.t / attack.duration, 0, 1) : attack ? clamp(attack.t, 0, 1) : 0;

      ctx.save();
      ctx.globalAlpha = alpha * ((player && f.invuln > 0 && Math.floor(this.time * 18) % 2) ? .38 : 1);
      ctx.translate(f.x, f.y);
      ctx.scale(f.facing * scale, scale);

      ctx.save(); ctx.scale(f.facing, 1); ctx.globalAlpha *= .38; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 2, boss ? 45 : 31, 9, 0, 0, TAU); ctx.fill(); ctx.restore();

      if (player && f.dashTimer > 0) {
        ctx.globalAlpha *= .22; ctx.fillStyle = '#9eeaff';
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-i * 23, -42, 24, 40, 0, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = alpha;
      }

      const body = player ? '#d69b2d' : boss ? '#6f1817' : f.type === 'acrobat' ? '#263b43' : '#252a2d';
      const trim = player ? '#f2cf6b' : boss ? '#d9a33a' : '#9f3326';
      const pants = player ? '#171b1e' : '#15191b';
      const skin = '#d49a72';
      const outline = hurtFlash ? '#fff2c4' : '#080a0b';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      let frontLeg = walk * 14;
      let backLeg = -walk * 14;
      let kickExtend = 0;
      if (player && attack && (attack.kind === 'kick' || attack.kind === 'airkick')) kickExtend = Math.sin(attackProgress * Math.PI) * 64;

      ctx.strokeStyle = outline; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(-8, -38); ctx.lineTo(-18 + backLeg, -9); ctx.lineTo(-16 + backLeg * 1.2, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -38); ctx.lineTo(18 + frontLeg + kickExtend * .45, -14 - kickExtend * .35); ctx.lineTo(18 + frontLeg + kickExtend, -2 - kickExtend * .62); ctx.stroke();
      ctx.strokeStyle = pants; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(-8, -38); ctx.lineTo(-18 + backLeg, -9); ctx.lineTo(-16 + backLeg * 1.2, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -38); ctx.lineTo(18 + frontLeg + kickExtend * .45, -14 - kickExtend * .35); ctx.lineTo(18 + frontLeg + kickExtend, -2 - kickExtend * .62); ctx.stroke();

      ctx.fillStyle = outline; ctx.beginPath(); ctx.roundRect(-23, -78, 46, 48, 14); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(-19, -75, 38, 42, 11); ctx.fill();
      ctx.strokeStyle = trim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-15, -43); ctx.lineTo(15, -43); ctx.stroke();
      if (boss) { ctx.strokeStyle = '#c9993c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-17, -65); ctx.lineTo(17, -50); ctx.stroke(); }

      let armExtend = 0;
      if (player && attack && (attack.kind === 'punch' || attack.kind === 'chi')) armExtend = Math.sin(attackProgress * Math.PI) * (attack.kind === 'chi' ? 72 : 44);
      if (!player && attack) armExtend = Math.sin(clamp(attackProgress * 2.1, 0, 1) * Math.PI) * (f.type === 'spear' ? 68 : 38);
      ctx.strokeStyle = outline; ctx.lineWidth = 13;
      ctx.beginPath(); ctx.moveTo(-14, -66); ctx.lineTo(-32, -48 + walk * 3); ctx.lineTo(-22, -34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -65); ctx.lineTo(30 + armExtend * .55, -51); ctx.lineTo(38 + armExtend, -52); ctx.stroke();
      ctx.strokeStyle = body; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-14, -66); ctx.lineTo(-32, -48 + walk * 3); ctx.lineTo(-22, -34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -65); ctx.lineTo(30 + armExtend * .55, -51); ctx.stroke();
      ctx.strokeStyle = skin; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(30 + armExtend * .55, -51); ctx.lineTo(38 + armExtend, -52); ctx.stroke();

      ctx.fillStyle = outline; ctx.beginPath(); ctx.arc(0, -94, 18, 0, TAU); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(2, -93, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = player ? '#101315' : '#17110f'; ctx.beginPath(); ctx.arc(-3, -101, 14, Math.PI, TAU); ctx.fill();
      if (player) { ctx.beginPath(); ctx.moveTo(-15, -100); ctx.lineTo(-5, -113); ctx.lineTo(2, -104); ctx.lineTo(10, -115); ctx.lineTo(15, -97); ctx.fill(); }
      else { ctx.fillStyle = trim; ctx.fillRect(-15, -102, 30, 5); }
      ctx.fillStyle = '#1d1714'; ctx.fillRect(8, -94, 4, 2);

      if (!player && (f.type === 'sword' || f.type === 'spear' || boss)) {
        ctx.save(); ctx.translate(38 + armExtend, -52); ctx.rotate(f.type === 'spear' ? -.08 : -.55);
        ctx.strokeStyle = '#090b0c'; ctx.lineWidth = f.type === 'spear' ? 7 : 8; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(f.type === 'spear' ? 88 : 55, 0); ctx.stroke();
        ctx.strokeStyle = '#b7b2a4'; ctx.lineWidth = f.type === 'spear' ? 3 : 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(f.type === 'spear' ? 82 : 54, 0); ctx.stroke();
        if (f.type === 'spear') { ctx.fillStyle = '#d6d0bd'; ctx.beginPath(); ctx.moveTo(98, 0); ctx.lineTo(79, -7); ctx.lineTo(82, 7); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }

      if (player && attack && attack.kind === 'chi') {
        const r = 24 + Math.sin(attackProgress * Math.PI) * 34;
        const gx = 40 + armExtend;
        const glow = ctx.createRadialGradient(gx, -52, 1, gx, -52, r); glow.addColorStop(0, 'rgba(220,251,255,.95)'); glow.addColorStop(.35, 'rgba(62,203,244,.75)'); glow.addColorStop(1, 'rgba(25,143,217,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(gx, -52, r, 0, TAU); ctx.fill();
      }

      ctx.restore();
    }

    drawParticle(p) {
      ctx.save(); ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.shadowBlur = 8; ctx.shadowColor = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * clamp(p.life / p.max, .2, 1), 0, TAU); ctx.fill(); ctx.restore();
    }

    drawForegroundProps() {
      const start = Math.floor((this.camera.x - 120) / 520) * 520;
      for (let x = start; x < this.camera.x + W + 300; x += 520) {
        ctx.fillStyle = '#090d0f'; ctx.fillRect(x, 565, 18, 80);
        ctx.beginPath(); ctx.moveTo(x - 34, 575); ctx.lineTo(x + 52, 575); ctx.lineTo(x + 36, 554); ctx.lineTo(x - 18, 554); ctx.closePath(); ctx.fill();
      }
    }

    drawAtmosphere() {
      const fog = ctx.createLinearGradient(0, H * .55, 0, H); fog.addColorStop(0, 'rgba(85,110,119,0)'); fog.addColorStop(1, 'rgba(34,53,59,.22)'); ctx.fillStyle = fog; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = .08;
      for (let i = 0; i < 4; i++) {
        const x = ((this.time * (11 + i * 4) + i * 340) % (W + 420)) - 210;
        ctx.fillStyle = '#d7ebef'; ctx.beginPath(); ctx.ellipse(x, 590 - i * 34, 240, 32, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      const vignette = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 760); vignette.addColorStop(.55, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.62)'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    }
  }

  function showScreen(id) {
    screens.forEach(s => s.classList.toggle('active', s.id === id));
  }

  const game = new Game();

  document.getElementById('start-button').addEventListener('click', () => game.start());
  document.getElementById('story-button').addEventListener('click', () => showScreen('story-screen'));
  document.getElementById('controls-button').addEventListener('click', () => showScreen('controls-screen'));
  document.querySelectorAll('.back-button').forEach(b => b.addEventListener('click', () => showScreen('title-screen')));
  document.getElementById('pause-button').addEventListener('click', () => game.pause());
  document.getElementById('resume-button').addEventListener('click', () => game.resume());
  document.getElementById('restart-button').addEventListener('click', () => game.start());
  document.getElementById('quit-button').addEventListener('click', () => game.title());
  document.getElementById('again-button').addEventListener('click', () => game.start());
  document.getElementById('result-title-button').addEventListener('click', () => game.title());

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.034, Math.max(.001, (now - last) / 1000));
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
