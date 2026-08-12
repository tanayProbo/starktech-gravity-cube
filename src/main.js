// ── Canvases ──────────────────────────────────────────────────────────────────
const videoEl         = document.querySelector('.input_video');
const drawingCanvas   = document.querySelector('.drawing_layer');
const cursorCanvas    = document.querySelector('.cursor_layer');
const drawCtx         = drawingCanvas.getContext('2d');
const cursorCtx       = cursorCanvas.getContext('2d');
const colorIndicator  = document.getElementById('color-indicator');
const gestureHint     = document.getElementById('gesture-hint');

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = [
  '#FF2D55', // Red-pink
  '#FF9500', // Orange
  '#FFCC00', // Yellow
  '#34C759', // Green
  '#00C7BE', // Teal
  '#007AFF', // Blue
  '#AF52DE', // Purple
  '#FFFFFF', // White
];
let colorIndex  = 0;
let currentColor = PALETTE[colorIndex];

// ── Drawing state ─────────────────────────────────────────────────────────────
let isDrawing    = false;
let prevPoint    = null;

// ── Gesture cooldown (prevent rapid re-triggers) ──────────────────────────────
let colorCooldown = false;
let clearCooldown = false;

// ── Canvas resize ─────────────────────────────────────────────────────────────
function resizeCanvases() {
  const w = window.innerWidth, h = window.innerHeight;

  // Preserve drawing layer
  const tmp = document.createElement('canvas');
  tmp.width  = drawingCanvas.width;
  tmp.height = drawingCanvas.height;
  tmp.getContext('2d').drawImage(drawingCanvas, 0, 0);

  drawingCanvas.width = cursorCanvas.width  = w;
  drawingCanvas.height = cursorCanvas.height = h;

  drawCtx.drawImage(tmp, 0, 0);
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();

// ── HUD helpers ───────────────────────────────────────────────────────────────
function updateColorHUD(hint) {
  colorIndicator.style.backgroundColor = currentColor;
  if (hint) {
    gestureHint.textContent = hint;
    clearTimeout(updateColorHUD._timer);
    updateColorHUD._timer = setTimeout(() => {
      gestureHint.style.opacity = '0';
    }, 1800);
    gestureHint.style.opacity = '1';
  }
  // Pulse animation
  colorIndicator.classList.remove('pulse');
  void colorIndicator.offsetWidth; // reflow
  colorIndicator.classList.add('pulse');
  setTimeout(() => colorIndicator.classList.remove('pulse'), 250);
}
updateColorHUD(null); // Init color dot

function flashClear() {
  const flash = document.createElement('div');
  flash.className = 'clear-flash';
  document.querySelector('.container').appendChild(flash);
  requestAnimationFrame(() => { flash.style.opacity = '1'; });
  setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), 300);
  }, 50);
}

// ── Distance helper ───────────────────────────────────────────────────────────
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── Map landmark to canvas coords ─────────────────────────────────────────────
// Video is mirrored (scaleX(-1)) for front cam, but on environment (back) cam
// we don't flip. MediaPipe gives 0-1 coords — multiply by canvas size.
function toCanvas(lm) {
  return {
    x: lm.x * drawingCanvas.width,
    y: lm.y * drawingCanvas.height,
  };
}

// ── MediaPipe results handler ─────────────────────────────────────────────────
function onResults(results) {
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    gestureHint.style.opacity = '1';
    gestureHint.textContent = 'Show your hand';
    isDrawing = false;
    prevPoint = null;
    return;
  }

  const lm = results.multiHandLandmarks[0];

  // Key landmarks
  const thumbTip  = lm[4];
  const indexTip  = lm[8];
  const midTip    = lm[12];
  const ringTip   = lm[16];

  const indexCanvas = toCanvas(indexTip);
  const thumbCanvas = toCanvas(thumbTip);

  // ── Gesture 1: Index+Thumb → Draw ────────────────────────────────────────
  const indexPinch = dist(indexTip, thumbTip);
  const DRAW_THRESHOLD = 0.06;

  // ── Gesture 2: Middle+Thumb → Cycle Color ────────────────────────────────
  const midPinch = dist(midTip, thumbTip);
  const COLOR_THRESHOLD = 0.055;

  // ── Gesture 3: Ring+Thumb → Clear Canvas ─────────────────────────────────
  const ringPinch = dist(ringTip, thumbTip);
  const CLEAR_THRESHOLD = 0.055;

  // -- Middle pinch: change color
  if (midPinch < COLOR_THRESHOLD && !colorCooldown) {
    colorIndex = (colorIndex + 1) % PALETTE.length;
    currentColor = PALETTE[colorIndex];
    colorCooldown = true;
    updateColorHUD('✦ Color changed');
    setTimeout(() => { colorCooldown = false; }, 700);
  }

  // -- Ring pinch: clear canvas
  if (ringPinch < CLEAR_THRESHOLD && !clearCooldown) {
    drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    clearCooldown = true;
    gestureHint.textContent = '✦ Canvas cleared';
    gestureHint.style.opacity = '1';
    flashClear();
    setTimeout(() => {
      clearCooldown = false;
      gestureHint.style.opacity = '0';
    }, 1200);
  }

  // -- Index pinch: draw
  if (indexPinch < DRAW_THRESHOLD) {
    if (!isDrawing) {
      isDrawing = true;
      prevPoint = indexCanvas;
    } else {
      drawCtx.beginPath();
      drawCtx.moveTo(prevPoint.x, prevPoint.y);
      drawCtx.lineTo(indexCanvas.x, indexCanvas.y);
      drawCtx.strokeStyle = currentColor;
      drawCtx.lineWidth   = 8;
      drawCtx.lineCap     = 'round';
      drawCtx.lineJoin    = 'round';
      drawCtx.stroke();
      prevPoint = indexCanvas;
    }

    gestureHint.style.opacity = '0';

    // Draw filled cursor when pinching
    cursorCtx.beginPath();
    cursorCtx.arc(indexCanvas.x, indexCanvas.y, 12, 0, Math.PI * 2);
    cursorCtx.fillStyle = currentColor;
    cursorCtx.fill();
  } else {
    isDrawing = false;
    prevPoint = null;

    // Hollow cursor when hovering
    cursorCtx.beginPath();
    cursorCtx.arc(indexCanvas.x, indexCanvas.y, 9, 0, Math.PI * 2);
    cursorCtx.strokeStyle = currentColor;
    cursorCtx.lineWidth   = 3;
    cursorCtx.stroke();

    // Show hand detected hint once
    if (gestureHint.textContent === 'Show your hand') {
      gestureHint.textContent = 'Pinch to draw · Middle+thumb = color · Ring+thumb = clear';
      setTimeout(() => { gestureHint.style.opacity = '0'; }, 3000);
    }
  }
}

// ── MediaPipe Hands ───────────────────────────────────────────────────────────
const hands = new Hands({
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.65
});

hands.onResults(onResults);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new Camera(videoEl, {
  onFrame: async () => { await hands.send({ image: videoEl }); },
  facingMode: 'environment',
  width:  { ideal: 1280 },
  height: { ideal: 720  }
});

camera.start()
  .then(() => {
    gestureHint.textContent = 'Show your hand';
    gestureHint.style.opacity = '1';
  })
  .catch(err => {
    gestureHint.textContent = 'Camera error — HTTPS required on mobile';
    gestureHint.style.opacity = '1';
    console.error(err);
  });
