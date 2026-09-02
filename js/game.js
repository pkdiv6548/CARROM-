'use strict';

/* =========================================================
   CARROM CLASH — GAME ENGINE
   Mobile-first • Precise aiming • 1P/2P/3P/4P
   Web Audio • Physics • Pockets • Queen • Winner FX
   ========================================================= */

const $ = s => document.querySelector(s);

const canvas = $('#board');
const ctx = canvas ? canvas.getContext('2d') : null;

const W = 900;
const CX = 450;
const CY = 450;

/* Board geometry */
const BOARD_R = 365;
const RAIL_MIN = 52;
const RAIL_MAX = 848;

const POCKETS = [
  [54, 54],
  [846, 54],
  [54, 846],
  [846, 846]
];

const POCKET_R = 35;

/* Theme */
const C = {
  gold: '#f7c84b',
  gold2: '#ffe38a',
  teal: '#39e2d0',
  red: '#ff5365',
  navy: '#071526',
  navy2: '#102a42',
  cream: '#f6dfae',
  black: '#1c2732',
  wood: '#b87b35',
  white: '#ffffff'
};

/* =========================================================
   GAME STATE
   ========================================================= */

let mode = 'ai';
let players = [];
let turn = 0;

let coins = [];
let striker = null;

let dragging = false;
let dragPoint = null;

let shotActive = false;
let shotPocketed = 0;
let shotQueen = false;
let shotFoul = false;

let timer = 20;
let timerId = null;

let gameOver = false;

let particles = [];
let raf = 0;
let lastTime = 0;

let soundOn = true;
let audioCtx = null;

let stats = loadStats();

/* =========================================================
   STATS
   ========================================================= */

function loadStats() {
  try {
    const data = JSON.parse(
      localStorage.getItem('carromClashStats')
    );

    return data || {
      games: 0,
      wins: 0
    };
  } catch {
    return {
      games: 0,
      wins: 0
    };
  }
}

function saveStats() {
  try {
    localStorage.setItem(
      'carromClashStats',
      JSON.stringify(stats)
    );
  } catch {}
}

/* =========================================================
   AUDIO ENGINE
   No API / No external files
   ========================================================= */

function unlockAudio() {
  if (!soundOn) return;

  try {
    if (!audioCtx) {
      const AC =
        window.AudioContext ||
        window.webkitAudioContext;

      if (AC) {
        audioCtx = new AC();
      }
    }

    if (
      audioCtx &&
      audioCtx.state === 'suspended'
    ) {
      audioCtx.resume();
    }
  } catch {}
}

function tone(
  frequency = 440,
  duration = 0.07,
  type = 'sine',
  volume = 0.035
) {
  if (!soundOn) return;

  unlockAudio();

  if (!audioCtx) return;

  try {
    const oscillator =
      audioCtx.createOscillator();

    const gain =
      audioCtx.createGain();

    const now =
      audioCtx.currentTime;

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(
      frequency,
      now
    );

    gain.gain.setValueAtTime(
      0.0001,
      now
    );

    gain.gain.exponentialRampToValueAtTime(
      volume,
      now + 0.008
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration
    );

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);

    oscillator.start(now);
    oscillator.stop(
      now + duration + 0.025
    );
  } catch {}
}

const sfx = {

  click() {
    tone(
      620,
      0.045,
      'triangle',
      0.025
    );
  },

  striker() {
    tone(
      180,
      0.07,
      'square',
      0.025
    );
  },

  hit(power = 1) {
    tone(
      135 + Math.min(260, power * 24),
      0.055,
      'square',
      0.018
    );
  },

  rail() {
    tone(
      95,
      0.05,
      'triangle',
      0.018
    );
  },

  pocket() {
    tone(
      650,
      0.08,
      'sine',
      0.04
    );

    setTimeout(() => {
      tone(
        930,
        0.12,
        'sine',
        0.03
      );
    }, 55);
  },

  queen() {
    [520, 660, 820, 1040].forEach(
      (n, i) => {
        setTimeout(
          () =>
            tone(
              n,
              0.13,
              'triangle',
              0.045
            ),
          i * 75
        );
      }
    );
  },

  foul() {
    tone(
      145,
      0.13,
      'sawtooth',
      0.04
    );

    setTimeout(() => {
      tone(
        90,
        0.16,
        'sawtooth',
        0.03
      );
    }, 90);
  },

  win() {
    [523, 659, 784, 1047, 1319].forEach(
      (n, i) => {
        setTimeout(
          () =>
            tone(
              n,
              0.18,
              'triangle',
              0.05
            ),
          i * 90
        );
      }
    );
  }
};

