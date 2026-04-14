const axios = require('axios');
const { getLeader, setLeader } = require('./leaderManager');
const { replicas } = require('./config');

async function forwardToLeader(stroke) {
  let leader = getLeader();
  const attempted = new Set();

  async function tryPost(url) {
    if (attempted.has(url)) return false;
    attempted.add(url);

    try {
      await axios.post(`${url}/client-request`, stroke, { timeout: 3000 });
      return true;
    } catch (err) {
      const response = err.response?.data;
      if (response?.leaderUrl && response.leaderUrl !== leader) {
        setLeader(response.leaderUrl);
        leader = response.leaderUrl;
      }
      return false;
    }
  }

  if (await tryPost(leader)) {
    return;
  }

  console.log('Leader failed. Trying other replicas...');

  for (let r of replicas) {
    if (attempted.has(r)) continue;
    if (await tryPost(r)) {
      setLeader(r);
      console.log('Switched leader to', r);
      return;
    }
  }

  console.error('All replicas unreachable or no leader available');
}

module.exports = { forwardToLeader };
