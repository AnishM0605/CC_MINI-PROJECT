const axios = require('axios');
const { getLeader, setLeader } = require('./leaderManager');
const { replicas } = require('./config');

async function forwardToLeader(stroke) {
  let leader = getLeader();

  try {
    await axios.post(`${leader}/client-request`, stroke);
  } catch (err) {
    console.log("Leader failed. Trying others...");

    // Try other replicas (failover)
    for (let r of replicas) {
      if (r === leader) continue;

      try {
        await axios.post(`${r}/client-request`, stroke);
        setLeader(r);
        console.log("Switched leader to", r);
        return;
      } catch (e) {
        continue;
      }
    }

    console.error("All replicas unreachable");
  }
}

module.exports = { forwardToLeader };