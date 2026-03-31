const express = require('express');
const router = express.Router();
const { broadcast } = require('../broadcastService');

router.post('/', (req, res) => {
  const stroke = req.body;

  // Broadcast ONLY committed strokes
  broadcast(stroke);

  res.send({ status: "ok" });
});

module.exports = router;