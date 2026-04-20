/**
 * Heartbeat Logic
 * Handles leader heartbeats and AppendEntries RPC
 */

class Heartbeat {
  constructor(nodeId, nodeState, termManager, logger) {
    this.nodeId = nodeId;
    this.nodeState = nodeState;
    this.termManager = termManager;
    this.logger = logger;
  }

  /**
   * Prepare heartbeat (empty AppendEntries) for a specific follower
   * @param {string} followerId - Follower node ID
   * @returns {object} AppendEntries RPC arguments
   */
  prepareHeartbeat(followerId) {
    return this._prepareAppendEntries(followerId, []);
  }

  /**
   * Handle AppendEntries RPC from leader
   * Returns { success, term, lastLogIndex }
   */
  handleAppendEntries(args) {
    const {
      term,
      leaderId,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommitIndex,
    } = args;

    // Update term if higher
    if (term > this.nodeState.currentTerm) {
      this.nodeState.currentTerm = term;
      this.nodeState.votedFor = null;
      this.termManager.updateTerm(term);
    }

    // Reject if term is stale
    if (term < this.nodeState.currentTerm) {
      return {
        success: false,
        term: this.nodeState.currentTerm,
        lastLogIndex: this.nodeState.getLastLogIndex(),
      };
    }

    // Check log matching property
    if (!this._checkLogMatch(prevLogIndex, prevLogTerm)) {
      this.logger.debug('Log match failed', {
        prevLogIndex,
        prevLogTerm,
        ourLastLogIndex: this.nodeState.getLastLogIndex(),
        ourLastLogTerm: this.nodeState.getLastLogTerm(),
      });

      return {
        success: false,
        term: this.nodeState.currentTerm,
        conflictIndex: Math.min(prevLogIndex, this.nodeState.getLastLogIndex()),
        lastLogIndex: this.nodeState.getLastLogIndex(),
      };
    }

    // Append entries
    if (entries && entries.length > 0) {
      // Remove conflicting entries
      if (prevLogIndex >= 0) {
        this.nodeState.removeEntriesFrom(prevLogIndex + 1);
      }

      // Append new entries
      this.nodeState.appendEntries(entries);
      this.logger.debug('Entries appended', {
        count: entries.length,
        prevLogIndex,
      });
    }

    // Update commit index
    const oldCommitIndex = this.nodeState.commitIndex;
    if (leaderCommitIndex > this.nodeState.commitIndex) {
      this.nodeState.commitIndex = Math.min(
        leaderCommitIndex,
        this.nodeState.getLastLogIndex()
      );

      if (this.nodeState.commitIndex > oldCommitIndex) {
        this.logger.info('Commit index updated', {
          oldIndex: oldCommitIndex,
          newIndex: this.nodeState.commitIndex,
        });
      }
    }

    return {
      success: true,
      term: this.nodeState.currentTerm,
      lastLogIndex: this.nodeState.getLastLogIndex(),
    };
  }

  /**
   * Check log matching property
   * Ensure entry at prevLogIndex has prevLogTerm
   */
  _checkLogMatch(prevLogIndex, prevLogTerm) {
    if (prevLogIndex === -1) {
      return prevLogTerm === 0; // Beginning of log
    }

    const entry = this.nodeState.getLogEntry(prevLogIndex);
    if (!entry) {
      return false;
    }

    return entry.term === prevLogTerm;
  }

  /**
   * Prepare AppendEntries RPC with entries
   * @private
   */
  _prepareAppendEntries(followerId, entries) {
    let nextIndex = this.nodeState.nextIndex[followerId];
    if (nextIndex === undefined) {
      nextIndex = this.nodeState.getLastLogIndex() + 1;
    }

    const prevLogIndex = nextIndex - 1;
    const prevLogTerm = prevLogIndex === -1 
      ? 0
      : this.nodeState.getLogEntry(prevLogIndex)?.term || 0;

    return {
      term: this.nodeState.currentTerm,
      leaderId: this.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries: entries.length > 0 ? entries : [],
      leaderCommitIndex: this.nodeState.commitIndex,
    };
  }
}

module.exports = Heartbeat;
