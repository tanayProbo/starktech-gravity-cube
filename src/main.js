const videoElement = document.getElementsByClassName('input_video')[0];
const drawingCanvas = document.getElementsByClassName('drawing_layer')[0];
const cursorCanvas = document.getElementsByClassName('cursor_layer')[0];
const drawCtx = drawingCanvas.getContext('2d');
const cursorCtx = cursorCanvas.getContext('2d');
const statusText = document.getElementById('status-text');

let currentColor = '#ff2a2a';
let isDrawing = false;
let previousPoint = null;

// Handle color selection
const colorBtns = document.querySelectorAll('.color-btn');
colorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    colorBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.getAttribute('data-color');
  });
});

// Clear canvas
document.getElementById('clear-btn').addEventListener('click', () => {
  drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
});

// Setup canvas size to match window
function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Save drawing context
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = drawingCanvas.width;
  tempCanvas.height = drawingCanvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(drawingCanvas, 0, 0);

  drawingCanvas.width = width;
  drawingCanvas.height = height;
  cursorCanvas.width = width;
  cursorCanvas.height = height;
  
  // Restore drawing context
  drawCtx.drawImage(tempCanvas, 0, 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial size

function calculateDistance(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function onResults(results) {
  // Clear the cursor layer every frame
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    statusText.innerText = "Tracking Hand...";
    const landmarks = results.multiHandLandmarks[0];
    
    // Index finger tip is landmark 8, Thumb tip is landmark 4
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    // Note: MediaPipe returns normalized coordinates (0 to 1). 
    // Need to map to canvas. Since video might be object-fit: cover, mapping isn't perfectly 1:1,
    // but multiplying by canvas dimensions works well enough for an overlay.
    // Also, if camera is environment, we don't necessarily flip X, but let's test normally.
    const x = indexTip.x * drawingCanvas.width;
    const y = indexTip.y * drawingCanvas.height;
    
    // Draw cursor indicator at index finger tip
    cursorCtx.beginPath();
    cursorCtx.arc(x, y, 10, 0, 2 * Math.PI);
    cursorCtx.fillStyle = currentColor;
    cursorCtx.fill();
    cursorCtx.lineWidth = 3;
    cursorCtx.strokeStyle = 'white';
    cursorCtx.stroke();
    
    // Check for pinch gesture to start drawing
    const pinchDistance = calculateDistance(indexTip, thumbTip);
    
    // Threshold to detect pinch (can be tweaked based on testing)
    const PINCH_THRESHOLD = 0.05;
    
    if (pinchDistance < PINCH_THRESHOLD) {
      if (!isDrawing) {
        isDrawing = true;
        previousPoint = { x, y };
      } else {
        // Draw line on the drawing canvas
        drawCtx.beginPath();
        drawCtx.moveTo(previousPoint.x, previousPoint.y);
        drawCtx.lineTo(x, y);
        drawCtx.strokeStyle = currentColor;
        drawCtx.lineWidth = 8;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.stroke();
        previousPoint = { x, y };
      }
      
      // Visually indicate drawing mode (larger cursor)
      cursorCtx.beginPath();
      cursorCtx.arc(x, y, 15, 0, 2 * Math.PI);
      cursorCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      cursorCtx.fill();
    } else {
      isDrawing = false;
      previousPoint = null;
    }
  } else {
    statusText.innerText = "No hand detected in view";
    isDrawing = false;
    previousPoint = null;
  }
}

// Initialize MediaPipe Hands
const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1, // 0 for lighter weight, 1 for accuracy
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

hands.onResults(onResults);

// Initialize Camera
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
  },
  facingMode: 'environment', // Request back camera
  width: { ideal: 1280 },
  height: { ideal: 720 }
});

camera.start()
  .then(() => {
    statusText.innerText = "Camera active. Show your hand!";
  })
  .catch(err => {
    statusText.innerText = "Camera error. HTTPS required on mobile.";
    console.error('Camera Error:', err);
  });