/* =========================================================
   PLAYERS
   ========================================================= */

function makePlayer(name, color) {
  return {
    name,
    color,
    score: 0,
    fouls: 0,
    shots: 0,
    queen: 0,
    pocketed: 0
  };
}

function initPlayers() {

  if (mode === 'ai') {

    players = [
      makePlayer(
        'Player 1',
        C.gold
      ),

      makePlayer(
        'Computer',
        C.teal
      )
    ];

  } else if (mode === '2p') {

    players = [
      makePlayer(
        'Player 1',
        C.gold
      ),

      makePlayer(
        'Player 2',
        C.teal
      )
    ];

  } else if (mode === '3p') {

    players = [
      makePlayer(
        'Player 1',
        C.gold
      ),

      makePlayer(
        'Player 2',
        C.teal
      ),

      makePlayer(
        'Player 3',
        C.red
      )
    ];

  } else {

    players = [
      makePlayer(
        'Player 1',
        C.gold
      ),

      makePlayer(
        'Player 2',
        C.teal
      ),

      makePlayer(
        'Player 3',
        C.red
      ),

      makePlayer(
        'Player 4',
        '#b98cff'
      )
    ];
  }
}

function modeLabel() {

  if (mode === 'ai') {
    return 'VS COMPUTER';
  }

  if (mode === '2p') {
    return '2 PLAYER DUEL';
  }

  if (mode === '3p') {
    return '3 PLAYER CLASH';
  }

  return '4 PLAYER CLASH';
}

/* =========================================================
   STRIKER POSITION
   ========================================================= */

function sideForTurn() {
  return turn % players.length;
}

function strikerPosition() {

  const count =
    players.length;

  const side =
    sideForTurn();

  /*
    IMPORTANT:
    Striker is placed near the correct
    baseline for every multiplayer mode.
  */

  const edge =
    BOARD_R - 92;

  /* 1P / 2P */
  if (count === 2) {

    if (side === 0) {
      return [
        CX,
        CY + edge
      ];
    }

    return [
      CX,
      CY - edge
    ];
  }

  /* 3 players */
  if (count === 3) {

    if (side === 0) {
      return [
        CX,
        CY + edge
      ];
    }

    if (side === 1) {
      return [
        CX + edge,
        CY
      ];
    }

    return [
      CX - edge,
      CY
    ];
  }

  /* 4 players */

  if (side === 0) {
    return [
      CX,
      CY + edge
    ];
  }

  if (side === 1) {
    return [
      CX + edge,
      CY
    ];
  }

  if (side === 2) {
    return [
      CX,
      CY - edge
    ];
  }

  return [
    CX - edge,
    CY
  ];
}

function placeStriker() {

  const [
    x,
    y
  ] = strikerPosition();

  striker = {
    x,
    y,
    r: 18,
    vx: 0,
    vy: 0,
    pocketed: false
  };
}

/* =========================================================
   SETUP
   ========================================================= */

function setup() {

  stopLoop();

  clearInterval(timerId);

  particles = [];

  coins = [];

  shotActive = false;
  dragging = false;
  dragPoint = null;

  gameOver = false;

  shotPocketed = 0;
  shotQueen = false;
  shotFoul = false;

  createCoins();

  turn = 0;

  placeStriker();

  updateHud();

  setPower(0);

  feed(
    'Break ready · drag striker toward the target'
  );

  setTimer();

  draw();

  pulse(
    'READY',
    C.teal
  );
}

