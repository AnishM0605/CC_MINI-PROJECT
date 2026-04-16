/**
 * Example Replica Server Implementation
 * This file shows how to use the RAFT Core in an Express server
 *
 * The third team member should adapt this for the actual replica instances
 * with proper Docker integration and state persistence
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const RaftCore = require('./index');

class ReplicaServer {
  constructor(nodeId, nodePort, otherNodes) {
    this.nodeId = nodeId;
    this.nodePort = nodePort;
    this.otherNodes = otherNodes; // Array of { id, url }

    // Initialize RAFT core
    const otherNodeIds = otherNodes.map(n => n.id).filter(id => id !== nodeId);
    this.raftCore = new RaftCore(nodeId, otherNodeIds);

    // State persistence
    this.stateFile = path.join(__dirname, `state-${nodeId}.json`);
    this.loadPersistedState();

    // Apply log tracking
    this.appliedIndices = new Set();

    // Express app
    this.app = express();
    this.app.use(express.json({ limit: '50mb' }));
    this.setupRoutes();

    // Register RAFT callbacks
    this.setupCallbacks();
  }

  /**
   * Setup all HTTP routes
   */
  setupRoutes() {
    // Client request: someone sends a stroke
    this.app.post('/client-request', this._handleClientRequest.bind(this));

    // RAFT RequestVote RPC
    this.app.post('/request-vote', this._handleRequestVote.bind(this));

    // RAFT AppendEntries RPC (heartbeat and log replication)
    this.app.post('/append-entries', this._handleAppendEntries.bind(this));

    // RAFT SyncLog RPC (catch-up sync)
    this.app.post('/sync-log', this._handleSyncLog.bind(this));

    // Health and status
    this.app.get('/health', this._handleHealth.bind(this));
    this.app.get('/status', this._handleStatus.bind(this));
    this.app.get('/snapshot', this._handleSnapshot.bind(this));

    // Broadcast from other replicas (leader broadcasts committed entries)
    this.app.post('/broadcast', this._handleBroadcast.bind(this));
  }

  /**
   * Setup RAFT event callbacks
   */
  setupCallbacks() {
    this.raftCore.onElectionWon((term) => {
      console.log(`[${this.nodeId}] WON ELECTION - TERM ${term}`);
      this.handleLeadershipGained(term);
    });

    this.raftCore.onElectionStarted((args) => {
      console.log(`[${this.nodeId}] Starting election for term ${args.term}`);
      this.requestVotes(args).catch(err => console.error('Election request failed:', err.message));
    });

    this.raftCore.onEntryCommitted((entry) => {
      console.log(`[${this.nodeId}] Entry committed:`, entry);
      this.handleEntryCommitted(entry);
    });

    this.raftCore.onStateChanged((state, term) => {
      console.log(`[${this.nodeId}] State: ${state}, Term: ${term}`);
    });
  }

  /**
   * RPC HANDLERS
   */

  async _handleClientRequest(req, res) {
    try {
      const { type, data } = req.body;

      if (!this.raftCore.isLeader()) {
        const leader = this.findLeader();
        return res.status(400).json({
          error: 'Not leader',
          leaderId: leader ? leader.id : null,
          leaderUrl: leader ? leader.url : null,
        });
      }

      const result = this.raftCore.clientRequest(type, data);
      if (!result) {
        return res.status(500).json({ error: 'Failed to append entry' });
      }

      // Immediately start replicating to followers
      this.replicateToFollowers();

      res.json({ success: true, index: result.index, term: result.term });
    } catch (err) {
      console.error('Error handling client request:', err);
      res.status(500).json({ error: err.message });
    }
  }

  async _handleRequestVote(req, res) {
    try {
      const result = this.raftCore.handleRequestVote(req.body);
      res.json(result);
    } catch (err) {
      console.error('Error handling request vote:', err);
      res.status(500).json({ error: err.message });
    }
  }

  async _handleAppendEntries(req, res) {
    try {
      const result = this.raftCore.handleAppendEntries(req.body);

      // If we're out of sync, request sync
      if (!result.success && req.body.entries?.length > 0) {
  const syncRequest = this.raftCore.checkAndRequestSync(
    req.body.leaderId,
    req.body.prevLogIndex,
    req.body.prevLogTerm
  );

  // ✅ FIX: prevent infinite sync loop
  if (syncRequest && syncRequest.fromIndex <= this.raftCore.log.length) {
    this.requestSyncLog(req.body.leaderId, syncRequest.fromIndex)
      .catch(err => {
        console.warn(`[${this.nodeId}] Sync request skipped/failed`);
      });
  }
}
      res.json(result);
    } catch (err) {
      console.error('Error handling append entries:', err.message);
      console.error(err.stack);
      res.status(500).json({ error: err.message });
    }
  }

  async _handleSyncLog(req, res) {
    try {
      const { followerId, fromIndex } = req.body;
      const result = this.raftCore.handleSyncLog(followerId, fromIndex);
      res.json(result);
    } catch (err) {
      console.error('Error handling sync log:', err);
      res.status(500).json({ error: err.message });
    }
  }

  _handleHealth(req, res) {
    res.json({
      nodeId: this.nodeId,
      healthy: true,
      info: this.raftCore.getNodeInfo(),
    });
  }

  _handleStatus(req, res) {
    res.json(this.raftCore.getNodeInfo());
  }

  _handleSnapshot(req, res) {
    const strokes = this.raftCore.getCommittedStrokes();
    res.json({ strokes });
  }

  _handleBroadcast(req, res) {
    // This would be called by leader to notify followers of committed entries
    // Can be used for additional state machine updates if needed
    const { entry } = req.body;
    console.log(`[${this.nodeId}] Broadcast received:`, entry);
    res.json({ success: true });
  }

  /**
   * LEADERSHIP ACTIONS
   */

  async handleLeadershipGained(term) {
    console.log(`[${this.nodeId}] Becoming leader in term ${term}`);

    // Notify gateway of new leader
    await this.notifyGatewayOfLeader();

    // Start regular replication
    this.startReplicationLoop();
  }

  /**
   * Entry committed: send to gateway for broadcast
   */
  async handleEntryCommitted(entry) {
    if (this.appliedIndices.has(entry.index)) {
      return; // Already applied
    }
    this.appliedIndices.add(entry.index);

    console.log(`[${this.nodeId}] APPLYING entry: type=${entry.type}, index=${entry.index}`);

    // If this is a stroke, send to gateway to broadcast to clients
    if (entry.type === 'stroke') {
      await this.broadcastToGateway(entry);
    }

    // Persist state
    this.persistState();
  }

  /**
   * NETWORK COMMUNICATION
   */

  async replicateToFollowers() {
    if (!this.raftCore.isLeader()) return;

    let otherNodeIds = this.raftCore.otherNodeIds;

    for (const nodeId of otherNodeIds) {
      let appendEntries = this.raftCore.prepareAppendEntries(nodeId);
      if (!appendEntries) continue;

      let node = this.otherNodes.find(n => n.id === nodeId);
      if (!node) continue;

      try {
        let response = await axios.post(`${node.url}/append-entries`, appendEntries, {
          timeout: 3000,
        });

        if (response.data.success) {
          this.raftCore.handleReplicationSuccess(nodeId, response.data.lastLogIndex);
        } else {
          this.raftCore.handleReplicationFailure(nodeId, response.data.conflictIndex);
        }
      } catch (err) {
        console.error(`Error replicating to ${nodeId}:`, err.name || 'AxiosError');
        console.error('  message:', err.message || err.toString());
        console.error('  code:', err.code || 'N/A');
        if (err.response) {
          console.error('  status:', err.response.status);
          console.error('  body:', err.response.data);
        }
        console.error('  config url:', err.config?.url);
        console.error(err.stack);
        this.raftCore.handleReplicationFailure(nodeId);
      }
    }
  }

  startReplicationLoop() {
    // Clear any existing loop
    if (this.replicationInterval) {
      clearInterval(this.replicationInterval);
    }

    this.replicationInterval = setInterval(() => {
      if (this.raftCore.isLeader()) {
        this.replicateToFollowers();
      } else {
        clearInterval(this.replicationInterval);
      }
    }, 50); // Replicate more frequently than heartbeat
  }

  async requestSyncLog(leaderId, fromIndex) {
    let leader = this.otherNodes.find(n => n.id === leaderId);
    if (!leader) return;

    try {
      let response = await axios.post(`${leader.url}/sync-log`, {
        followerId: this.nodeId,
        fromIndex,
      }, {
        timeout: 3000,
      });

      if (response.data.success) {
        this.raftCore.applySyncLogResponse(leaderId, response.data.entries, response.data.commitIndex);
      }
    } catch (err) {
      console.error('Sync log request failed:', err.name || 'AxiosError');
      console.error('  message:', err.message || err.toString());
      console.error('  code:', err.code || 'N/A');
      console.error('  config url:', err.config?.url);
      console.error(err.stack);
    }
  }

  async requestVotes(requestVoteArgs) {
    const votePromises = this.otherNodes.map(async (node) => {
      try {
        let response = await axios.post(`${node.url}/request-vote`, requestVoteArgs, { timeout: 3000 });
        let data = response.data;

        if (data.term > this.raftCore.getTerm()) {
          this.raftCore.nodeState.currentTerm = data.term;
          this.raftCore.nodeState.votedFor = null;
          this.raftCore.stateMachine.becomeFollower(data.term);
        }

        this.raftCore.recordVoteResponse(data.voteGranted);
      } catch (err) {
        console.warn(`[${this.nodeId}] Vote request to ${node.id} failed:`, err.name || 'AxiosError');
        console.warn('  message:', err.message || err.toString());
        console.warn('  code:', err.code || 'N/A');
        console.warn('  config url:', err.config?.url);
        console.warn(err.stack);
      }
    });

    await Promise.all(votePromises);
  }

  async notifyGatewayOfLeader() {
    try {
      // Notify gateway of new leader
      // Gateway would need an endpoint: POST /leader
      await axios.post('http://localhost:4000/leader', {
        leaderId: this.nodeId,
        leaderUrl: `http://localhost:${this.nodePort}`,
      });
    } catch (err) {
      console.error('Failed to notify gateway:', err.message);
    }
  }

  async broadcastToGateway(entry) {
    try {
      // Send committed stroke to gateway to broadcast to clients
      await axios.post('http://localhost:4000/broadcast', {
        type: 'stroke',
        data: entry.data,
      });
    } catch (err) {
      console.error('Failed to broadcast to gateway:', err.message);
    }
  }

  /**
   * PERSISTENCE
   */

  loadPersistedState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        const state = JSON.parse(data);
        this.raftCore.restoreState(state);
        console.log(`[${this.nodeId}] State restored from disk`);
      }
    } catch (err) {
      console.error('Error loading persisted state:', err);
    }
  }

  persistState() {
    try {
      const state = this.raftCore.getPersistentState();
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('Error persisting state:', err);
    }
  }

  /**
   * UTILITIES
   */

  findLeader() {
    const info = this.raftCore.getNodeInfo();
    if (info.state === 'LEADER') {
      return { id: this.nodeId, url: `http://localhost:${this.nodePort}` };
    }
    return null;
  }

  /**
   * START AND STOP
   */

  start() {
    this.raftCore.start();

    this.server = this.app.listen(this.nodePort, () => {
      console.log(`[${this.nodeId}] Server listening on port ${this.nodePort}`);
    });

    // Persist state periodically
    this.persistInterval = setInterval(() => {
      this.persistState();
    }, 5000);

    // Run election (RAFT handles this internally via timers)
  }

  stop() {
    this.raftCore.stop();

    if (this.server) {
      this.server.close();
    }
    if (this.replicationInterval) {
      clearInterval(this.replicationInterval);
    }
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
    }

    this.persistState();
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/*
To run this, create separate files for each replica:

// replica1.js
const ReplicaServer = require('./replica-server');

const replica1 = new ReplicaServer('replica1', 5001, [
  { id: 'replica2', url: 'http://localhost:5002' },
  { id: 'replica3', url: 'http://localhost:5003' },
]);

replica1.start();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down replica1...');
  replica1.stop();
  process.exit(0);
});

// Similar for replica2.js and replica3.js
*/

module.exports = ReplicaServer;
