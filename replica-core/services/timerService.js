/**
 * Timer Service
 * Manages election and heartbeat timers
 */

const CONSTANTS = require('../constants');

class TimerService {
  constructor(logger) {
    this.logger = logger;
    this.electionTimer = null;
    this.heartbeatTimer = null;
    this.electionTimeoutHandler = null;
    this.heartbeatHandler = null;
  }

  /**
   * Generate random election timeout between MIN and MAX
   */
  _getRandomElectionTimeout() {
    return (
      Math.random() * 
      (CONSTANTS.ELECTION_TIMEOUT_MAX - CONSTANTS.ELECTION_TIMEOUT_MIN) +
      CONSTANTS.ELECTION_TIMEOUT_MIN
    );
  }

  /**
   * Start election timer
   */
  startElectionTimer(onTimeout) {
    this.stopElectionTimer();
    this.electionTimeoutHandler = onTimeout;
    const timeout = this._getRandomElectionTimeout();
    
    this.electionTimer = setTimeout(() => {
      this.logger.debug('Election timeout triggered', { timeout });
      if (this.electionTimeoutHandler) {
        this.electionTimeoutHandler();
      }
    }, timeout);
  }

  /**
   * Reset election timer (called when heartbeat is received)
   */
  resetElectionTimer(onTimeout) {
    this.stopElectionTimer();
    this.startElectionTimer(onTimeout);
  }

  /**
   * Stop election timer
   */
  stopElectionTimer() {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  /**
   * Start heartbeat timer (leaders only)
   */
  startHeartbeatTimer(onHeartbeat) {
    this.stopHeartbeatTimer();
    this.heartbeatHandler = onHeartbeat;
    
    this.heartbeatTimer = setInterval(() => {
      if (this.heartbeatHandler) {
        this.heartbeatHandler();
      }
    }, CONSTANTS.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat timer
   */
  stopHeartbeatTimer() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Clean up all timers
   */
  cleanup() {
    this.stopElectionTimer();
    this.stopHeartbeatTimer();
  }
}

module.exports = TimerService;
