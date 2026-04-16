const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

let drawing = false;
let lastX = 0;
let lastY = 0;
let brushColor = '#1d4ed8';
let brushSize = 4;
let strokeCount = 0;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.strokeStyle = brushColor;
ctx.lineWidth = brushSize;

function updateCanvasSize() {
  const wrapper = document.querySelector('.canvas-wrapper');
  if (!wrapper) return;

  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(Math.min(wrapper.clientWidth, 1000), 320);
  const height = Math.max(Math.min(window.innerHeight * 0.62, 650), 360);

  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
}

function startDrawing(x, y) {
  drawing = true;
  lastX = x;
  lastY = y;
}

function stopDrawing() {
  drawing = false;
}

function draw(x, y) {
  if (!drawing) return;

  const stroke = {
    fromX: lastX,
    fromY: lastY,
    toX: x,
    toY: y,
    color: brushColor,
    width: brushSize
  };

  drawLine(stroke);
  sendStroke(stroke);

  lastX = x;
  lastY = y;
  incrementStrokeCount();
}

function drawLine({ fromX, fromY, toX, toY, color, width }) {
  ctx.save();
  if (color) ctx.strokeStyle = color;
  if (width) ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();
}

function drawFromServer(stroke) {
  if (!stroke) return;
  drawLine(stroke);
}

function setBrushColor(value) {
  brushColor = value;
  ctx.strokeStyle = brushColor;
}

function setBrushSize(value) {
  brushSize = Number(value);
  ctx.lineWidth = brushSize;
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resetStrokeCount() {
  strokeCount = 0;
  const strokesLabel = document.getElementById('strokes');
  if (strokesLabel) strokesLabel.textContent = `Strokes: ${strokeCount}`;
}

function incrementStrokeCount() {
  strokeCount += 1;
  const strokesLabel = document.getElementById('strokes');
  if (strokesLabel) strokesLabel.textContent = `Strokes: ${strokeCount}`;
}

window.updateCanvasSize = updateCanvasSize;
window.setBrushColor = setBrushColor;
window.setBrushSize = setBrushSize;
window.clearCanvas = clearCanvas;
window.resetStrokeCount = resetStrokeCount;
window.drawFromServer = drawFromServer;
window.resizeCanvas = updateCanvasSize;

updateCanvasSize();
