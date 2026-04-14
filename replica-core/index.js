/**
 * RAFT Core Engine
 * Main orchestrator for the Mini-RAFT consensus protocol
 *
 * This module implements pure RAFT logic without HTTP or Docker concerns.
 * The HTTP layer (Express routes) is handled by replica instances.
 */

const CONSTANTS = require('./constants');
const Logger = require('./utils/logger');
const NodeState = require('./models/nodeState');
const TermManager = require('./services/termManager');
const TimerService = require('./services/timerService');
const StateMachine = require('./raft/state');
const Election = require('./raft/election');
const Heartbeat = require('./raft/heartbeat');
const LogReplication = require('./raft/logReplication');
const Sync = require('./raft/sync');

class RaftCore {
  /**
   * Initialize RAFT Core Engine
   * @param {string} nodeId - Unique node identifier
   * @param {array} otherNodeIds - IDs of other nodes in cluster
   */
  constructor(nodeId, otherNodeIds = ['replica2', 'replica3']) {
    this.nodeId = nodeId;
    this.otherNodeIds = otherNodeIds;

    // Initialize logger
    this.logger = new Logger(nodeId);

    // Initialize state
    this.nodeState = new NodeState(nodeId);

    // Initialize services
    this.termManager = new TermManager(CONSTANTS.DEFAULT_TERM);
    this.timerService = new TimerService(this.logger);

    // Initialize RAFT components
    this.stateMachine = new StateMachine(
      nodeId,
      this.logger,
      this._onStateChange.bind(this)
    );

    this.election = new Election(nodeId, this.nodeState, this.termManager, this.logger);
    this.election.initializeCluster(otherNodeIds);

    this.heartbeat = new Heartbeat(nodeId, this.nodeState, this.termManager, this.logger);
    this.logReplication = new LogReplication(nodeId, this.nodeState, this.termManager, this.logger);
    this.sync = new Sync(nodeId, this.nodeState, this.logger);

    // Event callbacks
    this.callbacks = {
      onElectionWon: null,
      onElectionStarted: null,
      onLeaderChanged: null,
      onEntryCommitted: null,
      onStateChanged: null,
    };

    this.logger.info('RAFT Core initialized', {
      nodeId,
      otherNodeIds: otherNodeIds.length,
    });
  }

  // ==================== PUBLIC INTERFACE ====================

  /**
   * Start the RAFT node
   * Begins election timer and initializes leadership election
   */
  start() {
    this.logger.info('RAFT Core starting');

    // Initialize leader state for followers
    this.otherNodeIds.forEach(followerId => {
      this.logReplication.initializeFollower(followerId, this.nodeState.getLastLogIndex());
    });

    // Start election timer
    this._startElectionTimer();
  }

  /**
   * Stop the RAFT node
   * Cleans up timers and stops all activities
   */
  stop() {
    this.logger.info('RAFT Core stopping');
    this.timerService.cleanup();
  }

  /**
   * Get current node state
   */
  getState() {
    return this.stateMachine.getState();
  }

  /**
   * Check if this node is the leader
   */
  isLeader() {
    return this.stateMachine.isLeader();
  }

  /**
   * Get current term
   */
  getTerm() {
    return this.nodeState.currentTerm;
  }

  /**
   * Get node information
   */
  getNodeInfo() {
    return {
      nodeId: this.nodeId,
      state: this.stateMachine.getState(),
      term: this.nodeState.currentTerm,
      lastLogIndex: this.nodeState.getLastLogIndex(),
      commitIndex: this.nodeState.commitIndex,
      logLength: this.nodeState.log.length,
      votedFor: this.nodeState.votedFor,
    };
  }

  // ==================== CLIENT REQUESTS (Leader Only) ====================

  /**
   * Handle client request to append entry
   * Only leaders should process this
   * @param {string} type - Entry type (e.g., 'stroke')
   * @param {object} data - Entry data
   * @returns {object|null} Entry info or null if not leader
   */
  clientRequest(type, data) {
    if (!this.isLeader()) {
      this.logger.warn('Client request received but not leader', { state: this.getState() });
      return null;
    }

    const result = this.logReplication.handleClientRequest(type, data);
    return result;
  }

