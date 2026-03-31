const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const { handleConnection } = require('./websocketHandler');

const app = express();
app.use(cors());
app.use(express.json());

// HTTP route for replicas
app.use('/commit', require('./routes/commit'));

app.listen(4000, () => {
  console.log("HTTP server running on 4000");
});

// WebSocket server
const wss = new WebSocket.Server({ port: 3000 });

wss.on('connection', handleConnection);

console.log("WebSocket running on 3000");