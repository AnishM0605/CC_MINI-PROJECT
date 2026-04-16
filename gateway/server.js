const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const { handleConnection } = require('./websocketHandler');
const { setLeader } = require('./leaderManager');
const { broadcast } = require('./broadcastService');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// HTTP route for replicas
app.use('/commit', require('./routes/commit'));

app.post('/leader', (req, res) => {
  const { leaderUrl } = req.body;

  if (!leaderUrl) {
    return res.status(400).json({ error: 'leaderUrl is required' });
  }

  setLeader(leaderUrl);
  console.log('Leader updated via replica notification:', leaderUrl);
  res.json({ success: true });
});

app.post('/broadcast', (req, res) => {
  const stroke = req.body;
  broadcast(stroke);
  res.json({ success: true });
});

app.listen(4000, () => {
  console.log("HTTP server running on 4000");
});

// WebSocket server
const wss = new WebSocket.Server({ port: 3000 });

wss.on('connection', handleConnection);

console.log("WebSocket running on 3000");
