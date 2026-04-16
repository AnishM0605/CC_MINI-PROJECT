connectWebSocket();

const boardCanvas = document.getElementById("board");
const colorPicker = document.getElementById('color-picker');
const brushSizeInput = document.getElementById('brush-size');
const brushSizeValue = document.getElementById('brush-size-value');
const clearButton = document.getElementById('clear-btn');
const reconnectButton = document.getElementById('reconnect-btn');

function getCanvasCoordinates(event) {
  const rect = boardCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

boardCanvas.addEventListener("mousedown", (e) => {
  const { x, y } = getCanvasCoordinates(e);
  startDrawing(x, y);
});

boardCanvas.addEventListener("mouseup", stopDrawing);
boardCanvas.addEventListener("mouseleave", stopDrawing);
boardCanvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasCoordinates(e);
  draw(x, y);
});

boardCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const rect = boardCanvas.getBoundingClientRect();
  const touch = e.touches[0];
  startDrawing(touch.clientX - rect.left, touch.clientY - rect.top);
});

boardCanvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  stopDrawing();
});

boardCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const rect = boardCanvas.getBoundingClientRect();
  const touch = e.touches[0];
  draw(touch.clientX - rect.left, touch.clientY - rect.top);
});

colorPicker.addEventListener('input', (e) => {
  setBrushColor(e.target.value);
});

brushSizeInput.addEventListener('input', (e) => {
  const value = e.target.value;
  brushSizeValue.textContent = value;
  setBrushSize(value);
});

clearButton.addEventListener('click', () => {
  clearCanvas();
  resetStrokeCount();
});

reconnectButton.addEventListener('click', () => {
  reconnectWebSocket();
});

window.addEventListener('resize', () => {
  resizeCanvas();
});

resizeCanvas();