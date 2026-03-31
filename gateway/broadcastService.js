let clients = [];

function registerClient(ws) {
  clients.push(ws);
}

function removeClient(ws) {
  clients = clients.filter(c => c !== ws);
}

function broadcast(message) {
  clients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  });
}

module.exports = { registerClient, removeClient, broadcast };