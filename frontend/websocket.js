let socket;

function connectWebSocket() {
  socket = new WebSocket("ws://localhost:3000");

  socket.onopen = () => {
    console.log("Connected to Gateway");
  };

  socket.onclose = () => {
    console.log("Disconnected. Retrying...");
    setTimeout(connectWebSocket, 1000);
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "stroke") {
      drawFromServer(msg.data);
    }
  };
}

function sendStroke(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "stroke",
      data
    }));
  }
}