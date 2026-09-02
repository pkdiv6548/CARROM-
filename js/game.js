'use strict';

/* =========================================================
   CARROM CLASH
   COMPLETE MOBILE-FIRST GAME ENGINE
   No libraries / no build step / GitHub Pages ready
   ========================================================= */

(() => {
  /* =======================================================
     DOM HELPERS
     ======================================================= */

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const canvas = $('#board');
  const ctx = canvas ? canvas.getContext('2d') : null;

  if (!canvas || !ctx) {
    console.error('CARROM CLASH: #board canvas not found.');
    return;
  }

  /* =======================================================
     CONSTANTS
     ======================================================= */

  const W = 900;
  const H = 900;

  const CX = 450;
  const CY = 450;

  const BOARD_R = 365;

  /*
    Physical playing area is deliberately wider than the
    visual inner square so coins can actually enter pockets.
  */
  const PLAY_MIN = 67;
  const PLAY_MAX = 833;

  const POCKET_R = 34;

  const POCKETS = [
    { x: 54, y: 54 },
    { x: 846, y: 54 },
    { x: 54, y: 846 },
    { x: 846, y: 846 }
  ];

  const COIN_R = 14;
  const STRIKER_R = 18;

  const FRICTION = 0.985;
  const MIN_SPEED = 0.055;

  const MAX_SHOT_POWER = 23;

  const TURN_SECONDS = 20;

  const C = {
    gold: '#f7c84b',
    gold2: '#ffe38a',
    teal: '#39e2d0',
    red: '#ff5365',
    purple: '#b98cff',
    navy: '#071526',
    navy2: '#0c1d2f',
    cream: '#f6dfae',
    wood: '#b87b35',
    black: '#1c2732',
    white: '#fff8e7'
  };

  /* =======================================================
     GAME STATE
     ======================================================= */

  let mode = 'ai';

  let players = [];

  let turn = 0;

  let coins = [];

  let striker = null;

  let dragging = false;
  let dragPoint = null;

  let shotActive = false;

  let gameOver = false;

  let timer = TURN_SECONDS;
  let timerId = null;

  let raf = 0;
  let lastTime = 0;

  let particles = [];

  let shotPocketed = 0;
  let shotQueen = false;
  let shotFoul = false;
  let shotStarted = false;

  let soundOn = true;
  let audioCtx = null;

  let aiTimer = null;

  let stats = loadStats();

  /* =======================================================
     STORAGE
     ======================================================= */

  function loadStats() {
    try {
      const raw = localStorage.getItem('carromClashStats');

      if (!raw) {
        return {
          games: 0,
          wins: 0
        };
      }

      const data = JSON.parse(raw);

      return {
        games: Number(data.games) || 0,
        wins: Number(data.wins) || 0
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

  /* =======================================================
     AUDIO
     ======================================================= */

  function unlockAudio() {
    if (!soundOn) return;

    try {
      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContext) return;

      if (!audioCtx) {
        audioCtx = new AudioContext();
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch {}
  }

  function tone(
    frequency = 440,
    duration = 0.07,
    type = 'sine',
    volume = 0.03
  ) {
    if (!soundOn) return;

    unlockAudio();

    if (!audioCtx) return;

    try {
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      const now = audioCtx.currentTime;

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
        Math.max(0.0002, volume),
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
        now + duration + 0.03
      );
    } catch {}
  }

  const sfx = {
    click() {
      tone(620, 0.045, 'triangle', 0.025);
    },

    hit(power = 1) {
      tone(
        145 + Math.min(250, power * 24),
        0.06,
        'square',
        0.018
      );
    },

    rail() {
      tone(90, 0.045, 'sine', 0.012);
    },

    pocket() {
      tone(680, 0.08, 'sine', 0.04);

      setTimeout(() => {
        tone(980, 0.12, 'sine', 0.03);
      }, 55);
    },

    queen() {
      [520, 660, 820, 1040].forEach(
        (frequency, index) => {
          setTimeout(() => {
            tone(
              frequency,
              0.12,
              'triangle',
              0.04
            );
          }, index * 70);
        }
      );
    },

    foul() {
      tone(
        150,
        0.14,
        'sawtooth',
        0.035
      );

      setTimeout(() => {
        tone(
          95,
          0.16,
          'sawtooth',
          0.025
        );
      }, 90);
    },

    win() {
      [523, 659, 784, 1047, 1319].forEach(
        (frequency, index) => {
          setTimeout(() => {
            tone(
              frequency,
              0.18,
              'triangle',
              0.045
            );
          }, index * 90);
        }
      );
    }
  };

  /* =======================================================
     PLAYERS
     ======================================================= */

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
        makePlayer('Player 1', C.gold),
        makePlayer('Computer', C.teal)
      ];
      return;
    }

    if (mode === '2p') {
      players = [
        makePlayer('Player 1', C.gold),
        makePlayer('Player 2', C.teal)
      ];
      return;
    }

    if (mode === '3p') {
      players = [
        makePlayer('Player 1', C.gold),
        makePlayer('Player 2', C.teal),
        makePlayer('Player 3', C.red)
      ];
      return;
    }

    players = [
      makePlayer('Player 1', C.gold),
      makePlayer('Player 2', C.teal),
      makePlayer('Player 3', C.red),
      makePlayer('Player 4', C.purple)
    ];
  }

  function currentPlayer() {
    return players[turn] || players[0];
  }

  function modeLabel() {
    if (mode === 'ai') return 'VS COMPUTER';
    if (mode === '2p') return '2 PLAYER DUEL';
    if (mode === '3p') return '3 PLAYER CLASH';
    return '4 PLAYER CLASH';
  }

  /* =======================================================
     BOARD GEOMETRY
     ======================================================= */

  function edgeLine() {
    return BOARD_R - 92;
  }

  function strikerPos() {
    const count = players.length;
    const side = turn % Math.max(1, count);
    const edge = edgeLine();

    if (count <= 2) {
      if (side === 0) {
        return {
          x: CX,
          y: CY + edge
        };
      }

      return {
        x: CX,
        y: CY - edge
      };
    }

    if (count === 3) {
      if (side === 0) {
        return {
          x: CX,
          y: CY + edge
        };
      }

      if (side === 1) {
        return {
          x: CX + edge,
          y: CY
        };
      }

      return {
        x: CX - edge,
        y: CY
      };
    }

    if (side === 0) {
      return {
        x: CX,
        y: CY + edge
      };
    }

    if (side === 1) {
      return {
        x: CX + edge,
        y: CY
      };
    }

    if (side === 2) {
      return {
        x: CX,
        y: CY - edge
      };
    }

    return {
      x: CX - edge,
      y: CY
    };
  }

  function placeStriker() {
    const pos = strikerPos();

    striker = {
      x: pos.x,
      y: pos.y,
      r: STRIKER_R,
      vx: 0,
      vy: 0,
      pocketed: false
    };
  }

  /* =======================================================
     COINS
     ======================================================= */

  function createCoin(
    x,
    y,
    type = 'black'
  ) {
    return {
      x,
      y,
      r: COIN_R,
      vx: 0,
      vy: 0,
      type,
      pocketed: false
    };
  }

  function createRack() {
    coins = [];

    const spacing = 29;

    /*
      Center queen
    */
    coins.push(
      createCoin(
        CX,
        CY,
        'queen'
      )
    );

    /*
      6 around queen
    */
    const ring1 = 6;

    for (let i = 0; i < ring1; i++) {
      const angle =
        (Math.PI * 2 * i) /
        ring1;

      coins.push(
        createCoin(
          CX +
            Math.cos(angle) *
              spacing,
          CY +
            Math.sin(angle) *
              spacing,
          i % 2 === 0
            ? 'white'
            : 'black'
        )
      );
    }

    /*
      Outer ring
    */
    const ring2 = 12;

    for (let i = 0; i < ring2; i++) {
      const angle =
        (Math.PI * 2 * i) /
          ring2 +
        Math.PI / ring2;

      coins.push(
        createCoin(
          CX +
            Math.cos(angle) *
              spacing *
              2,
          CY +
            Math.sin(angle) *
              spacing *
              2,
          i % 2 === 0
            ? 'black'
            : 'white'
        )
      );
    }
  }

  /* =======================================================
     GAME RESET / START
     ======================================================= */

  function setup() {
    stopLoop();

    clearInterval(timerId);

    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }

    particles = [];

    shotActive = false;
    dragging = false;
    dragPoint = null;

    gameOver = false;

    shotPocketed = 0;
    shotQueen = false;
    shotFoul = false;
    shotStarted = false;

    turn = 0;

    initPlayers();

    createRack();

    placeStriker();

    updateHUD();

    resetTimer();

    render();

    requestLoop();

    setStatus(
      'Aim and shoot'
    );

    addFeed(
      `${modeLabel()} started`
    );
  }

  function startGame(selectedMode) {
    const normalized =
      String(selectedMode || 'ai')
        .trim()
        .toLowerCase();

    if (
      normalized !== 'ai' &&
      normalized !== '2p' &&
      normalized !== '3p' &&
      normalized !== '4p'
    ) {
      mode = 'ai';
    } else {
      mode = normalized;
    }

    unlockAudio();

    sfx.click();

    const home = $('#home');
    const game = $('#game');

    if (home) {
      home.classList.remove('active');
    }

    if (game) {
      game.classList.add('active');

      /*
        Force browser reflow so mobile CSS transition
        cannot leave the game screen invisible.
      */
      void game.offsetWidth;
    }

    setup();

    setTimeout(() => {
      render();
      requestLoop();
    }, 20);
  }

  function resetGame() {
    unlockAudio();
    sfx.click();

    setup();
  }

  /* =======================================================
     HUD
     ======================================================= */

  function setText(selector, value) {
    const el = $(selector);

    if (el) {
      el.textContent = value;
    }
  }

  function setStatus(text) {
    setText(
      '#status',
      text
    );
  }

  function updateHUD() {
    const p = currentPlayer();

    if (!p) return;

    setText(
      '#turnName',
      p.name
    );

    setText(
      '#p1Score',
      players[0]
        ? players[0].score
        : 0
    );

    setText(
      '#p2Score',
      players[1]
        ? players[1].score
        : 0
    );

    setText(
      '#p1Name',
      players[0]
        ? players[0].name
        : 'Player 1'
    );

    setText(
      '#p2Name',
      players[1]
        ? players[1].name
        : 'Player 2'
    );

    setText(
      '#p1Meta',
      players[0]
        ? `${players[0].score} points · ${players[0].fouls} fouls`
        : '0 points · 0 fouls'
    );

    setText(
      '#p2Meta',
      players[1]
        ? `${players[1].score} points · ${players[1].fouls} fouls`
        : '0 points · 0 fouls'
    );

    setText(
      '#p1Avatar',
      players[0]
        ? 'P1'
        : 'P1'
    );

    setText(
      '#p2Avatar',
      mode === 'ai'
        ? 'AI'
        : 'P2'
    );

    const dot = $('#turnDot');

    if (dot) {
      dot.style.background =
        p.color;
      dot.style.boxShadow =
        `0 0 18px ${p.color}`;
    }
  }

  function updatePower(power) {
    const value =
      Math.round(
        Math.max(
          0,
          Math.min(1, power)
        ) * 100
      );

    setText(
      '#powerValue',
      `${value}%`
    );

    const fill =
      $('#powerFill');

    if (fill) {
      fill.style.width =
        `${value}%`;
    }
  }

  /* =======================================================
     FEED / TOAST
     ======================================================= */

  function addFeed(text) {
    const list =
      $('#feedList');

    if (!list) return;

    const item =
      document.createElement('div');

    item.className =
      'feed-item';

    item.textContent =
      text;

    list.prepend(item);

    while (
      list.children.length > 6
    ) {
      list.lastElementChild.remove();
    }
  }

  function toast(message) {
    const el =
      $('#toast');

    if (!el) return;

    el.textContent =
      message;

    el.classList.add('show');

    clearTimeout(
      toast.timer
    );

    toast.timer =
      setTimeout(() => {
        el.classList.remove(
          'show'
        );
      }, 1800);
  }

  /* =======================================================
     TIMER
     ======================================================= */

  function resetTimer() {
    clearInterval(timerId);

    timer =
      TURN_SECONDS;

    updateTimerUI();

    timerId =
      setInterval(() => {
        if (
          gameOver ||
          shotActive
        ) {
          return;
        }

        timer--;

        updateTimerUI();

        if (timer <= 0) {
          clearInterval(
            timerId
          );

          timeoutTurn();
        }
      }, 1000);
  }

  function updateTimerUI() {
    setText(
      '#timer',
      Math.max(
        0,
        timer
      )
    );

    const bar =
      $('#timerBar');

    if (bar) {
      const percent =
        Math.max(
          0,
          Math.min(
            100,
            (timer /
              TURN_SECONDS) *
              100
          )
        );

      bar.style.width =
        `${percent}%`;
    }
  }

  function timeoutTurn() {
    if (
      gameOver ||
      shotActive
    ) {
      return;
    }

    shotFoul = true;

    const p =
      currentPlayer();

    if (p) {
      p.fouls++;
    }

    addFeed(
      `${p.name} timed out`
    );

    sfx.foul();

    endTurn(false);
  }

  /* =======================================================
     CAN PLAY
     ======================================================= */

  function canPlay() {
    if (gameOver) return false;

    if (shotActive) return false;

    if (
      mode === 'ai' &&
      turn === 1
    ) {
      return false;
    }

    return true;
  }

  /* =======================================================
     CANVAS COORDINATES
     ======================================================= */

  function pointerToBoard(event) {
    const rect =
      canvas.getBoundingClientRect();

    let clientX;
    let clientY;

    if (
      event.touches &&
      event.touches.length
    ) {
      clientX =
        event.touches[0].clientX;

      clientY =
        event.touches[0].clientY;
    } else if (
      event.changedTouches &&
      event.changedTouches.length
    ) {
      clientX =
        event.changedTouches[0].clientX;

      clientY =
        event.changedTouches[0].clientY;
    } else {
      clientX =
        event.clientX;

      clientY =
        event.clientY;
    }

    return {
      x:
        (clientX -
          rect.left) *
        (W / rect.width),

      y:
        (clientY -
          rect.top) *
        (H / rect.height)
    };
  }

  /* =======================================================
     STRIKER DRAG
     ======================================================= */

  function strikerHit(point) {
    if (!striker) return false;

    return distance(
      point.x,
      point.y,
      striker.x,
      striker.y
    ) <=
      striker.r + 22;
  }

  function startDrag(event) {
    if (!canPlay()) return;

    unlockAudio();

    const point =
      pointerToBoard(event);

    if (
      strikerHit(point)
    ) {
      event.preventDefault();

      dragging = true;

      dragPoint = {
        x: point.x,
        y: point.y
      };

      updatePowerFromDrag();

      requestLoop();
    }
  }

  function moveDrag(event) {
    if (!dragging) return;

    event.preventDefault();

    dragPoint =
      pointerToBoard(event);

    updatePowerFromDrag();

    requestLoop();
  }

  function endDrag(event) {
    if (!dragging) return;

    event.preventDefault();

    if (
      event.changedTouches &&
      event.changedTouches.length
    ) {
      dragPoint =
        pointerToBoard(event);
    }

    const point =
      dragPoint || striker;

    dragging = false;

    const powerData =
      calculateShot(
        point
      );

    dragPoint = null;

    updatePower(
      powerData.power
    );

    if (
      powerData.power <
      0.04
    ) {
      updatePower(0);
      render();
      return;
    }

    shoot(
      powerData.dx,
      powerData.dy,
      powerData.power
    );
  }

  function updatePowerFromDrag() {
    if (
      !striker ||
      !dragPoint
    ) {
      updatePower(0);
      return;
    }

    const data =
      calculateShot(
        dragPoint
      );

    updatePower(
      data.power
    );
  }

  function calculateShot(target) {
    const dx =
      target.x -
      striker.x;

    const dy =
      target.y -
      striker.y;

    const dist =
      Math.sqrt(
        dx * dx +
        dy * dy
      );

    const normalized =
      Math.max(
        0,
        Math.min(
          1,
          dist / 280
        )
      );

    return {
      dx,
      dy,
      distance: dist,
      power: normalized
    };
  }

  /* =======================================================
     SHOOT
     ======================================================= */

  function shoot(
    dx,
    dy,
    power
  ) {
    if (
      !striker ||
      gameOver ||
      shotActive
    ) {
      return;
    }

    const length =
      Math.sqrt(
        dx * dx +
        dy * dy
      );

    if (
      length <
      0.001
    ) {
      return;
    }

    /*
      Drag from striker toward target.
      Velocity therefore follows the drag direction.
    */
    const nx =
      dx / length;

    const ny =
      dy / length;

    striker.vx =
      nx *
      MAX_SHOT_POWER *
      power;

    striker.vy =
      ny *
      MAX_SHOT_POWER *
      power;

    shotActive = true;
    shotStarted = true;

    shotPocketed = 0;
    shotQueen = false;
    shotFoul = false;

    currentPlayer().shots++;

    clearInterval(timerId);

    setStatus(
      'Shot in play…'
    );

    addFeed(
      `${currentPlayer().name} shoots`
    );

    sfx.hit(
      power * 10
    );

    requestLoop();
  }

  /* =======================================================
     AI
     ======================================================= */

  function aiShot() {
    if (
      gameOver ||
      mode !== 'ai' ||
      turn !== 1 ||
      shotActive
    ) {
const POCKET_R = 34;

/* ---------------------------------------------------------
   COLORS
--------------------------------------------------------- */

const C = {
  gold: '#f7c84b',
  gold2: '#ffe38a',
  teal: '#39e2d0',
  red: '#ff5365',
  purple: '#b98cff',
  navy: '#071526',
  navy2: '#0c1d2f',
  cream: '#f6dfae',
  wood: '#b87b35',
  black: '#1c2732',
  white: '#fff8e7'
};

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */

let mode = 'ai';
let players = [];
let turn = 0;

let coins = [];
let striker = null;

let dragging = false;
let dragPoint = null;

let shotActive = false;
let timer = 20;
let timerId = null;

let gameOver = false;

let particles = [];
let raf = 0;
let lastTime = 0;

let soundOn = true;
let audioCtx = null;

let shotPocketed = 0;
let shotQueen = false;
let shotFoul = false;

let stats = loadStats();

/* ---------------------------------------------------------
   STORAGE
--------------------------------------------------------- */

function loadStats() {
  try {
    const raw = localStorage.getItem('carromClashStats');

    if (!raw) {
      return {
        games: 0,
        wins: 0
      };
    }

    const parsed = JSON.parse(raw);

    return {
      games: Number(parsed.games) || 0,
      wins: Number(parsed.wins) || 0
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

/* ---------------------------------------------------------
   AUDIO
--------------------------------------------------------- */

function unlockAudio() {
  if (!soundOn) return;

  try {
    if (!audioCtx) {
      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }

    if (
      audioCtx &&
      audioCtx.state === 'suspended'
    ) {
      audioCtx.resume().catch(() => {});
    }
  } catch {}
}

function tone(
  freq = 440,
  duration = 0.07,
  type = 'sine',
  gainValue = 0.035
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
      freq,
      now
    );

    gain.gain.setValueAtTime(
      0.0001,
      now
    );

    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gainValue),
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

  hit(power = 1) {
    tone(
      145 + Math.min(240, power * 25),
      0.06,
      'square',
      0.018
    );
  },

  rail() {
    tone(
      90,
      0.045,
      'sine',
      0.012
    );
  },

  pocket() {
    tone(
      680,
      0.08,
      'sine',
      0.04
    );

    setTimeout(() => {
      tone(
        980,
        0.12,
        'sine',
        0.03
      );
    }, 55);
  },

  queen() {
    [520, 660, 820, 1040].forEach(
      (frequency, index) => {
        setTimeout(() => {
          tone(
            frequency,
            0.12,
            'triangle',
            0.04
          );
        }, index * 75);
      }
    );
  },

  foul() {
    tone(
      150,
      0.14,
      'sawtooth',
      0.04
    );

    setTimeout(() => {
      tone(
        95,
        0.16,
        'sawtooth',
        0.03
      );
    }, 90);
  },

  win() {
    [523, 659, 784, 1047, 1319].forEach(
      (frequency, index) => {
        setTimeout(() => {
          tone(
            frequency,
            0.18,
            'triangle',
            0.05
          );
        }, index * 90);
      }
    );
  }
};

/* ---------------------------------------------------------
   PLAYER
--------------------------------------------------------- */

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
        C.purple
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

/* ---------------------------------------------------------
   BOARD GEOMETRY
--------------------------------------------------------- */

function edgeLine() {
  return BOARD_R - 92;
}

function sideForTurn() {
  if (!players.length) return 0;

  return turn % players.length;
}

function strikerPos() {

  const count = players.length;
  const side = sideForTurn();
  const edge = edgeLine();

  if (count <= 2) {

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
  ] = strikerPos();

  striker = {
    x,
    y,
    r: 18,
    vx: 0,
    vy: 0,
    pocketed: false
  };
}

/* ---------------------------------------------------------
   GAME START / RESET
--------------------------------------------------------- */

function canPlay() {

  if (gameOver) {
    return false;
  }

  if (shotActive) {
    return false;
  }

  if (
    mode === 'ai' &&
    turn === 1
  ) {
    return false;
  }

  return true;
}

function setup() {

  stopLoop();

  clearInterval(timerId);

  particles = [];

  shotActive = false;

  dragging = false;

  dragPoint = null;

  gameOver = false;

  shotPocketed = 0;

  shotQueen = false;

  shotFoul = false;

  coins = [];

  /* QUEEN */

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

  /* INNER RING */

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

  /* OUTER RING */

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

  turn = 0;

  placeStriker();

  updateHud();

  setPower(0);

  feed(
    'Break ready · drag striker toward a target'
  );

  setTimer();

  draw();

  pulse(
    'READY',
    C.teal
  );

  /* Start rendering only when needed */
  draw();
}

function start(selectedMode) {

  unlockAudio();

  sfx.click();

  const normalized =
    String(selectedMode || '')
      .toLowerCase()
      .trim();

  if (
    normalized === 'ai' ||
    normalized === 'computer' ||
    normalized === 'vs-computer' ||
    normalized === 'vscomputer'
  ) {

    mode = 'ai';

  } else if (
    normalized === '2p' ||
    normalized === '2player' ||
    normalized === '2-player' ||
    normalized === 'two-player'
  ) {

    mode = '2p';

  } else if (
    normalized === '3p' ||
    normalized === '3player' ||
    normalized === '3-player' ||
    normalized === 'three-player'
  ) {

    mode = '3p';

  } else if (
    normalized === '4p' ||
    normalized === '4player' ||
    normalized === '4-player' ||
    normalized === 'four-player'
  ) {

    mode = '4p';

  } else {

    mode = 'ai';
  }

  initPlayers();

  const home =
    $('#home');

  const game =
    $('#game');

  if (home) {
    home.classList.remove('active');
  }

  if (game) {
    game.classList.add('active');
  }

  /*
    Force layout calculation.
    This helps mobile browsers when switching
    display:none -> display:block.
  */

  if (game) {
    void game.offsetHeight;
  }

  setup();

  requestAnimationFrame(() => {
    draw();
  });
}

function reset() {

  unlockAudio();

  sfx.click();

  initPlayers();

  setup();
}

/* ---------------------------------------------------------
   ANIMATION LOOP
--------------------------------------------------------- */

function startLoop() {

  if (raf) {
    return;
  }

  lastTime = 0;

  raf =
    requestAnimationFrame(loop);
}

function stopLoop() {

  if (raf) {
    cancelAnimationFrame(raf);
  }

  raf = 0;

  lastTime = 0;
}

function loop(timestamp) {

  if (!raf) {
    return;
  }

  if (!lastTime) {
    lastTime = timestamp;
  }

  const dt =
    Math.min(
      2.2,
      (timestamp - lastTime) / 16.67
    );

  lastTime = timestamp;

  physics(dt);

  draw();

  if (
    shotActive ||
    moving() ||
    particles.length ||
    dragging
  ) {

    raf =
      requestAnimationFrame(loop);

  } else {

    stopLoop();
  }
}

function moving() {

  const strikerMoving =
    striker &&
    !striker.pocketed &&
    Math.hypot(
      striker.vx,
      striker.vy
    ) > 0.055;

  const coinMoving =
    coins.some(
      (coin) =>
        !coin.pocketed &&
        Math.hypot(
          coin.vx,
          coin.vy
        ) > 0.055
    );

  return (
    strikerMoving ||
    coinMoving
  );
}

/* ---------------------------------------------------------
   TIMER
--------------------------------------------------------- */

function setTimer() {

  clearInterval(timerId);

  timer = 20;

  renderTimer();

  timerId =
    setInterval(() => {

      if (
        gameOver ||
        shotActive
      ) {
        return;
      }

      timer--;

      renderTimer();

      if (timer <= 0) {

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

    }, 1000);
}

function renderTimer() {

  const timerElement =
    $('#timer');

  if (timerElement) {
    timerElement.textContent =
      timer;
  }

  const timerBar =
    $('#timerBar');

  if (timerBar) {

    timerBar.style.width =
      `${timer * 5}%`;

    timerBar.classList.toggle(
      'danger',
      timer <= 5
    );
  }
}

/* ---------------------------------------------------------
   HUD
--------------------------------------------------------- */

function setText(
  selector,
  value
) {

  const element =
    $(selector);

  if (element) {
    element.textContent =
      value;
  }
}

function updateHud() {

  const current =
    players[turn] || {};

  setText(
    '#turnName',
    current.name || ''
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
      current.color ||
      C.gold;

    dot.style.background =
      color;

    dot.style.boxShadow =
      `0 0 18px ${color}`;
  }

  setText(
    '#p1Score',
    players[0]?.score || 0
  );

  setText(
    '#p2Score',
    players[1]?.score || 0
  );

  setText(
    '#p1Name',
    players[0]?.name || ''
  );

  setText(
    '#p2Name',
    players[1]?.name || ''
  );

  setText(
    '#p1Meta',
    players[0]
      ? `${players[0].score} points · ${players[0].fouls} fouls`
      : ''
  );

  setText(
    '#p2Meta',
    players[1]
      ? `${players[1].score} points · ${players[1].fouls} fouls`
      : ''
  );

  setText(
    '#p1Avatar',
    'P1'
  );

  setText(
    '#p2Avatar',
    players[1]?.name === 'Computer'
      ? 'AI'
      : 'P2'
  );

  /* Optional 3P / 4P HUD support */

  setText(
    '#p3Score',
    players[2]?.score || 0
  );

  setText(
    '#p4Score',
    players[3]?.score || 0
  );

  setText(
    '#p3Name',
    players[2]?.name || ''
  );

  setText(
    '#p4Name',
    players[3]?.name || ''
  );
}

/* ---------------------------------------------------------
   EVENT FEED
--------------------------------------------------------- */

function feed(text) {

  const list =
    $('#feedList');

  if (!list) {
    return;
  }

  const item =
    document.createElement('div');

  item.textContent =
    '› ' + text;

  list.prepend(item);

  while (
    list.children.length > 8
  ) {

    list.lastElementChild.remove();
  }
}

/* ---------------------------------------------------------
   FX
--------------------------------------------------------- */

function pulse(
  text,
  color = C.gold
) {

  const layer =
    $('#fxLayer');

  if (!layer) {
    return;
  }

  const element =
    document.createElement('div');

  element.className =
    'fx-text';

  element.textContent =
    text;

  element.style.color =
    color;

  layer.appendChild(element);

  setTimeout(() => {
    element.remove();
  }, 900);
}

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
      1 +
      Math.random() * 4;

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

  for (
    let i = 0;
    i < 120;
    i++
  ) {

    const angle =
      Math.random() *
      Math.PI *
      2;

    const velocity =
      2 +
      Math.random() * 6;

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

      life: 1.25
    });
  }

  startLoop();
}

/* ---------------------------------------------------------
   POINTER COORDINATES
--------------------------------------------------------- */

function pointer(event) {

  if (!canvas) {
    return {
      x: CX,
      y: CY
    };
  }

  const rect =
    canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {

    return {
      x: CX,
      y: CY
    };
  }

  const x =
    (
      event.clientX -
      rect.left
    ) *
    W /
    rect.width;

  const y =
    (
      event.clientY -
      rect.top
    ) *
    W /
    rect.height;

  return {
    x:
      Math.max(
        0,
        Math.min(W, x)
      ),

    y:
      Math.max(
        0,
        Math.min(W, y)
      )
  };
}

/* ---------------------------------------------------------
   POWER
--------------------------------------------------------- */

function setPower(value) {

  const power =
    Math.max(
      0,
      Math.min(100, value)
    );

  const fill =
    $('#powerFill');

  if (fill) {
    fill.style.width =
      power + '%';
  }

  const valueElement =
    $('#powerValue');

  if (valueElement) {
    valueElement.textContent =
      Math.round(power) + '%';
  }
}

/* ---------------------------------------------------------
   SHOOT
--------------------------------------------------------- */

function shoot(target) {

  if (
    !striker ||
    striker.pocketed ||
    !canPlay()
  ) {
    return;
  }

  /*
    Center assistance:
    if player aims near center,
    lock the shot to the exact center.
  */

  const distanceToCenter =
    Math.hypot(
      target.x - CX,
      target.y - CY
    );

  if (
    distanceToCenter < 62
  ) {

    target = {
      x: CX,
      y: CY
    };
  }

  const dx =
    target.x -
    striker.x;

  const dy =
    target.y -
    striker.y;

  const length =
    Math.hypot(dx, dy);

  if (length < 18) {

    setPower(0);

    return;
  }

  /*
    Mobile-friendly power.
  */

  const power =
    Math.max(
      5.2,
      Math.min(
        18,
        length / 12.5
      )
    );

  striker.vx =
    dx / length *
    power;

  striker.vy =
    dy / length *
    power;

  players[turn].shots++;

  shotActive = true;

  shotPocketed = 0;

  shotQueen = false;

  shotFoul = false;

  dragging = false;

  dragPoint = null;

  setPower(0);

  setText(
    '#status',
    players[turn].name +
    ' shot in progress'
  );

  feed(
    players[turn].name +
    ' fired · ' +
    Math.round(
      Math.min(
        100,
        length / 4.5
      )
    ) +
    '% power'
  );

  sfx.hit(power);

  startLoop();
}

/* ---------------------------------------------------------
   POCKET
--------------------------------------------------------- */

function pocketAt(
  x,
  y
) {

  return POCKETS.some(
    ([px, py]) =>
      Math.hypot(
        x - px,
        y - py
      ) <
      POCKET_R
  );
}

function pocketCoin(coin) {

  if (
    !coin ||
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

/* ---------------------------------------------------------
   PHYSICS
--------------------------------------------------------- */

function updateObject(
  object,
  dt,
  isStriker = false
) {

  if (
    !object ||
    object.pocketed
  ) {
    return;
  }

  object.x +=
    object.vx *
    dt;

  object.y +=
    object.vy *
    dt;

  const friction =
    Math.pow(
      0.983,
      dt * 60
    );

  object.vx *=
    friction;

  object.vy *=
    friction;

  if (
    Math.hypot(
      object.vx,
      object.vy
    ) < 0.018
  ) {

    object.vx = 0;

    object.vy = 0;
  }

  /*
    Pocket detection.
  */

  if (
    pocketAt(
      object.x,
      object.y
    )
  ) {

    if (isStriker) {

      object.pocketed = true;

      object.vx = 0;

      object.vy = 0;

      players[turn].fouls++;

      shotFoul = true;

      sfx.foul();

      pulse(
        'FOUL',
        C.red
      );

      feed(
        players[turn].name +
        ' pocketed the striker'
      );

    } else {

      pocketCoin(object);
    }

    return;
  }

  /*
    Circular board collision.
  */

  const dx =
    object.x -
    CX;

  const dy =
    object.y -
    CY;

  const distance =
    Math.hypot(
      dx,
      dy
    );

  const limit =
    BOARD_R -
    object.r;

  if (
    distance >
    limit
  ) {

    const nx =
      dx /
      (distance || 1);

    const ny =
      dy /
      (distance || 1);

    object.x =
      CX +
      nx *
      limit;

    object.y =
      CY +
      ny *
      limit;

    const velocityAlongNormal =
      object.vx * nx +
      object.vy * ny;

    object.vx -=
      2 *
      velocityAlongNormal *
      nx;

    object.vy -=
      2 *
      velocityAlongNormal *
      ny;

    object.vx *= 0.92;

    object.vy *= 0.92;

    sfx.rail();
  }
}

/* ---------------------------------------------------------
   COIN COLLISION
--------------------------------------------------------- */

function collide(
  a,
  b
) {

  if (
    !a ||
    !b ||
    a.pocketed ||
    b.pocketed
  ) {
    return false;
  }

  const dx =
    b.x -
    a.x;

  const dy =
    b.y -
    a.y;

  const distance =
    Math.hypot(
      dx,
      dy
    );

  const minimum =
    a.r +
    b.r;

  if (
    distance <= 0.001 ||
    distance >= minimum
  ) {
    return false;
  }

  const nx =
    dx /
    distance;

  const ny =
    dy /
    distance;

  const overlap =
    minimum -
    distance;

  /*
    Separate overlapping coins.
  */

  a.x -=
    nx *
    overlap *
    0.51;

  a.y -=
    ny *
    overlap *
    0.51;

  b.x +=
    nx *
    overlap *
    0.51;

  b.y +=
    ny *
    overlap *
    0.51;

  /*
    Relative velocity.
  */

  const relative =
    (a.vx - b.vx) * nx +
    (a.vy - b.vy) * ny;

  if (
    relative <= 0
  ) {
    return false;
  }

  const impulse =
    relative *
    0.985;

  a.vx -=
    impulse *
    nx;

  a.vy -=
    impulse *
    ny;

  b.vx +=
    impulse *
    nx;

  b.vy +=
    impulse *
    ny;

  sfx.hit(
    Math.min(
      10,
      relative
    )
  );

  if (
    Math.random() < 0.4
  ) {

    burst(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      2
    );
  }

  return true;
}

/* ---------------------------------------------------------
   MAIN PHYSICS
--------------------------------------------------------- */

function physics(dt) {

  if (
    striker &&
    !striker.pocketed
  ) {

    updateObject(
      striker,
      dt,
      true
    );
  }

  for (
    const coin of coins
  ) {

    if (!coin.pocketed) {

      updateObject(
        coin,
        dt,
        false
      );
    }
  }

  const objects = [
    ...(
      striker &&
      !striker.pocketed
        ? [striker]
        : []
    ),

    ...coins.filter(
      (coin) =>
        !coin.pocketed
    )
  ];

  for (
    let i = 0;
    i < objects.length;
    i++
  ) {

    for (
      let j = i + 1;
      j < objects.length;
      j++
    ) {

      collide(
        objects[i],
        objects[j]
      );
    }
  }

  for (
    const particle of particles
  ) {

    particle.x +=
      particle.vx *
      dt;

    particle.y +=
      particle.vy *
      dt;

    particle.vy +=
      0.05 *
      dt;

    particle.vx *=
      0.985;

    particle.life -=
      0.018 *
      dt;
  }

  particles =
    particles.filter(
      (particle) =>
        particle.life > 0
    );

  /*
    Shot finished.
  */

  if (
    shotActive &&
    !moving()
  ) {

    coins =
      coins.filter(
        (coin) =>
          !coin.pocketed
      );

    const remainingCoins =
      coins.filter(
        (coin) =>
          coin.type === 'coin'
      ).length;

    /*
      Queen can be left until the end.
    */

    if (
      remainingCoins === 0
    ) {

      finishGame();

    } else {

      endTurn(
        shotPocketed > 0 ||
        shotQueen
      );
    }
  }
}

/* ---------------------------------------------------------
   END TURN
--------------------------------------------------------- */

function endTurn(scored) {

  if (gameOver) {
    return;
  }

  shotActive = false;

  dragging = false;

  dragPoint = null;

  if (
    striker &&
    striker.pocketed
  ) {

    striker = null;
  }

  /*
    Foul = next player.
    Successful pocket = keep turn.
  */

  if (
    !scored ||
    shotFoul
  ) {

    turn =
      (
        turn + 1
      ) %
      players.length;
  }

  placeStriker();

  updateHud();

  setPower(0);

  setTimer();

  draw();

  /*
    Computer