function createCoins() {

  coins.push({
    x: CX,
    y: CY,
    r: 12,
    color: C.red,
    type: 'queen',
    vx: 0,
    vy: 0,
    pocketed: false
  });

  /* Inner ring */

  const ring1 = 6;

  for (
    let i = 0;
    i < ring1;
    i++
  ) {

    const angle =
      Math.PI * 2 * i / ring1;

    coins.push({
      x:
        CX +
        Math.cos(angle) * 27,

      y:
        CY +
        Math.sin(angle) * 27,

      r: 11,

      color:
        i % 2
          ? C.cream
          : C.black,

      type: 'coin',

      vx: 0,
      vy: 0,

      pocketed: false
    });
  }

  /* Outer ring */

  const ring2 = 12;

  for (
    let i = 0;
    i < ring2;
    i++
  ) {

    const angle =
      Math.PI * 2 * i / ring2 +
      Math.PI / 12;

    coins.push({
      x:
        CX +
        Math.cos(angle) * 52,

      y:
        CY +
        Math.sin(angle) * 52,

      r: 11,

      color:
        i % 2
          ? C.cream
          : C.black,

      type: 'coin',

      vx: 0,
      vy: 0,

      pocketed: false
    });
  }
}

/* =========================================================
   START / RESET
   ========================================================= */

function start(selectedMode) {

  mode =
    selectedMode;

  unlockAudio();

  sfx.click();

  initPlayers();

  const home =
    $('#home');

  const game =
    $('#game');

  if (home) {
    home.classList.remove(
      'active'
    );
  }

  if (game) {
    game.classList.add(
      'active'
    );
  }

  setup();
}

function reset() {

  unlockAudio();

  sfx.click();

  setup();
}

/* =========================================================
   LOOP
   ========================================================= */

function startLoop() {

  if (raf) return;

  lastTime = 0;

  raf =
    requestAnimationFrame(
      gameLoop
    );
}

function stopLoop() {

  if (raf) {
    cancelAnimationFrame(
      raf
    );
  }

  raf = 0;

  lastTime = 0;
}

function gameLoop(time) {

  if (!raf) {
    return;
  }

  if (!lastTime) {
    lastTime = time;
  }

  const dt =
    Math.min(
      2.2,
      (time - lastTime) /
        16.67
    );

  lastTime = time;

  physics(dt);

  draw();

  if (
    shotActive ||
    moving() ||
    particles.length ||
    dragging
  ) {

    raf =
      requestAnimationFrame(
        gameLoop
      );

  } else {

    stopLoop();
  }
}

/* =========================================================
   GAME STATE
   ========================================================= */

function canPlay() {

  return (
    !gameOver &&
    !shotActive &&
    !(
      mode === 'ai' &&
      turn === 1
    )
  );
}

function moving() {

  if (
    striker &&
    !striker.pocketed &&
    Math.hypot(
      striker.vx,
      striker.vy
    ) > 0.045
  ) {
    return true;
  }

  return coins.some(
    coin =>
      !coin.pocketed &&
      Math.hypot(
        coin.vx,
        coin.vy
      ) > 0.045
  );
}

/* =========================================================
   TIMER
   ========================================================= */

function setTimer() {

  clearInterval(timerId);

  timer = 20;

  renderTimer();

  timerId =
    setInterval(
      () => {

        if (
          gameOver ||
          shotActive
        ) {
          return;
        }

        timer--;

        renderTimer();

        if (timer <= 0) {

          clearInterval(
            timerId
          );

          players[turn].fouls++;

          shotFoul = true;

          sfx.foul();

          feed(
            players[turn].name +
            ' timed out'
          );

          pulse(
            'TIME OUT',
            C.red
          );

          endTurn(false);
        }

      },
      1000
    );
}

function renderTimer() {

  const timerEl =
    $('#timer');

  if (timerEl) {
    timerEl.textContent =
      timer;
  }

  const bar =
    $('#timerBar');

  if (bar) {

    bar.style.width =
      `${timer * 5}%`;

    bar.classList.toggle(
      'danger',
      timer <= 5
    );
  }
}

/* =========================================================
   HUD
   ========================================================= */

