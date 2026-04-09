/**
 * Election Logic
 * Handles RequestVote RPC, election state, and leader election
 */

const CONSTANTS = require('../constants');

class Election {
  constructor(nodeId, nodeState, termManager, logger) {
    this.nodeId = nodeId;
    this.nodeState = nodeState;
    this.termManager = termManager;
    this.logger = logger;

    // Volatile state for elections
    this.votesReceived = 0;
    this.otherNodes = [];
  }

  /**
   * Initialize with list of other node IDs
   */
  initializeCluster(otherNodeIds) {
    this.otherNodes = otherNodeIds;
  }

  /**
   * Start election (candidacy)
   */
  startElection(currentTerm) {
    // Increment term and vote for self
    const newTerm = this.termManager.incrementTerm();
    this.nodeState.currentTerm = newTerm;
    this.nodeState.votedFor = this.nodeId;
    this.votesReceived = 1; // Vote for self

    this.logger.electionStarted(newTerm);

    return {
      term: newTerm,
      candidateId: this.nodeId,
      lastLogIndex: this.nodeState.getLastLogIndex(),
      lastLogTerm: this.nodeState.getLastLogTerm(),
    };
  }

  /**
   * Handle RequestVote RPC from candidate
   * Returns { voteGranted, term }
   */
  handleRequestVote(args) {
    const { term, candidateId, lastLogIndex, lastLogTerm } = args;

    // Update term if higher
    if (term > this.nodeState.currentTerm) {
      this.nodeState.currentTerm = term;
      this.nodeState.votedFor = null;
      this.termManager.updateTerm(term);
    }

    // Deny vote if term is stale
    if (term < this.nodeState.currentTerm) {
      return { voteGranted: false, term: this.nodeState.currentTerm };
    }

    // Check if we have already voted for someone else in this term
    if (this.nodeState.votedFor !== null && this.nodeState.votedFor !== candidateId) {
      return { voteGranted: false, term: this.nodeState.currentTerm };
    }

    // Check if candidate's log is up-to-date
    if (!this._isLogUpToDate(lastLogIndex, lastLogTerm)) {
      return { voteGranted: false, term: this.nodeState.currentTerm };
    }

    // Grant vote
    this.nodeState.votedFor = candidateId;
    this.logger.info('Vote granted', { 
      term,
      candidateId,
      ownLastLogIndex: this.nodeState.getLastLogIndex(),
      ownLastLogTerm: this.nodeState.getLastLogTerm(),
    });

    return { voteGranted: true, term: this.nodeState.currentTerm };
  }

  /**
   * Record received vote
   */
  recordVote(voteGranted) {
    if (voteGranted) {
      this.votesReceived++;
    }
  }

  /**
   * Check if we have majority votes
   */
  hasMajority() {
    return this.votesReceived >= CONSTANTS.QUORUM_SIZE;
  }

  /**
   * Reset election state (for next election)
   */
  resetElectionState() {
    this.votesReceived = 0;
  }

  /**
   * Check if candidate's log is up-to-date
   * Log is up-to-date if:
   * - It has greater last term, OR
   * - Last term is equal and last index is greater or equal
   */
  _isLogUpToDate(candidateLastLogIndex, candidateLastLogTerm) {
    const ourLastLogTerm = this.nodeState.getLastLogTerm();
    const ourLastLogIndex = this.nodeState.getLastLogIndex();

    if (candidateLastLogTerm !== ourLastLogTerm) {
      return candidateLastLogTerm > ourLastLogTerm;
    }

    return candidateLastLogIndex >= ourLastLogIndex;
  }

  /**
   * Get votes needed for majority
   */
  getVotesNeeded() {
    return CONSTANTS.QUORUM_SIZE - this.votesReceived;
  }
}

module.exports = Election;
