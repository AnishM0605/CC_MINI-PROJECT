/**
 * NodeState Model
 * Represents the persistent state of a RAFT node
 */

class NodeState {
  /**
   * @param {string} nodeId - Unique identifier for this node
   */
  constructor(nodeId) {
    // Persistent state on all servers
    this.nodeId = nodeId;
    this.currentTerm = 0;
    this.votedFor = null;
    this.log = []; // Array of LogEntry objects

    // Volatile state on all servers
    this.commitIndex = -1; // Index of highest log entry known to be committed
    this.lastApplied = -1; // Index of highest log entry applied to state machine

    // Volatile state on leaders
    this.nextIndex = {}; // For each server, index of the next log entry to send (followers)
    this.matchIndex = {}; // For each server, index of highest log entry known to be replicated
  }

  /**
   * Get last log index (0-indexed, -1 if empty)
   */
  getLastLogIndex() {
    return this.log.length > 0 ? this.log.length - 1 : -1;
  }

  /**
   * Get last log term
   */
  getLastLogTerm() {
    if (this.log.length === 0) return 0;
    return this.log[this.log.length - 1].term;
  }

  /**
   * Get log entry at index
   */
  getLogEntry(index) {
    if (index < 0 || index >= this.log.length) {
      return null;
    }
    return this.log[index];
  }

  /**
   * Get entries from index onwards
   */
  getEntriesFrom(index) {
    if (index > this.log.length) {
      return [];
    }
    return this.log.slice(Math.max(0, index));
  }

  /**
   * Append entry to log
   */
  appendEntry(entry) {
    this.log.push(entry);
  }

  /**
   * Append multiple entries to log
   */
  appendEntries(entries) {
    const LogEntry = require('./logEntry');
    const normalizedEntries = entries.map((entry) => {
      if (entry instanceof LogEntry) {
        return entry;
      }
      if (entry && entry.term != null && entry.type != null) {
        return LogEntry.fromJSON(entry);
      }
      return entry;
    });

    this.log.push(...normalizedEntries);
  }

  /**
   * Remove entries from prevLogIndex onwards (on followers, before appending new entries)
   */
  removeEntriesFrom(prevLogIndex) {
    if (prevLogIndex >= 0 && prevLogIndex < this.log.length) {
      this.log = this.log.slice(0, prevLogIndex);
    }
  }

  /**
   * Get committed entries (entries that have been applied)
   */
  getCommittedEntries() {
    return this.log.slice(0, this.commitIndex + 1);
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      nodeId: this.nodeId,
      currentTerm: this.currentTerm,
      votedFor: this.votedFor,
      log: this.log.map(entry => entry.toJSON ? entry.toJSON() : entry),
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      nextIndex: this.nextIndex,
      matchIndex: this.matchIndex,
    };
  }
}

module.exports = NodeState;
