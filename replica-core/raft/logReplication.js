/**
 * Log Replication Logic
 * Handles log replication from leader to followers
 */

const LogEntry = require('../models/logEntry');

class LogReplication {
  constructor(nodeId, nodeState, termManager, logger) {
    this.nodeId = nodeId;
    this.nodeState = nodeState;
    this.termManager = termManager;
    this.logger = logger;
  }

  /**
   * Client request handler (leader only)
   * Append entry to log and initiate replication
   */
  handleClientRequest(type, data) {
    if (!this.nodeState.currentTerm) {
      this.logger.error('Client request received but term is 0');
      return null;
    }

    const entry = new LogEntry(
      this.nodeState.getLastLogIndex() + 1,
      this.nodeState.currentTerm,
      type,
      data
    );

    this.nodeState.appendEntry(entry);
    this.logger.info('Entry appended to log', {
      index: entry.index,
      term: entry.term,
      type,
    });

    return {
      index: entry.index,
      term: entry.term,
      entry,
    };
  }

  /**
   * Handle successful replication from a follower
   * Update matchIndex and nextIndex for the follower
   */
  recordReplication(followerId, lastLogIndex) {
    const oldMatchIndex = this.nodeState.matchIndex[followerId] || -1;
    this.nodeState.matchIndex[followerId] = lastLogIndex;
    this.nodeState.nextIndex[followerId] = lastLogIndex + 1;

    if (lastLogIndex > oldMatchIndex) {
      this.logger.debug('Replication progress', {
        followerId,
        matchIndex: lastLogIndex,
        nextIndex: lastLogIndex + 1,
      });
    }

    return {
      matchIndex: lastLogIndex,
      nextIndex: lastLogIndex + 1,
    };
  }

  /**
   * Handle failed replication (log mismatch)
   * Decrement nextIndex and retry with earlier entries
   */
  recordReplicationFailure(followerId, conflictIndex = null) {
    let nextIndex = this.nodeState.nextIndex[followerId] || this.nodeState.getLastLogIndex() + 1;

    // Decrement nextIndex for retry
    nextIndex = Math.max(0, nextIndex - 1);

    // Use conflict index if provided (optimization from extended RAFT)
    if (conflictIndex !== null && conflictIndex >= 0) {
      nextIndex = conflictIndex;
    }

    const oldNextIndex = this.nodeState.nextIndex[followerId];
    this.nodeState.nextIndex[followerId] = nextIndex;

    this.logger.debug('Replication failure, backing off', {
      followerId,
      oldNextIndex,
      newNextIndex: nextIndex,
    });

    return nextIndex;
  }

  /**
   * Determine which entries should be sent to a follower
   */
  getEntriesToSend(followerId) {
    const nextIndex = this.nodeState.nextIndex[followerId];
    if (nextIndex === undefined) {
      return [];
    }

    return this.nodeState.getEntriesFrom(nextIndex);
  }

  /**
   * Update commitIndex when majority has replicated an entry
   * Returns true if commitIndex advanced
   */
  advanceCommitIndex(otherNodes) {
    const oldCommitIndex = this.nodeState.commitIndex;

    // Find the highest index that has been replicated on a majority
    let possibleNewCommitIndex = oldCommitIndex;

    for (let index = this.nodeState.getLastLogIndex(); index > oldCommitIndex; index--) {
      let replicatedCount = 1; // Count self

      for (const nodeId of otherNodes) {
        const matchIndex = this.nodeState.matchIndex[nodeId] || -1;
        if (matchIndex >= index) {
          replicatedCount++;
        }
      }

      // Check if majority has replicated this entry
      if (replicatedCount >= this._getQuorumSize(otherNodes)) {
        // Only commit if entry is in current term
        const entry = this.nodeState.getLogEntry(index);
        if (entry && entry.term === this.nodeState.currentTerm) {
          possibleNewCommitIndex = index;
          break;
        }
      }
    }

    if (possibleNewCommitIndex > oldCommitIndex) {
      this.nodeState.commitIndex = possibleNewCommitIndex;
      this.logger.info('Commit index advanced', {
        oldIndex: oldCommitIndex,
        newIndex: this.nodeState.commitIndex,
      });
      return true;
    }

    return false;
  }

  /**
   * Get committed entries not yet applied
   */
  getUnappliedCommittedEntries() {
    if (this.nodeState.commitIndex > this.nodeState.lastApplied) {
      const start = this.nodeState.lastApplied + 1;
      const end = this.nodeState.commitIndex + 1;
      return this.nodeState.log.slice(start, end);
    }
    return [];
  }

  /**
   * Mark entry as applied
   */
  markApplied(index) {
    if (index > this.nodeState.lastApplied) {
      this.nodeState.lastApplied = index;
    }
  }

  /**
   * Get quorum size based on cluster size
   * @private
   */
  _getQuorumSize(otherNodes) {
    const totalNodes = otherNodes.length + 1; // +1 for self
    return Math.floor(totalNodes / 2) + 1;
  }

  /**
   * Initialize leader state for a new follower
   */
  initializeFollower(followerId, lastLogIndex) {
    this.nodeState.nextIndex[followerId] = lastLogIndex + 1;
    this.nodeState.matchIndex[followerId] = -1;
  }
}

module.exports = LogReplication;
