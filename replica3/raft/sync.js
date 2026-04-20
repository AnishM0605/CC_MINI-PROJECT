/**
 * Sync Logic
 * Handles catch-up synchronization for restarted/rejoining nodes
 */

const LogEntry = require('../models/logEntry');

class Sync {
  constructor(nodeId, nodeState, logger) {
    this.nodeId = nodeId;
    this.nodeState = nodeState;
    this.logger = logger;
  }

  /**
   * Handle sync-log request from follower
   * Returns entries from specified index onwards
   */
  handleSyncLog(followerId, fromIndex) {
    // Get all committed entries from fromIndex onwards
    const entries = [];

    for (let i = Math.max(0, fromIndex); i <= this.nodeState.commitIndex; i++) {
      const entry = this.nodeState.getLogEntry(i);
      if (entry) {
        entries.push(entry);
      }
    }

    this.logger.info('SyncLog request handled', {
      followerId,
      fromIndex,
      sentCount: entries.length,
      commitIndex: this.nodeState.commitIndex,
    });

    return {
      success: true,
      term: this.nodeState.currentTerm,
      entries,
      commitIndex: this.nodeState.commitIndex,
    };
  }

  /**
   * Apply sync-log response (follower receiving sync)
   * Append all synced entries and update state
   */
  applySyncLog(senderId, entries, commitIndex) {
    if (!Array.isArray(entries)) {
      this.logger.error('Invalid sync entries', { senderId });
      return false;
    }

    // Verify all entries are contiguous and have expected indices
    const startIndex = this.nodeState.getLastLogIndex() + 1;

    entries.forEach((entryData, idx) => {
      // Convert if necessary
      const entry = entryData.toJSON ? entryData : entryData;
      
      // Create proper LogEntry object
      const logEntry = new LogEntry(
        startIndex + idx,
        entry.term,
        entry.type,
        entry.data
      );

      this.nodeState.appendEntry(logEntry);
    });

    // Update commit index to match leader's commit index
    const oldCommitIndex = this.nodeState.commitIndex;
    this.nodeState.commitIndex = commitIndex;

    this.logger.info('Sync log applied', {
      senderId,
      entriesCount: entries.length,
      oldCommitIndex,
      newCommitIndex: commitIndex,
    });

    return true;
  }

  /**
   * Detect if node is out of sync
   * (When prevLogIndex check fails in AppendEntries)
   */
  isOutOfSync(prevLogIndex, prevLogTerm) {
    if (prevLogIndex === -1) {
      return false; // In sync at beginning
    }

    const entry = this.nodeState.getLogEntry(prevLogIndex);
    if (!entry) {
      return true; // Entry doesn't exist
    }

    return entry.term !== prevLogTerm; // Term mismatch
  }

  /**
   * Get suggested starting index for sync
   */
  getSyncStartIndex() {
    return Math.max(0, this.nodeState.lastApplied + 1);
  }
}

module.exports = Sync;