  // ==================== RAFT RPC HANDLERS ====================

  /**
   * Handle RequestVote RPC
   * @param {object} args - RPC arguments { term, candidateId, lastLogIndex, lastLogTerm }
   * @returns {object} { voteGranted, term }
   */
  handleRequestVote(args) {
    // Leaders reject RequestVote
    if (this.stateMachine.isLeader()) {
      return { voteGranted: false, term: this.nodeState.currentTerm };
    }

    const result = this.election.handleRequestVote(args);

    // Update state based on term
    if (args.term > this.nodeState.currentTerm) {
      this.stateMachine.becomeFollower(args.term);
      this._startElectionTimer();
    }

    return result;
  }

  /**
   * Record vote received during election
   * @param {boolean} voteGranted - Whether vote was granted
   */
  recordVoteResponse(voteGranted) {
    this.election.recordVote(voteGranted);

    if (this.stateMachine.isCandidate() && this.election.hasMajority()) {
      this._becomeLeader();
    }
  }

  /**
   * Handle AppendEntries RPC (heartbeat or log replication)
   * @param {object} args - RPC arguments
   * @returns {object} { success, term, lastLogIndex, ... }
   */
  handleAppendEntries(args) {
    const result = this.heartbeat.handleAppendEntries(args);

    // Reset election timer on any valid AppendEntries from leader
    if (args.term >= this.nodeState.currentTerm && result.success) {
      this._startElectionTimer();

      if (args.term > this.nodeState.currentTerm) {
        this.stateMachine.becomeFollower(args.term);
      }
    }

    // Become follower if we see higher term
    if (args.term > this.nodeState.currentTerm) {
      this.nodeState.currentTerm = args.term;
      this.nodeState.votedFor = null;
      this.stateMachine.becomeFollower(args.term);
    }

    return result;
  }

  /**
   * Handle replication success from a follower
   * @param {string} followerId - ID of follower
   * @param {number} lastLogIndex - Last log index on follower
   */
  handleReplicationSuccess(followerId, lastLogIndex) {
    if (!this.isLeader()) return;

    this.logReplication.recordReplication(followerId, lastLogIndex);

    // Try to advance commit index
    const advanced = this.logReplication.advanceCommitIndex(this.otherNodeIds);
    if (advanced) {
      this._processCommittedEntries();
    }
  }

  /**
   * Handle replication failure from a follower
   * @param {string} followerId - ID of follower
   * @param {number} conflictIndex - Optional conflict index hint
   */
  handleReplicationFailure(followerId, conflictIndex = null) {
    if (!this.isLeader()) return;

    this.logReplication.recordReplicationFailure(followerId, conflictIndex);
  }

  /**
   * Handle SyncLog RPC (catch-up synchronization)
   * Leader responds to follower sync request
   * @param {string} followerId - ID of requesting follower
   * @param {number} fromIndex - Starting index for sync
   * @returns {object} { success, entries, commitIndex, ... }
   */
  handleSyncLog(followerId, fromIndex) {
    if (!this.isLeader()) {
      return { success: false, term: this.nodeState.currentTerm };
    }

    return this.sync.handleSyncLog(followerId, fromIndex);
  }

  /**
   * Apply SyncLog response (follower receiving synced entries)
   * @param {string} leaderId - ID of leader
   * @param {array} entries - Entries from leader
   * @param {number} commitIndex - Leader's commit index
   * @returns {boolean} Success
   */
  applySyncLogResponse(leaderId, entries, commitIndex) {
    const result = this.sync.applySyncLog(leaderId, entries, commitIndex);

    if (result) {
      this._processCommittedEntries();
    }

    return result;
  }

