(() => {
  "use strict";

  /* ============ KONFIGURASI ============ */
  const ASSET = "asset/";

  const NORMAL_SYMBOLS = [
    "04_mahkota.png",
    "05_permata_merah.png",
    "06_permata_hijau.png",
    "07_permata_ungu.png",
    "08_jam_pasir.png",
    "09_piala.png",
    "10_cincin.png"
  ].map(file => ASSET + file);

  const MULTIPLIERS = [
    { src: ASSET + "02_50x.png", value: 50, label: "50x" },
    { src: ASSET + "03_250x.png", value: 250, label: "250x" }
  ];

  const COLS = 6;
  const ROWS = 5;
  const MIN_MATCH = 8;
  const MAX_TUMBLE = 8;
  const WIN_CHANCE = 0.85;
  const MULTIPLIER_CHANCE = 0.035;

  /* ============ ELEMEN ============ */
  const $ = id => document.getElementById(id);

  const gridEl = $("reelGrid");
  const spinBtn = $("spinBtn");
  const statusEl = $("status");
  const spinCountEl = $("spinCount");
  const tumbleCountEl = $("tumbleCount");
  const multiplierTotalEl = $("multiplierTotal");
  const demoWinEl = $("demoWin");
  const resultModal = $("resultModal");
  const userModal = $("userModal");
  const userIdInput = $("userid");
  const loadingModal = $("loadingModal");
  const loadingText = $("loadingText");

  /* ============ STATE ============ */
  let board = [];
  let spinCount = 0;
  let currentTumbles = 0;
  let currentMultiplier = 1;
  let demoWin = 0;
  let spinning = false;

  /* ============ UTILITAS ============ */
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomItem = items => items[Math.floor(Math.random() * items.length)];
  const setStatus = text => { if (statusEl) statusEl.textContent = text; };
  const cellKey = (row, col) => `${row}-${col}`;
  const getCellElement = (row, col) =>
    gridEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);

  function forEachCell(callback) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) callback(row, col);
    }
  }

  function tone(frequency, duration, type = "sine", volume = 0.03) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const context = new Ctx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.stop(context.currentTime + duration);
    } catch (error) {
      console.warn("Audio tidak tersedia:", error);
    }
  }

  /* ============ PAPAN ============ */
  const makeNormalCell = () => ({ type: "normal", src: randomItem(NORMAL_SYMBOLS) });

  function makeRandomCell() {
    if (Math.random() < MULTIPLIER_CHANCE) {
      const multiplier = randomItem(MULTIPLIERS);
      return { type: "multiplier", sticky: true, ...multiplier };
    }
    return makeNormalCell();
  }

  function shuffled(list) {
    const items = [...list];
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function makeBoard(forceWin = false) {
    const nextBoard = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, makeRandomCell)
    );

    if (forceWin) {
      const winningSymbol = randomItem(NORMAL_SYMBOLS);
      const amount = MIN_MATCH + Math.floor(Math.random() * 5);
      let inserted = 0;

      for (const index of shuffled([...Array(ROWS * COLS).keys()])) {
        if (inserted >= amount) break;
        const row = Math.floor(index / COLS);
        const col = index % COLS;
        if (nextBoard[row][col].type === "multiplier") continue; // multiplier tidak ditimpa
        nextBoard[row][col] = { type: "normal", src: winningSymbol };
        inserted += 1;
      }
    }

    return nextBoard;
  }

  /* ============ RENDER ============ */
  function buildGrid() {
    gridEl.innerHTML = "";
    forEachCell((row, col) => {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      const image = document.createElement("img");
      image.alt = "Simbol";
      image.loading = "lazy";
      cell.appendChild(image);
      gridEl.appendChild(cell);
    });
  }

  function renderBoard(dropPositions = new Set()) {
    forEachCell((row, col) => {
      const cellEl = getCellElement(row, col);
      const cell = board[row][col];
      if (!cellEl || !cell) return;

      cellEl.className = "cell";
      cellEl.querySelector("img").src = cell.src;

      if (cell.type === "multiplier") {
        cellEl.classList.add("multiplier", "sticky-lock", "static-multiplier");
      } else if (dropPositions.has(cellKey(row, col))) {
        cellEl.classList.add("dropping");
        setTimeout(() => cellEl.classList.remove("dropping"), 600);
      }
    });
  }

  const allPositions = () => {
    const keys = new Set();
    forEachCell((row, col) => keys.add(cellKey(row, col)));
    return keys;
  };

  /* ============ KEMENANGAN ============ */
  function findWins() {
    const positionsBySymbol = new Map();

    forEachCell((row, col) => {
      const cell = board[row][col];
      if (!cell || cell.type !== "normal") return;
      if (!positionsBySymbol.has(cell.src)) positionsBySymbol.set(cell.src, []);
      positionsBySymbol.get(cell.src).push({ row, col });
    });

    return [...positionsBySymbol.entries()]
      .filter(([, positions]) => positions.length >= MIN_MATCH)
      .map(([symbol, positions]) => ({ symbol, positions }));
  }

  function getStickyMultipliers() {
    const multipliers = [];
    forEachCell((row, col) => {
      if (board[row][col]?.type === "multiplier") multipliers.push(board[row][col]);
    });
    return multipliers;
  }

  async function animateInitialSpin() {
    const cells = [...gridEl.querySelectorAll(".cell")];
    cells.forEach(cell => cell.classList.add("spinning"));

    const timer = setInterval(() => {
      cells.forEach(cell => {
        cell.querySelector("img").src = randomItem(NORMAL_SYMBOLS);
      });
    }, 80);

    await sleep(1150);
    clearInterval(timer);
    cells.forEach(cell => cell.classList.remove("spinning"));
  }

  async function highlightAndRemove(wins) {
    const winningPositions = wins.flatMap(win => win.positions);
    const mark = className =>
      winningPositions.forEach(({ row, col }) =>
        getCellElement(row, col)?.classList.add(className)
      );

    mark("winner");
    setStatus(`🔥 ${winningPositions.length} simbol terhubung! Tumble dimulai...`);
    tone(720, 0.25, "sine", 0.045);

    await sleep(900);
    mark("removing");
    await sleep(480);

    winningPositions.forEach(({ row, col }) => {
      board[row][col] = null;
    });
  }

  /*
    STICKY TUMBLE:
    - Multiplier tetap di koordinat yang sama dan membagi kolom jadi segmen.
    - Hanya simbol normal yang jatuh dan mengisi lubang.
  */
  function collapseAndRefillSticky() {
    const dropped = new Set();

    for (let col = 0; col < COLS; col += 1) {
      const multiplierRows = [];
      for (let row = 0; row < ROWS; row += 1) {
        if (board[row][col]?.type === "multiplier") multiplierRows.push(row);
      }

      const boundaries = [-1, ...multiplierRows, ROWS];

      for (let s = 0; s < boundaries.length - 1; s += 1) {
        const start = boundaries[s] + 1;
        const end = boundaries[s + 1] - 1;
        if (start > end) continue;

        const survivors = [];
        for (let row = end; row >= start; row -= 1) {
          const cell = board[row][col];
          if (cell?.type === "normal") survivors.push(cell);
        }

        for (let writeRow = end; writeRow >= start; writeRow -= 1) {
          board[writeRow][col] = survivors.shift() ?? makeNormalCell();
          dropped.add(cellKey(writeRow, col));
        }
      }
    }

    return dropped;
  }

  function applyStickyMultiplierOnce() {
    const multipliers = getStickyMultipliers();
    if (!multipliers.length) return;

    const added = multipliers.reduce((sum, item) => sum + item.value, 0);
    currentMultiplier = 1 + added;
    multiplierTotalEl.textContent = `${currentMultiplier}×`;
    setStatus(`⚡ ${multipliers.length} multiplier sticky aktif: +${added}×`);
    tone(880, 0.35, "triangle", 0.05);
  }

  function addDemoScore(wins) {
    const matched = wins.reduce((sum, win) => sum + win.positions.length, 0);
    demoWin += matched * currentMultiplier;
    demoWinEl.textContent = demoWin.toLocaleString("id-ID");
  }

  async function runTumbles() {
    applyStickyMultiplierOnce();

    for (let round = 0; round < MAX_TUMBLE; round += 1) {
      const wins = findWins();
      if (!wins.length) break;

      currentTumbles += 1;
      tumbleCountEl.textContent = String(currentTumbles);
      addDemoScore(wins);

      await highlightAndRemove(wins);
      renderBoard(collapseAndRefillSticky());

      setStatus(`✨ Tumble ${currentTumbles}: multiplier terkunci, simbol lain turun...`);
      await sleep(800);
    }
  }

  /* ============ EFEK & MODAL ============ */
  function confetti() {
    for (let i = 0; i < 65; i += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = `hsl(${Math.random() * 360} 90% 60%)`;
      piece.style.animationDuration = `${2.2 + Math.random() * 2}s`;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 4600);
    }
  }

  function showResult() {
    $("modalTitle").textContent = "SELAMAT!";
    $("modalText").innerHTML =
      "AKUN KAMU SUDAH UPGRADE,<br><strong>LOGIN MELALUI LINK DIBAWAH ↓</strong>";

    resultModal.classList.add("show");
    confetti();
    tone(900, 0.45, "sine", 0.06);
  }

  async function checkUserLoading() {
    const steps = [
      ["🔍 Mengecek USER ID...", 1200],
      ["📡 Menghubungkan Server...", 1200],
      ["🎯 Menganalisa Pola...", 1400],
      ["🎰 Menyiapkan Spin...", 900]
    ];

    loadingModal.classList.add("show");
    for (const [text, wait] of steps) {
      loadingText.textContent = text;
      await sleep(wait);
    }
    loadingModal.classList.remove("show");
  }

  /* ============ SPIN ============ */
  async function spin() {
    if (spinning) return;
    spinning = true;
    spinBtn.disabled = true;

    spinCount += 1;
    currentTumbles = 0;
    currentMultiplier = 1;
    demoWin = 0;

    spinCountEl.textContent = String(spinCount);
    tumbleCountEl.textContent = "0";
    multiplierTotalEl.textContent = "1×";
    demoWinEl.textContent = "0";
    setStatus("🎰 Mengacak simbol keberuntungan...");

    await animateInitialSpin();

    board = makeBoard(Math.random() < WIN_CHANCE);
    renderBoard(allPositions());
    await sleep(650);

    await runTumbles();

    setStatus(
      currentTumbles > 0
        ? `🏆 Selesai! ${currentTumbles} tumble • multiplier ${currentMultiplier}×`
        : "✨ Belum hoki. Tekan UPGRADE AKUN untuk mencoba lagi!"
    );

    showResult();
    spinBtn.disabled = false;
    spinning = false;
  }

  /* ============ PARTIKEL ============ */
  function buildParticles() {
    const container = $("particles");
    if (!container) return;

    for (let i = 0; i < 30; i += 1) {
      const particle = document.createElement("i");
      particle.className = "particle";
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animationDuration = `${7 + Math.random() * 11}s`;
      particle.style.animationDelay = `${-Math.random() * 14}s`;
      container.appendChild(particle);
    }
  }

  /* ============ EVENT ============ */
  spinBtn.addEventListener("click", () => {
    userIdInput.value = "";
    userModal.classList.add("show");
    setTimeout(() => userIdInput.focus(), 200);
  });

  $("cekBtn").addEventListener("click", async () => {
    if (!userIdInput.value.trim()) {
      alert("Masukkan USER ID terlebih dahulu");
      return;
    }
    userModal.classList.remove("show");
    await checkUserLoading();
    await spin();
  });

  $("modalClose")?.addEventListener("click", () => resultModal.classList.remove("show"));
  resultModal.addEventListener("click", event => {
    if (event.target === resultModal) resultModal.classList.remove("show");
  });

  const welcomePopup = $("welcomePopup");
  const closeWelcome = $("closeWelcome");

  if (welcomePopup && closeWelcome) {
    window.addEventListener("load", () => {
      setTimeout(() => { welcomePopup.style.display = "flex"; }, 500);
    });
    closeWelcome.addEventListener("click", () => {
      welcomePopup.style.display = "none";
    });
  }

  /* ============ INIT ============ */
  buildParticles();
  buildGrid();
  board = makeBoard(false);
  renderBoard();
})();