function updateHud() {

  const player =
    players[turn] || {};

  const setText =
    (selector, value) => {

      const el =
        $(selector);

      if (el) {
        el.textContent =
          value;
      }
    };

  setText(
    '#turnName',
    player.name || ''
  );

  setText(
    '#status',
    mode === 'ai' &&
    turn === 1
      ? 'Computer is thinking…'
      : 'Aim and shoot'
  );

  const dot =
    $('#turnDot');

  if (dot) {

    const color =
      player.color ||
      C.gold;

    dot.style.background =
      color;

    dot.style.boxShadow =
      `0 0 18px ${color}`;
  }

  const p1 =
    players[0];

  const p2 =
    players[1];

  setText(
    '#p1Score',
    p1?.score || 0
  );

  setText(
    '#p2Score',
    p2?.score || 0
  );

  setText(
    '#p1Name',
    p1?.name || ''
  );

  setText(
    '#p2Name',
    p2?.name || ''
  );

  setText(
    '#p1Meta',
    p1
      ? `${p1.score} points · ${p1.fouls} fouls`
      : ''
  );

  setText(
    '#p2Meta',
    p2
      ? `${p2.score} points · ${p2.fouls} fouls`
      : ''
  );

  setText(
    '#p1Avatar',
    'P1'
  );

  setText(
    '#p2Avatar',
    p2?.name === 'Computer'
      ? 'AI'
      : 'P2'
  );
}

/* =========================================================
   UI FX
   ========================================================= */

function feed(text) {

  const list =
    $('#feedList');

  if (!list) return;

  const item =
    document.createElement(
      'div'
    );

  item.textContent =
    '› ' + text;

  list.prepend(item);

  while (
    list.children.length >
    8
  ) {
    list.lastChild.remove();
  }
}

function pulse(
  text,
  color = C.gold
) {

  const layer =
    $('#fxLayer');

  if (!layer) return;

  const el =
    document.createElement(
      'div'
    );

  el.className =
    'fx-text';

  el.textContent =
    text;

  el.style.color =
    color;

  layer.appendChild(el);

  setTimeout(
    () => el.remove(),
    900
  );
}

function toast(text) {

  const el =
    $('#toast');

  if (!el) return;

  el.textContent =
    text;

  el.classList.add(
    'show'
  );

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(
      () =>
        el.classList.remove(
          'show'
        ),
      1100
    );
}

/* =========================================================
   PARTICLES
   ========================================================= */

function burst(
  x,
  y,
  count = 16
) {

  for (
    let i = 0;
    i < count;
    i++
  ) {

    const angle =
      Math.random() *
      Math.PI *
      2;

    const velocity =
      1.2 +
      Math.random() * 4.5;

    particles.push({
      x,
      y,

      vx:
        Math.cos(angle) *
        velocity,

      vy:
        Math.sin(angle) *
        velocity,

      size:
        2 +
        Math.random() * 4,

      life: 1
    });
  }

  startLoop();
}

function confetti() {

  const colors = [
    C.gold,
    C.teal,
    C.red,
    '#b98cff'
  ];

  for (
    let i = 0;
    i < 100;
    i++
  ) {

    const angle =
      Math.random() *
      Math.PI *
      2;

    const velocity =
      2 +
      Math.random() * 7;

    particles.push({
      x: CX,
      y: CY,

      vx:
        Math.cos(angle) *
        velocity,

      vy:
        Math.sin(angle) *
        velocity,

      size:
        3 +
        Math.random() * 5,

      life:
        1.2,

      color:
        colors[
          i % colors.length
        ]
    });
  }

  startLoop();
}

/* =========================================================
   POINTER COORDINATES
   ========================================================= */

function pointer(e) {

  const rect =
    canvas.getBoundingClientRect();

  return {

    x:
      Math.max(
        0,
        Math.min(
          W,
          (e.clientX -
            rect.left) *
            W /
            rect.width
        )
      ),

    y:
      Math.max(
        0,
        Math.min(
          W,
          (e.clientY -
            rect.top) *
            W /
            rect.height
        )
      )
  };
}

/* =========================================================
   POWER
   ========================================================= */

function setPower(value) {

  const power =
    Math.max(
      0,
      Math.min(
        100,
        value
      )
    );

  const fill =
    $('#powerFill');

  if (fill) {
    fill.style.width =
      power + '%';
  }

  const valueEl =
    $('#powerValue');

  if (valueEl) {
    valueEl.textContent =
      Math.round(power) +
      '%';
  }
}

/* =========================================================
   SHOOT
   ========================================================= */

