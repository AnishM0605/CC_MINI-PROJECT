const express = require('express');
const router = express.Router();
const { broadcast } = require('../broadcastService');

router.post('/', (req, res) => {
  const entry = req.body;

  // Ensure it's a stroke entry
  if (entry.type === "stroke" && entry.data) {
    console.log("Broadcasting committed stroke:", entry.data);

    broadcast({
      type: "stroke",
      data: entry.data
    });
  }

  res.send({ status: "ok" });
});

module.exports = router;