let socket;

function setConnectionStatus(status) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = status;
  statusEl.className = `status ${status.toLowerCase()}`;
}

const websocketHosts = [
  'ws://localhost:3000',
  'ws://127.0.0.1:3000',
  'ws://[::1]:3000'
];
let websocketIndex = 0;

function connectWebSocket(hostIndex = 0) {
  setConnectionStatus('Reconnecting');

  const url = websocketHosts[hostIndex] || websocketHosts[0];
  console.log(`Connecting to WebSocket: ${url}`);

  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log("Connected to Gateway", url);
    setConnectionStatus('Connected');
    websocketIndex = hostIndex;
  };

  socket.onclose = () => {
    console.log("Disconnected. Retrying...");
    setConnectionStatus('Disconnected');
    const nextIndex = (hostIndex + 1) % websocketHosts.length;
    setTimeout(() => connectWebSocket(nextIndex), 1000);
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err.message || err);
    setConnectionStatus('Disconnected');
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "stroke") {
        drawFromServer(msg.data);
      }
    } catch (err) {
      console.error('Invalid WebSocket payload', err);
    }
  };
}

function reconnectWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }
  connectWebSocket(websocketIndex);
}

function sendStroke(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "stroke",
      data
    }));
  }
}

window.connectWebSocket = connectWebSocket;
window.reconnectWebSocket = reconnectWebSocket;
window.sendStroke = sendStroke;
window.setConnectionStatus = setConnectionStatus;
