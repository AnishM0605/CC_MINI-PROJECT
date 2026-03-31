let currentLeader = "http://localhost:5001";

function getLeader() {
  return currentLeader;
}

function setLeader(newLeader) {
  console.log("Leader updated:", newLeader);
  currentLeader = newLeader;
}

module.exports = { getLeader, setLeader };