function shoot(target) {

  if (
    !striker ||
    striker.pocketed
  ) {
    return;
  }

  /*
    CENTER SNAP:
    If player is aiming close to the
    red queen / center, automatically
    lock target to exact center.
  */

  const distanceToCenter =
    Math.hypot(
      target.x - CX,
      target.y - CY
    );

  if (
    distanceToCenter <
    72
  ) {

    target = {
      x: CX,
      y: CY
    };

    pulse(
      'CENTER AIM',
      C.teal
    );
  }

  const dx =
    target.x -
    striker.x;

  const dy =
    target.y -
    striker.y;

  const distance =
    Math.hypot(
      dx,
      dy
    );

  if (
    distance <
    16
  ) {

    setPower(0);

    return;
  }

  /*
    Power is proportional to drag distance.
    Maximum speed is controlled for stable physics.
  */

  const power =
    Math.max(
      5.2,
      Math.min(
        18,
        distance / 13
      )
    );

  striker.vx =
    (dx / distance) *
    power;

  striker.vy =
    (dy / distance) *
    power;

  players[turn].shots++;

  shotActive = true;

  shotPocketed = 0;
  shotQueen = false;
  shotFoul = false;

  dragging = false;

  setPower(0);

  const status =
    $('#status');

  if (status) {
    status.textContent =
      players[turn].name +
      ' shot in progress';
  }

  feed(
    players[turn].name +
    ' fired · ' +
    Math.round(
      Math.min(
        100,
        distance / 4.5
      )
    ) +
    '% power'
  );

  sfx.striker();

  startLoop();
}

/* =========================================================
   POCKET DETECTION
   ========================================================= */

function pocketAt(
  x,
  y
) {

  return POCKETS.some(
    ([px, py]) =>
      Math.hypot(
        x - px,
        y - py
      ) <=
      POCKET_R
  );
}

/* =========================================================
   POCKET COIN
   ========================================================= */

function pocketCoin(
  coin
) {

  if (
    coin.pocketed
  ) {
    return;
  }

  coin.pocketed = true;

  coin.vx = 0;
  coin.vy = 0;

  if (
    coin.type === 'queen'
  ) {

    players[turn].score += 3;

    players[turn].queen++;

    shotQueen = true;

    sfx.queen();

    burst(
      coin.x,
      coin.y,
      34
    );

    pulse(
      'QUEEN +3',
      C.red
    );

    feed(
      players[turn].name +
      ' pocketed the Queen +3'
    );

  } else {

    players[turn].score++;

    players[turn].pocketed++;

    shotPocketed++;

    sfx.pocket();

    burst(
      coin.x,
      coin.y,
      18
    );

    pulse(
      '+1',
      C.gold
    );

    feed(
      players[turn].name +
      ' pocketed a coin +1'
    );
  }

  updateHud();
}

/* =========================================================
   OBJECT PHYSICS
   ========================================================= */

