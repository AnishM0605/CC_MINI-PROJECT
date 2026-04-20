/**
 * RAFT Constants
 * Timing and system constants for Mini-RAFT implementation
 */

module.exports = {
  // Node States
  STATES: {
    FOLLOWER: 'FOLLOWER',
    CANDIDATE: 'CANDIDATE',
    LEADER: 'LEADER',
  },

  // Timing (milliseconds)
  ELECTION_TIMEOUT_MIN: 500,
  ELECTION_TIMEOUT_MAX: 800,
  HEARTBEAT_INTERVAL: 150,

  // Quorum
  QUORUM_SIZE: 2, // Majority of 3 nodes

  // Default values
  DEFAULT_TERM: 0,
  DEFAULT_VOTED_FOR: null,

  // Log entry types
  LOG_ENTRY_TYPES: {
    STROKE: 'stroke',
    CONFIG: 'config',
  },
};