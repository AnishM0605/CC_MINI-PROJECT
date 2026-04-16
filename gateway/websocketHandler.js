const { registerClient, removeClient } = require('./broadcastService');
const { forwardToLeader } = require('./replicaClient');

function handleConnection(ws) {
  console.log("Client connected");
  registerClient(ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "stroke") {
        await forwardToLeader(data);
      }
    } catch (err) {
      console.error("Invalid message", err);
    }
  });

  ws.on('error', (err) => {
    console.error("WebSocket client error:", err);
  });

  ws.on('close', (code, reason) => {
    console.log("Client disconnected", { code, reason: reason?.toString() });
    removeClient(ws);
  });
}

module.exports = { handleConnection };