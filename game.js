/* Flappy Dash — Sunset Run
 * A dependency-free canvas game. All art is drawn at runtime.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- constants

  const TAU = Math.PI * 2;
  const W = 400;
  const H = 700;
  const GROUND_H = 94;
  const SKY_H = H - GROUND_H;

  const GRAVITY = 1850;
  const FLAP_V = -545;
  const MAX_FALL = 980;
  const BIRD_X = 116;
  const BIRD_START_Y = 320;
  const BIRD_R = 11;

  const PIPE_W = 70;
  const CAP_H = 26;
  const PIPE_SPACING = 250;
  const BASE_SPEED = 152;
  const MAX_SPEED = 242;
  const BASE_GAP = 172;
  const MIN_GAP = 144;

  const BEST_KEY = 'flappydash.best';
  const MUTE_KEY = 'flappydash.muted';

  // ---------------------------------------------------------------- dom

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const bestStartEl = document.getElementById('bestStart');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl = document.getElementById('finalBest');
  const newBestEl = document.getElementById('newBest');
  const medalEl = document.getElementById('medal');
  const muteBtn = document.getElementById('mute');
  const playBtn = document.getElementById('play');
  const againBtn = document.getElementById('again');
  const resumeBtn = document.getElementById('resume');
  const overlayStart = document.getElementById('overlayStart');
  const overlayOver = document.getElementById('overlayOver');
  const overlayPause = document.getElementById('overlayPause');
  const flashEl = document.getElementById('flash');

  const overlayEls = [overlayStart, overlayOver, overlayPause];
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- helpers

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const mod = (n, m) => ((n % m) + m) % m;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function mulberry32(seed) {
    return function random() {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function readNumber(key, fallback) {
    try {
      const value = Number.parseInt(window.localStorage.getItem(key) || '', 10);
      return Number.isFinite(value) ? Math.max(0, value) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeNumber(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      /* storage is optional */
    }
  }

  function readFlag(key) {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  function writeFlag(key, value) {
    try {
      window.localStorage.setItem(key, value ? '1' : '0');
    } catch {
      /* storage is optional */
    }
  }

  // ---------------------------------------------------------------- audio

  const sound = {
    ctx: null,
    master: null,
    noiseBuffer: null,
    muted: readFlag(MUTE_KEY),

    unlock() {
      if (!this.ctx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        try {
          this.ctx = new AudioCtor();
        } catch {
          return;
        }
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.4;
        this.master.connect(this.ctx.destination);

        const length = Math.floor(this.ctx.sampleRate * 0.4);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    tone(from, to, duration, type, volume, delay = 0) {
      if (this.muted || !this.ctx) return;
      const start = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(this.master);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    },

    noise(duration, volume, freqFrom, freqTo) {
      if (this.muted || !this.ctx || !this.noiseBuffer) return;
      const start = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freqFrom, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, freqTo), start + duration);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(start);
      src.stop(start + duration);
    },

    flap() {
      this.tone(520, 760, 0.09, 'triangle', 0.22);
      this.noise(0.06, 0.1, 1800, 700);
    },

    score() {
      this.tone(880, 880, 0.07, 'square', 0.09);
      this.tone(1320, 1320, 0.12, 'square', 0.08, 0.065);
    },

    hit() {
      this.tone(210, 55, 0.22, 'sawtooth', 0.3);
      this.noise(0.26, 0.26, 1000, 110);
    },

    die() {
      this.tone(340, 70, 0.55, 'square', 0.14, 0.09);
    },

    click() {
      this.tone(620, 880, 0.06, 'sine', 0.12);
    },
  };

  function syncMuteUi() {
    muteBtn.classList.toggle('is-muted', sound.muted);
    muteBtn.setAttribute('aria-pressed', String(sound.muted));
    muteBtn.setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound');
  }

  function toggleMute() {
    sound.muted = !sound.muted;
    writeFlag(MUTE_KEY, sound.muted);
    syncMuteUi();
    if (!sound.muted) {
      sound.unlock();
      sound.click();
    }
  }

  // ---------------------------------------------------------------- backdrop data

  const rng = mulberry32(20261123);

  const stars = Array.from({ length: 64 }, () => ({
    x: rng() * W,
    y: rng() * 300 + 8,
    r: 0.6 + rng() * 1.3,
    base: 0.25 + rng() * 0.55,
    phase: rng() * TAU,
  }));

  const clouds = Array.from({ length: 8 }, () => ({
    x: rng() * W,
    y: 70 + rng() * 290,
    s: 0.65 + rng() * 1.05,
    v: 4 + rng() * 11,
    a: 0.07 + rng() * 0.1,
  }));

  const RIDGE_HEIGHTS = [92, 142, 74, 124, 162, 88, 132, 104];

  const city = buildCity();

  // ---------------------------------------------------------------- view fitting

  const view = { scale: 1, ox: 0, oy: 0 };

  function fitCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.round(rect.width * dpr));
    const bh = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const s = Math.min(bw / W, bh / H);
    view.scale = s;
    view.ox = (bw - W * s) / 2;
    view.oy = (bh - H * s) / 2;
  }

  // ---------------------------------------------------------------- game state

  const bird = {
    x: BIRD_X,
    y: BIRD_START_Y,
    baseY: BIRD_START_Y,
    vy: 0,
    rot: 0,
    wing: 0,
  };

  const game = {
    phase: 'ready',
    time: 0,
    score: 0,
    best: readNumber(BEST_KEY, 0),
    newBest: false,
    speed: BASE_SPEED,
    gap: BASE_GAP,
    worldScroll: 0,
    shake: 0,
    pipes: [],
    particles: [],
    landTimer: 0,
    landed: false,
  };

  // ---------------------------------------------------------------- overlays

  function setOverlay(el, open) {
    el.classList.toggle('is-hidden', !open);
    el.toggleAttribute('inert', !open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function closeOverlays() {
    overlayEls.forEach((el) => setOverlay(el, false));
  }

  function openOverlay(el) {
    closeOverlays();
    setOverlay(el, true);
  }

  // ---------------------------------------------------------------- pipe helpers

  function makePipe(x, gap) {
    const marginTop = 92;
    const marginBottom = 76;
    const minCenter = marginTop + gap / 2;
    const maxCenter = SKY_H - marginBottom - gap / 2;
    const last = game.pipes[game.pipes.length - 1];
    const previousCenter = last ? last.gapTop + last.gap / 2 : SKY_H * 0.46;
    const center = clamp(previousCenter + rand(-145, 145), minCenter, maxCenter);
    return { x, gap, gapTop: center - gap / 2, scored: false };
  }

  function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function hitsPipe() {
    for (let i = 0; i < game.pipes.length; i += 1) {
      const p = game.pipes[i];
      if (p.x > bird.x + BIRD_R || p.x + PIPE_W < bird.x - BIRD_R) continue;
      const gapBottom = p.gapTop + p.gap;
      if (circleHitsRect(bird.x, bird.y, BIRD_R, p.x, -200, PIPE_W, p.gapTop + 200)) return true;
      if (circleHitsRect(bird.x, bird.y, BIRD_R, p.x, gapBottom, PIPE_W, SKY_H - gapBottom + 50)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- particles

  function addParticle(x, y, opts) {
    if (game.particles.length > 190) return;
    game.particles.push({
      x,
      y,
      vx: opts.vx,
      vy: opts.vy,
      life: opts.life,
      maxLife: opts.life,
      size: opts.size,
      color: opts.color,
      gravity: opts.gravity ?? 500,
      drag: opts.drag ?? 1.5,
      spin: rand(-4, 4),
      rot: rand(0, TAU),
    });
  }

  function puff(x, y) {
    const count = prefersReduced ? 2 : 5;
    for (let i = 0; i < count; i += 1) {
      addParticle(x, y, {
        vx: rand(-95, -20),
        vy: rand(-30, 80),
        life: rand(0.25, 0.5),
        size: rand(1.6, 3.4),
        color: pick(['#ffe9a8', '#ffd166', '#fff6d8']),
        gravity: 240,
        drag: 2.6,
      });
    }
  }

  function sparkle(x, y) {
    const count = prefersReduced ? 3 : 7;
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(30, 130);
      addParticle(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.3, 0.55),
        size: rand(1.4, 3),
        color: pick(['#8ff7d0', '#41e6b0', '#ffffff']),
        gravity: 120,
        drag: 2,
      });
    }
  }

  function burst(x, y) {
    const count = prefersReduced ? 10 : 26;
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(60, 340);
      addParticle(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: rand(0.4, 1.05),
        size: rand(2, 5),
        color: pick(['#ffd166', '#ff8a3d', '#ff5a5f', '#fff3d6', '#ffb03f']),
        gravity: 780,
        drag: 0.9,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i -= 1) {
      const p = game.particles[i];
      p.life -= dt;
      if (p.life <= 0 || p.y > H + 40) {
        game.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.max(0, 1 - p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  function drawParticles() {
    for (let i = 0; i < game.particles.length; i += 1) {
      const p = game.particles[i];
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.55 + 0.45 * alpha), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- run flow

  function resetWorld() {
    bird.x = BIRD_X;
    bird.baseY = BIRD_START_Y;
    bird.y = BIRD_START_Y;
    bird.vy = 0;
    bird.rot = 0;
    bird.wing = 0;

    game.score = 0;
    game.speed = BASE_SPEED;
    game.gap = BASE_GAP;
    game.worldScroll = 0;
    game.shake = 0;
    game.landTimer = 0;
    game.landed = false;
    game.newBest = false;
    game.particles.length = 0;
    game.pipes.length = 0;
    game.pipes.push(makePipe(W + 60, BASE_GAP));

    scoreEl.textContent = '0';
    scoreEl.classList.remove('bump');
    bestStartEl.textContent = String(game.best);
    medalEl.dataset.tier = 'none';
    newBestEl.classList.add('is-hidden');
  }

  function toReady() {
    resetWorld();
    game.phase = 'ready';
    stage.dataset.phase = 'ready';
    openOverlay(overlayStart);
  }

  function startPlaying() {
    if (game.phase !== 'ready') return;
    sound.unlock();
    closeOverlays();
    game.phase = 'playing';
    stage.dataset.phase = 'playing';
    flap();
  }

  function restartRun() {
    if (game.phase !== 'over') return;
    sound.unlock();
    resetWorld();
    game.phase = 'ready';
    startPlaying();
  }

  function flap() {
    bird.vy = FLAP_V;
    bird.wing = 1;
    puff(bird.x - 13, bird.y + 5);
    sound.flap();
  }

  function addScore() {
    game.score += 1;
    scoreEl.textContent = String(game.score);
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
    sparkle(bird.x + 6, bird.y - 4);
    sound.score();
  }

  function flash() {
    flashEl.classList.remove('is-on');
    void flashEl.offsetWidth;
    flashEl.classList.add('is-on');
  }

  function die() {
    if (game.phase !== 'playing') return;

    if (bird.y + BIRD_R > SKY_H) bird.y = SKY_H - BIRD_R;

    game.phase = 'dying';
    stage.dataset.phase = 'dying';
    game.landTimer = 0;
    game.landed = false;
    game.shake = prefersReduced ? 0 : 0.5;
    bird.vy = -235;
    bird.wing = 0;

    burst(bird.x, bird.y);
    flash();
    sound.hit();
    sound.die();

    if (game.score > game.best) {
      game.best = game.score;
      game.newBest = true;
      bestStartEl.textContent = String(game.best);
      writeNumber(BEST_KEY, game.best);
    }
  }

  function setMedal(score) {
    let tier = 'none';
    if (score >= 40) tier = 'platinum';
    else if (score >= 30) tier = 'gold';
    else if (score >= 20) tier = 'silver';
    else if (score >= 10) tier = 'bronze';
    medalEl.dataset.tier = tier;
  }

  function showGameOver() {
    if (game.phase !== 'dying') return;
    game.phase = 'over';
    stage.dataset.phase = 'over';
    finalScoreEl.textContent = String(game.score);
    finalBestEl.textContent = String(game.best);
    newBestEl.classList.toggle('is-hidden', !game.newBest);
    setMedal(game.score);
    openOverlay(overlayOver);
  }

  function pauseGame() {
    if (game.phase !== 'playing') return;
    game.phase = 'paused';
    stage.dataset.phase = 'paused';
    game.shake = 0;
    openOverlay(overlayPause);
  }

  function resumeGame() {
    if (game.phase !== 'paused') return;
    closeOverlays();
    game.phase = 'playing';
    stage.dataset.phase = 'playing';
    last = performance.now();
  }

  function primaryAction() {
    switch (game.phase) {
      case 'ready':
        startPlaying();
        break;
      case 'playing':
        flap();
        break;
      case 'paused':
        resumeGame();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- update

  function updateClouds(dt) {
    for (let i = 0; i < clouds.length; i += 1) {
      const c = clouds[i];
      c.x += c.v * dt;
      if (c.x - 80 * c.s > W) c.x = -80 * c.s;
    }
  }

  function update(dt) {
    if (game.phase === 'paused') return;

    game.time += dt;
    updateClouds(dt);
    updateParticles(dt);
    game.shake = Math.max(0, game.shake - dt * 2.1);

    if (game.phase === 'ready') {
      bird.y = bird.baseY + Math.sin(game.time * 2.4) * 7;
      bird.rot = Math.sin(game.time * 2.4 + 0.7) * 0.06;
      bird.wing = Math.max(0, bird.wing - dt * 6);
      return;
    }

    if (game.phase === 'playing') {
      game.speed = Math.min(BASE_SPEED + game.score * 2.5, MAX_SPEED);
      game.gap = Math.max(MIN_GAP, BASE_GAP - game.score * 1.7);
      game.worldScroll += game.speed * dt;

      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
      bird.y += bird.vy * dt;
      bird.wing = Math.max(0, bird.wing - dt * 5);

      if (bird.y < 8) {
        bird.y = 8;
        bird.vy = Math.max(bird.vy, 0);
      }

      const targetRot = clamp(bird.vy / 660, -0.55, 1.4);
      bird.rot += (targetRot - bird.rot) * Math.min(1, dt * 12);

      for (let i = 0; i < game.pipes.length; i += 1) {
        const p = game.pipes[i];
        p.x -= game.speed * dt;
        if (!p.scored && p.x + PIPE_W < bird.x - BIRD_R) {
          p.scored = true;
          addScore();
        }
      }

      while (game.pipes.length && game.pipes[0].x + PIPE_W < -30) game.pipes.shift();

      const lastPipe = game.pipes[game.pipes.length - 1];
      if (!lastPipe || lastPipe.x < W - PIPE_SPACING) {
        game.pipes.push(makePipe(lastPipe ? lastPipe.x + PIPE_SPACING : W + 60, game.gap));
      }

      if (bird.y + BIRD_R >= SKY_H || hitsPipe()) {
        die();
        return;
      }
      return;
    }

    if (game.phase === 'dying') {
      if (bird.y + BIRD_R >= SKY_H - 0.5) {
        bird.y = SKY_H - BIRD_R;
        if (!game.landed) {
          game.landed = true;
          if (!prefersReduced) puff(bird.x - 4, bird.y + 8);
        }
        bird.vy = 0;
        game.landTimer += dt;
        bird.rot += (Math.PI / 2 - bird.rot) * Math.min(1, dt * 10);
        if (game.landTimer > 0.5) showGameOver();
      } else {
        bird.vy = Math.min(bird.vy + GRAVITY * 1.1 * dt, MAX_FALL * 1.15);
        bird.y += bird.vy * dt;
        bird.rot = Math.min(bird.rot + dt * 3.4, Math.PI / 2);
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  function drawSky(time) {
    const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
    sky.addColorStop(0, '#140a28');
    sky.addColorStop(0.32, '#3b1551');
    sky.addColorStop(0.56, '#7c2660');
    sky.addColorStop(0.76, '#c7465f');
    sky.addColorStop(0.92, '#f08453');
    sky.addColorStop(1, '#ffb066');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, SKY_H);

    // stars
    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];
      const twinkle = 0.65 + 0.35 * Math.sin(time * 1.4 + s.phase);
      ctx.globalAlpha = s.base * twinkle;
      ctx.fillStyle = '#fff5e8';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // sun
    const sunX = 292;
    const sunY = 400;
    const sunR = 76;
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 2.8);
    glow.addColorStop(0, 'rgba(255, 196, 120, 0.4)');
    glow.addColorStop(0.55, 'rgba(255, 152, 98, 0.13)');
    glow.addColorStop(1, 'rgba(255, 120, 80, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.8, 0, TAU);
    ctx.fill();

    const sun = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sun.addColorStop(0, '#fff3c6');
    sun.addColorStop(0.5, '#ffc46b');
    sun.addColorStop(1, '#ff7c4e');
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, TAU);
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
    ctx.fillStyle = 'rgba(150, 46, 92, 0.8)';
    for (let i = 0; i < 7; i += 1) {
      const bandY = sunY + 6 + i * 11;
      const bandH = 2.5 + i * 0.7;
      ctx.fillRect(sunX - sunR, bandY, sunR * 2, bandH);
    }
    ctx.restore();

    // clouds
    for (let i = 0; i < clouds.length; i += 1) {
      const c = clouds[i];
      drawCloud(c.x, c.y, c.s, c.a);
    }

    // mountain ridges
    drawRidge(game.worldScroll * 0.13, SKY_H - 24, 128, '#3a1b52', 0.88);
    drawRidge(game.worldScroll * 0.24, SKY_H - 4, 96, '#2a1244', 1);

    // city skyline
    drawCity();
  }

  function drawCloud(x, y, s, alpha) {
    ctx.fillStyle = `rgba(255, 208, 220, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 42 * s, 16 * s, 0, 0, TAU);
    ctx.ellipse(x - 27 * s, y + 5 * s, 22 * s, 12 * s, 0, 0, TAU);
    ctx.ellipse(x + 30 * s, y + 6 * s, 25 * s, 12 * s, 0, 0, TAU);
    ctx.ellipse(x + 7 * s, y - 11 * s, 24 * s, 17 * s, 0, 0, TAU);
    ctx.fill();
  }

  function drawRidge(offset, baseY, spacing, color, heightScale) {
    const shift = mod(offset, spacing);
    const baseIndex = Math.floor(offset / spacing);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-spacing * 2, baseY);
    const count = Math.ceil(W / spacing) + 3;
    for (let i = -1; i <= count; i += 1) {
      const height = RIDGE_HEIGHTS[mod(baseIndex + i, RIDGE_HEIGHTS.length)] * heightScale;
      const x = i * spacing - shift;
      ctx.lineTo(x - spacing * 0.62, baseY);
      ctx.lineTo(x, baseY - height);
      ctx.lineTo(x + spacing * 0.62, baseY);
    }
    ctx.lineTo(W + spacing * 2, baseY);
    ctx.closePath();
    ctx.fill();
  }

  function buildCity() {
    const r = mulberry32(777);
    let x = 0;
    const list = [];
    while (x < 780) {
      const w = 26 + r() * 36;
      const h = 44 + r() * 86;
      const wins = [];
      const cols = Math.max(1, Math.floor((w - 10) / 11));
      const rows = Math.max(1, Math.floor((h - 12) / 14));
      for (let c = 0; c < cols; c += 1) {
        for (let row = 0; row < rows; row += 1) {
          if (r() > 0.46) wins.push([6 + c * 11, 8 + row * 14]);
        }
      }
      list.push({ x, w, h, wins });
      x += w + 5 + r() * 12;
    }
    return { list, period: x, tile: null };
  }

  function buildCityTile() {
    const S = 2;
    const tile = document.createElement('canvas');
    tile.width = Math.ceil(city.period * S);
    tile.height = SKY_H * S;
    const c = tile.getContext('2d');
    c.scale(S, S);
    for (let i = 0; i < city.list.length; i += 1) {
      const b = city.list[i];
      const y = SKY_H - b.h;
      c.fillStyle = '#1b0d31';
      c.fillRect(b.x, y, b.w, b.h);
      c.fillStyle = 'rgba(255, 255, 255, 0.05)';
      c.fillRect(b.x, y, b.w, 2);
      c.fillStyle = 'rgba(255, 190, 120, 0.42)';
      for (let k = 0; k < b.wins.length; k += 1) {
        const win = b.wins[k];
        c.fillRect(b.x + win[0], y + win[1], 4, 6);
      }
    }
    city.tile = tile;
  }

  function drawCity() {
    if (!city.tile) return;
    const offset = mod(game.worldScroll * 0.32, city.period);
    for (let k = -1; k <= Math.ceil(W / city.period) + 1; k += 1) {
      ctx.drawImage(city.tile, k * city.period - offset, 0, city.period, SKY_H);
    }
  }

  function roundRectPath(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function makePipeGradient(x) {
    const g = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    g.addColorStop(0, '#63f5be');
    g.addColorStop(0.18, '#2edaa2');
    g.addColorStop(0.62, '#12a276');
    g.addColorStop(1, '#0a6c50');
    return g;
  }

  function drawPipeSection(x, y, h, gradient) {
    roundRectPath(x, y, PIPE_W, h, 5);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#053b2c';
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(x + 7, y + 5, 5, Math.max(0, h - 10));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(x + PIPE_W - 12, y + 5, 7, Math.max(0, h - 10));
  }

  function drawPipeCap(x, y, gradient) {
    const cx = x - 6;
    const cw = PIPE_W + 12;
    roundRectPath(cx, y, cw, CAP_H, 7);
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(70, 245, 190, 0.3)';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#053b2c';
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.fillRect(cx + 7, y + 6, 5, CAP_H - 12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.fillRect(cx + cw - 12, y + 6, 6, CAP_H - 12);
  }

  function drawPipes() {
    for (let i = 0; i < game.pipes.length; i += 1) {
      const p = game.pipes[i];
      if (p.x + PIPE_W + 12 < 0 || p.x - 12 > W) continue;
      const gapBottom = p.gapTop + p.gap;
      const gradient = makePipeGradient(p.x);
      drawPipeSection(p.x, -40, p.gapTop + 40, gradient);
      drawPipeCap(p.x, p.gapTop - CAP_H, gradient);
      drawPipeSection(p.x, gapBottom, SKY_H - gapBottom + 4, gradient);
      drawPipeCap(p.x, gapBottom, gradient);
    }
  }

  function drawGround() {
    ctx.fillStyle = '#130a23';
    ctx.fillRect(0, SKY_H, W, GROUND_H);

    ctx.fillStyle = 'rgba(47, 230, 166, 0.16)';
    ctx.fillRect(0, SKY_H + 3, W, 12);

    ctx.fillStyle = '#2fe6a6';
    ctx.fillRect(0, SKY_H, W, 3);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, SKY_H + 14, W, GROUND_H - 14);
    ctx.clip();
    const spacing = 56;
    const offset = mod(game.worldScroll, spacing);
    ctx.strokeStyle = 'rgba(126, 88, 186, 0.2)';
    ctx.lineWidth = 9;
    for (let x = -160 - offset; x < W + 160; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, SKY_H + 14);
      ctx.lineTo(x + 74, H);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(47, 230, 166, 0.08)';
    ctx.lineWidth = 3;
    for (let x = -130 - offset; x < W + 160; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, SKY_H + 14);
      ctx.lineTo(x + 60, H);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(8, 5, 15, 0.5)';
    ctx.fillRect(0, H - 16, W, 16);
  }

  function drawBird(time) {
    const wingAngle = -0.38 - bird.wing * 0.85 + Math.sin(time * 9) * 0.07;

    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4a1a10';

    // tail
    ctx.beginPath();
    ctx.moveTo(-12, -3);
    ctx.lineTo(-23, -11);
    ctx.lineTo(-21, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff9f3d';
    ctx.fill();
    ctx.stroke();

    // body
    const body = ctx.createLinearGradient(0, -14, 0, 14);
    body.addColorStop(0, '#ffe98a');
    body.addColorStop(0.5, '#ffd24d');
    body.addColorStop(1, '#f5a52e');
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 12.5, 0, 0, TAU);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.stroke();

    // belly
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.ellipse(2, 4.5, 10.5, 6, 0, 0, TAU);
    ctx.fill();

    // wing
    ctx.save();
    ctx.translate(-3, 1);
    ctx.rotate(wingAngle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 5.5, 0, 0, TAU);
    ctx.fillStyle = '#ffb547';
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // beak
    ctx.beginPath();
    ctx.moveTo(13, -1.5);
    ctx.lineTo(25, 2);
    ctx.lineTo(13, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff7a2f';
    ctx.fill();
    ctx.stroke();

    // eye
    ctx.beginPath();
    ctx.ellipse(7, -5.5, 5, 5.5, 0, 0, TAU);
    ctx.fillStyle = '#fffdf5';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(8.4, -5, 2.3, 0, TAU);
    ctx.fillStyle = '#2a1019';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(9.3, -6, 0.85, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }

  function render(time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120a21';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = view.scale;
    ctx.setTransform(s, 0, 0, s, view.ox, view.oy);

    ctx.save();
    if (game.shake > 0) {
      const amount = game.shake * 12;
      ctx.translate(rand(-amount, amount), rand(-amount, amount));
    }

    drawSky(time);
    drawPipes();
    drawGround();
    drawParticles();
    drawBird(time);

    ctx.restore();
  }

  // ---------------------------------------------------------------- loop

  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    render(now / 1000);
    window.requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- input

  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    sound.unlock();
    primaryAction();
  });

  muteBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMute();
  });

  playBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    startPlaying();
  });

  againBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    restartRun();
  });

  resumeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    resumeGame();
  });

  window.addEventListener('keydown', (event) => {
    const code = event.code;

    if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
      if (event.repeat) return;
      event.preventDefault();
      sound.unlock();
      if (game.phase === 'over') {
        restartRun();
      } else {
        primaryAction();
      }
      return;
    }

    if (code === 'KeyP' || code === 'Escape') {
      if (event.repeat) return;
      if (game.phase === 'playing') pauseGame();
      else if (game.phase === 'paused') resumeGame();
      return;
    }

    if (code === 'KeyM') {
      if (event.repeat) return;
      toggleMute();
    }
  });

  window.addEventListener('pointerdown', () => sound.unlock(), { once: true, passive: true });
  window.addEventListener('keydown', () => sound.unlock(), { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  window.addEventListener('blur', () => pauseGame());

  // ---------------------------------------------------------------- boot

  syncMuteUi();
  bestStartEl.textContent = String(game.best);
  buildCityTile();
  fitCanvas();

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(fitCanvas).observe(stage);
  } else {
    window.addEventListener('resize', fitCanvas);
  }
  window.addEventListener('orientationchange', fitCanvas);

  toReady();
  window.requestAnimationFrame(frame);
})();
