const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 500;

let drawing = false;
let lastX = 0;
let lastY = 0;

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
    toY: y
  };

  // Draw locally
  drawLine(stroke);

  // Send to server
  sendStroke(stroke);

  lastX = x;
  lastY = y;
}

function drawLine({ fromX, fromY, toX, toY }) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

function drawFromServer(stroke) {
  drawLine(stroke);
}