  /**
   * Initiate SyncLog if out of sync
   * Returns sync request or null if in sync
   * @returns {object|null} SyncLog request or null
   */
  checkAndRequestSync(leaderId, prevLogIndex, prevLogTerm) {
    if (this.sync.isOutOfSync(prevLogIndex, prevLogTerm)) {
      const fromIndex = this.sync.getSyncStartIndex();
      this.logger.info('Out of sync, requesting sync', {
        leaderId,
        fromIndex,
      });

      return {
        followerId: this.nodeId,
        fromIndex,
      };
    }

    return null;
  }

  // ==================== CALLBACKS ====================

  /**
   * Register callback for when election is won
   */
  onElectionWon(callback) {
    this.callbacks.onElectionWon = callback;
  }

  /**
   * Register callback for when election starts
   */
  onElectionStarted(callback) {
    this.callbacks.onElectionStarted = callback;
  }

  /**
   * Register callback for when leader changes
   */
  onLeaderChanged(callback) {
    this.callbacks.onLeaderChanged = callback;
  }

  /**
   * Register callback for when entry is committed
   */
  onEntryCommitted(callback) {
    this.callbacks.onEntryCommitted = callback;
  }

  /**
   * Register callback for state changes
   */
  onStateChanged(callback) {
    this.callbacks.onStateChanged = callback;
  }

  // ==================== INTERNAL METHODS ====================

  /**
   * Handle state change event
   * @private
   */
  _onStateChange(newState, term) {
    if (this.callbacks.onStateChanged) {
      try {
        this.callbacks.onStateChanged(newState, term);
      } catch (err) {
        this.logger.error('Error in state change callback', { error: err.message });
      }
    }

    if (newState === CONSTANTS.STATES.LEADER && this.callbacks.onElectionWon) {
      try {
        this.callbacks.onElectionWon(term);
      } catch (err) {
        this.logger.error('Error in election won callback', { error: err.message });
      }
    }

    if (this.callbacks.onLeaderChanged) {
      try {
        this.callbacks.onLeaderChanged(newState === CONSTANTS.STATES.LEADER ? this.nodeId : null, term);
      } catch (err) {
        this.logger.error('Error in leader changed callback', { error: err.message });
      }
    }
  }

  /**
   * Become leader
   * @private
   */
  _becomeLeader() {
    const term = this.nodeState.currentTerm;
    this.stateMachine.becomeLeader(term);
    this.logger.electionWon(term);

    // Initialize leader state
    const lastLogIndex = this.nodeState.getLastLogIndex();
    this.otherNodeIds.forEach(followerId => {
      this.logReplication.initializeFollower(followerId, lastLogIndex);
    });

    // Start heartbeat timer
    this.timerService.stopElectionTimer();
    this.timerService.startHeartbeatTimer(() => this._sendHeartbeats());

    // Send initial heartbeats
    this._sendHeartbeats();
  }

  /**
   * Send heartbeats to all followers
   * @private
   */
  _sendHeartbeats() {
    if (!this.isLeader()) return;

    this.logger.heartbeatSent(this.nodeState.currentTerm, this.otherNodeIds.length);

    // Heartbeat data is prepared by the replica instances
    // This method just logs that heartbeats should be sent
  }

  /**
   * Start election timer
   * @private
   */
  _startElectionTimer() {
    this.timerService.startElectionTimer(() => this._onElectionTimeout());
  }

  /**
   * Handle election timeout
   * @private
   */
  _onElectionTimeout() {
    if (this.stateMachine.isLeader()) {
      // Leaders don't start elections
      return;
    }

    this.logger.info('Election timeout triggered');

    // Reset election state and request votes from other nodes
    this.election.resetElectionState();
    const requestVoteArgs = this.prepareRequestVote();
    this.stateMachine.becomeCandidate(this.nodeState.currentTerm);

    if (this.callbacks.onElectionStarted) {
      try {
        this.callbacks.onElectionStarted(requestVoteArgs);
      } catch (err) {
        this.logger.error('Error invoking election started callback', { error: err.message });
      }
    }

    // Start a new election timer for this attempt
    this._startElectionTimer();
  }

