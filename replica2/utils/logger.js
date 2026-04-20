/**
 * Centralized Logger for RAFT Core
 * Provides structured logging for all RAFT operations
 */

class Logger {
  constructor(nodeId) {
    this.nodeId = nodeId;
  }

  /**
   * Format log message with timestamp and node ID
   */
  _formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      nodeId: this.nodeId,
      message,
      ...data,
    };
  }

  info(message, data) {
    const log = this._formatMessage('INFO', message, data);
    console.log(`[${log.timestamp}] [${log.nodeId}] INFO: ${message}`, data || '');
  }

  warn(message, data) {
    const log = this._formatMessage('WARN', message, data);
    console.warn(`[${log.timestamp}] [${log.nodeId}] WARN: ${message}`, data || '');
  }

  error(message, data) {
    const log = this._formatMessage('ERROR', message, data);
    console.error(`[${log.timestamp}] [${log.nodeId}] ERROR: ${message}`, data || '');
  }

  debug(message, data) {
    const log = this._formatMessage('DEBUG', message, data);
    if (process.env.DEBUG === 'true') {
      console.log(`[${log.timestamp}] [${log.nodeId}] DEBUG: ${message}`, data || '');
    }
  }

  // Specific logging for RAFT events
  electionStarted(term) {
    this.info('Election started', { term });
  }

  electionWon(term) {
    this.info('Election WON - became LEADER', { term });
  }

  electionLost(term, votedFor) {
    this.info('Election LOST', { term, votedFor });
  }

  heartbeatSent(term, replicaCount) {
    this.debug('Heartbeat sent', { term, replicaCount });
  }

  entriesReplicated(term, replicaId, entries) {
    this.debug('Entries replicated', { term, replicaId, entryCount: entries.length });
  }

  entryCommitted(index, term, type) {
    this.info('Entry COMMITTED', { index, term, type });
  }

  stateTransition(oldState, newState, term) {
    this.info(`State transition: ${oldState} -> ${newState}`, { term });
  }
}

module.exports = Logger;
