const axios = require('axios');
const { getLeader, setLeader } = require('./leaderManager');
const { replicas } = require('./config');

const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // ms

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

  // Try current leader first
  if (await tryPost(leader)) {
    return;
  }

  console.log('Leader failed. Trying other replicas...');

  // Try other replicas to find new leader with retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    for (let r of replicas) {
      if (attempted.has(r)) continue;
      if (await tryPost(r)) {
        setLeader(r);
        console.log('Switched leader to', r);
        return;
      }
    }
    
    // Wait before retrying
    if (attempt < MAX_RETRIES - 1) {
      console.log(`Retry attempt ${attempt + 1}/${MAX_RETRIES - 1}...`);
      await sleep(RETRY_DELAY);
      attempted.clear(); // Clear attempted set for retry
    }
  }

  console.error('All replicas unreachable or no leader available after retries');
}

module.exports = { forwardToLeader };