function updateObject(
  object,
  dt,
  isStriker = false
) {

  if (
    object.pocketed
  ) {
    return;
  }

  object.x +=
    object.vx * dt;

  object.y +=
    object.vy * dt;

  /*
    Friction
  */

  const friction =
    Math.pow(
      0.983,
      dt * 60
    );

  object.vx *= friction;
  object.vy *= friction;

  if (
    Math.hypot(
      object.vx,
      object.vy
    ) < 0.018
  ) {

    objectfunction updateObj(o,dt,isStriker=false){if(Math.hypot(o.vx,o.vy)<.001){o.vx=o.vy=0;return}o.x+=o.vx*dt;o.y+=o.vy*dt;const f=Math.pow(.983,dt*60);o.vx*=f;o.vy*=f;if(pocketAt(o.x,o.y)){o.pocketed=true;o.vx=o.vy=0;if(isStriker){sfx.foul();pulse('FOUL',COLORS.red)}else pocketCoin(o);return}const dx=o.x-CX,dy=o.y-CY,d=Math.hypot(dx,dy),limit=R-o.r;if(d>limit){const nx=dx/(d||1),ny=dy/(d||1),dot=o.vx*nx+o.vy*ny;o.vx-=2*dot*nx;o.vy-=2*dot*ny;o.x=CX+nx*limit;o.y=CY+ny*limit;o.vx*=.91;o.vy*=.91;sfx.rail()}}
function collide(a,b){if(!a||!b||a.pocketed||b.pocketed)return false;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r;if(d<=0||d>=min)return false;const nx=dx/d,ny=dy/d,over=min-d;a.x-=nx*over/2;a.y-=ny*over/2;b.x+=nx*over/2;b.y+=ny*over/2;const rel=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(rel<=0)return false;const impulse=rel*.96;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;sfx.hit(Math.min(10,rel));return true}
function physics(dt){if(striker&&!striker.pocketed)updateObj(striker,dt,true);for(const o of active())updateObj(o,dt,false);const all=striker&&!striker.pocketed?[striker,...active()]:active();for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)collide(all[i],all[j]);for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=.04;p.vx*=.985;p.life-=.022}particles=particles.filter(p=>p.life>0);if(shot&&!moving()){const scored=players[turn].pocketed>0;coins=coins.filter(o=>!o.pocketed);if(coins.filter(o=>o.type==='coin').length===0)finishGame();else finishTurn(scored)}}
function finishGame(){if(gameOver)return;gameOver=true;clearInterval(timerId);coins=coins.filter(o=>!o.pocketed);const winner=players.reduce((a,b)=>b.score>a.score?b:a,players[0]);stats.games++;if(mode==='ai'&&winner===players[0])stats.wins++;localStorage.setItem('carromClashStats',JSON.stringify(stats));sfx.win();burst(CX,CY,70);confetti();showWinner(winner)}
function showWinner(w){$('#modalBody').innerHTML=`<div class="winner-card"><div class="winner-kicker">MATCH COMPLETE · SEASON 01</div><h2>🏆 ${w.name.toUpperCase()} WINS!</h2><p class="winner-score">${w.score}<span> POINTS</span></p><div class="winner-stats"><span>${w.shots}<b>SHOTS</b></span><span>${w.fouls}<b>FOULS</b></span><span>${w.queen}<b>QUEEN</b></span></div><button class="winner-btn" id="rematchBtn">⚡ PLAY AGAIN</button></div>`;$('#modal').classList.remove('hidden');$('#rematchBtn').onclick=()=>{closeModal();reset()};pulse('VICTORY',COLORS.gold2)}
function draw(){ctx.clearRect(0,0,W,W);const bg=ctx.createRadialGradient(CX,CY,40,CX,CY,560);bg.addColorStop(0,'#152b40');bg.addColorStop(1,'#06111d');ctx.fillStyle=bg;ctx.fillRect(0,0,W,W);drawBoard();for(const o of coins)if(!o.pocketed)drawCoin(o);if(striker&&!striker.pocketed)drawStriker();for(const p of particles){ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=p.life>.5?COLORS.gold:COLORS.teal;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore()}}
function drawBoard(){ctx.save();ctx.translate(CX,CY);ctx.shadowColor='#000b';ctx.shadowBlur=38;const outer=ctx.createRadialGradient(-100,-110,60,0,0,430);outer.addColorStop(0,'#f7dca5');outer.addColorStop(.65,'#c68d4a');outer.addColorStop(1,'#744421');ctx.fillStyle=outer;ctx.beginPath();ctx.arc(0,0,415,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;const inner=ctx.createRadialGradient(-70,-80,40,0,0,380);inner.addColorStop(0,'#f8dda8');inner.addColorStop(1,'#e5bc72');ctx.fillStyle=inner;ctx.beginPath();ctx.arc(0,0,R+13,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#704626';ctx.lineWidth=8;ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#a56d37';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,92,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,43,0,Math.PI*2);ctx.stroke();for(const y of [-190,190]){ctx.beginPath();ctx.moveTo(-245,y);ctx.lineTo(245,y);ctx.stroke()}for(const x of [-190,190]){ctx.beginPath();ctx.moveTo(x,-245);ctx.lineTo(x,245);ctx.stroke()}ctx.restore();for(const [x,y] of POCKETS){const g=ctx.createRadialGradient(x-6,y-6,3,x,y,PR);g.addColorStop(0,'#000');g.addColorStop(.72,'#0b1016');g.addColorStop(1,'#5a331d');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,PR,0,Math.PI*2);ctx.fill()}}
function drawCoin(o){ctx.save();ctx.shadowColor='#0008';ctx.shadowBlur=8;const g=ctx.createRadialGradient(o.x-4,o.y-5,2,o.x,o.y,o.r);if(o.type==='queen'){g.addColorStop(0,'#ffb1b7');g.addColorStop(.4,COLORS.red);g.addColorStop(1,'#a72839')}else if(o.color===COLORS.black){g.addColorStop(0,'#4a535f');g.addColorStop(1,'#141a21')}else{g.addColorStop(0,'#fff6dc');g.addColorStop(1,'#d6c39b')}ctx.fillStyle=g;ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=o.type==='queen'?COLORS.gold2:'#88795e';ctx.lineWidth=2;ctx.stroke();if(o.type==='queen'){ctx.strokeStyle='#ffe7a0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(o.x,o.y,o.r*.47,0,Math.PI*2);ctx.stroke()}ctx.restore()}
function drawStriker(){const s=striker||{x:strikerPos()[0],y:strikerPos()[1],r:18};ctx.save();const g=ctx.createRadialGradient(s.x-5,s.y-6,2,s.x,s.y,21);g.addColorStop(0,'#fff6c9');g.addColorStop(.45,COLORS.gold);g.addColorStop(1,'#8e5b27');ctx.fillStyle=g;ctx.shadowColor=COLORS.gold;ctx.shadowBlur=drag?24:12;ctx.beginPath();ctx.arc(s.x,s.y,18,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#5d3c22';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle=COLORS.teal;ctx.lineWidth=3;ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(s.x,s.y,26+Math.sin(Date.now()/180)*3,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;if(drag){const dx=drag.x-s.x,dy=drag.y-s.y,len=Math.min(520,Math.hypot(dx,dy));const a=Math.atan2(dy,dx);ctx.strokeStyle='rgba(49,225,203,.95)';ctx.lineWidth=3;ctx.setLineDash([10,9]);ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+Math.cos(a)*len,s.y+Math.sin(a)*len);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(246,200,79,.22)';ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.arc(s.x,s.y,Math.min(170,len),a-.09,a+.09);ctx.closePath();ctx.fill();}ctx.restore()}
function setPower(v){const n=Math.max(0,Math.min(100,v));$('#powerFill').style.width=n+'%';$('#powerValue').textContent=Math.round(n)+'%'}
canvas.addEventListener('pointerdown',e=>{unlockAudio();if(!canPlay())return;const p=pointer(e),[sx,sy]=strikerPos();if(Math.hypot(p.x-sx,p.y-sy)<55){striker={x:sx,y:sy,r:18,vx:0,vy:0,color:COLORS.gold,pocketed:false};drag=p;canvas.setPointerCapture?.(e.pointerId);sfx.click();draw()}});
canvas.addEventListener('pointermove',e=>{if(!drag||!canPlay())return;drag=pointer(e);const[sx,sy]=strikerPos();const len=Math.hypot(drag.x-sx,drag.y-sy);setPower(Math.min(100,len/2.4));draw()});
canvas.addEventListener('pointerup',e=>{if(!drag)return;const p=pointer(e);shoot(p);drag=null;draw()});canvas.addEventListener('pointercancel',()=>{drag=null;setPower(0);draw()});
$('#soundBtn').onclick=()=>{sound=!sound;$('#soundBtn').textContent=sound?'🔊':'🔇';if(sound){unlockAudio();sfx.click()}else if(audio)audio.suspend()};
$('#helpBtn').onclick=()=>{unlockAudio();sfx.click();$('#modalBody').innerHTML='<h2>How to play</h2><p>Touch the glowing striker, drag <b>toward the target</b>, then release. The dotted guide is the exact shot direction.</p><ul><li>Longer drag = more power.</li><li>Pocket a coin to score +1.</li><li>Queen = +3.</li><li>Pocketing the striker is a foul.</li><li>20 seconds per turn.</li><li>In VS Computer, the AI aims automatically.</li></ul><p><b>Center tip:</b> place the striker on the bottom line and drag straight toward the red queen. This version uses intuitive forward aiming, so the shot travels in the same direction as your drag.</p>';$('#modal').classList.remove('hidden')};
$('#closeModal').onclick=closeModal;$('#modal').addEventListener('pointerdown',e=>{if(e.target===$('#modal'))closeModal()});function closeModal(){$('#modal').classList.add('hidden')}
$('#newBtn').onclick=reset;$('#homeBtn').onclick=()=>{clearInterval(timerId);stopLoop();closeModal();$('#game').classList.remove('active');$('#home').classList.add('active');sfx.click()};document.querySelectorAll('.mode-card').forEach(b=>b.addEventListener('click',()=>start(b.dataset.mode)));window.addEventListener('resize',draw);window.addEventListener('orientationchange',()=>setTimeout(draw,120));
initPlayers();placeStriker();draw();
