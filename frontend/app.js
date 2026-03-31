connectWebSocket();

const canvas = document.getElementById("board");

// Mouse events
canvas.addEventListener("mousedown", (e) => {
  startDrawing(e.offsetX, e.offsetY);
});

canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseleave", stopDrawing);

canvas.addEventListener("mousemove", (e) => {
  draw(e.offsetX, e.offsetY);
});

// Touch support (important for demo)
canvas.addEventListener("touchstart", (e) => {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  startDrawing(touch.clientX - rect.left, touch.clientY - rect.top);
});

canvas.addEventListener("touchend", stopDrawing);

canvas.addEventListener("touchmove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  draw(touch.clientX - rect.left, touch.clientY - rect.top);
});