  /**
   * Process committed entries
   * Invoke callback for each newly committed entry
   * @private
   */
  _processCommittedEntries() {
    const unappliedEntries = this.logReplication.getUnappliedCommittedEntries();

    unappliedEntries.forEach(entry => {
      this.logger.entryCommitted(entry.index, entry.term, entry.type);

      if (this.callbacks.onEntryCommitted) {
        try {
          this.callbacks.onEntryCommitted({
            index: entry.index,
            term: entry.term,
            type: entry.type,
            data: entry.data,
          });
        } catch (err) {
          this.logger.error('Error in entry committed callback', {
            entryIndex: entry.index,
            error: err.message,
          });
        }
      }

      this.logReplication.markApplied(entry.index);
    });
  }

  /**
   * Prepare AppendEntries for a specific follower
   * Uses data from logReplication to determine what to send
   * @param {string} followerId - ID of follower
   * @returns {object} AppendEntries RPC arguments
   */
  prepareAppendEntries(followerId) {
    if (!this.isLeader()) return null;

    let nextIndex = this.nodeState.nextIndex[followerId];
    if (nextIndex === undefined) {
      nextIndex = this.nodeState.getLastLogIndex() + 1;
    }

    const prevLogIndex = nextIndex - 1;
    const prevLogTerm = prevLogIndex === -1
      ? 0
      : this.nodeState.getLogEntry(prevLogIndex)?.term || 0;

    const entries = this.logReplication.getEntriesToSend(followerId);

    return {
      term: this.nodeState.currentTerm,
      leaderId: this.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries: entries.map(e => ({
        index: e.index,
        term: e.term,
        type: e.type,
        data: e.data,
      })),
      leaderCommitIndex: this.nodeState.commitIndex,
    };
  }

  /**
   * Prepare election RequestVote
   * @returns {object} RequestVote RPC arguments
   */
  prepareRequestVote() {
    return this.election.startElection(this.nodeState.currentTerm);
  }

  /**
   * Get all committed strokes (for new clients)
   * @returns {array} Array of stroke entries
   */
  getCommittedStrokes() {
    return this.nodeState.log
      .filter((entry, idx) => idx <= this.nodeState.commitIndex && entry.type === 'stroke')
      .map(entry => ({
        index: entry.index,
        term: entry.term,
        data: entry.data,
      }));
  }

  /**
   * Persist state (to be implemented by replica storage layer)
   * Returns state object for persistence
   */
  getPersistentState() {
    return {
      currentTerm: this.nodeState.currentTerm,
      votedFor: this.nodeState.votedFor,
      log: this.nodeState.log.map((entry, idx) => {
        try {
          if (entry && typeof entry.toJSON === 'function') {
            return entry.toJSON();
          }
        } catch (err) {
          // If toJSON exists but throws or isn't callable, fallback to manual serialization
          this.logger.warn('Failed to serialize log entry via toJSON, falling back', {
            idx,
            entryType: typeof entry,
            error: err.message,
          });
        }

        return {
          index: entry?.index ?? idx,
          term: entry?.term ?? this.nodeState.currentTerm,
          type: entry?.type ?? null,
          data: entry?.data ?? null,
          createdAt: entry?.createdAt ?? new Date().toISOString(),
        };
      }),
    };
  }

  /**
   * Restore state from persistent storage
   * @param {object} state - Saved state object
   */
  restoreState(state) {
    if (state.currentTerm) {
      this.nodeState.currentTerm = state.currentTerm;
      this.termManager.currentTerm = state.currentTerm;
    }
    if (state.votedFor) {
      this.nodeState.votedFor = state.votedFor;
    }
    if (state.log && Array.isArray(state.log)) {
      const LogEntry = require('./models/logEntry');
      this.nodeState.log = state.log.map((entry) => {
        return LogEntry.fromJSON(entry);
      });
    }

    this.logger.info('State restored', {
      term: this.nodeState.currentTerm,
      logLength: this.nodeState.log.length,
    });
  }
}

module.exports = RaftCore;
