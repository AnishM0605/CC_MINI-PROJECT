/**
 * Replica Server Implementation
 * This file shows how to use the RAFT Core in an Express server
 *
 * Adapted for Docker with service names
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const RaftCore = require('./raft-core');

class ReplicaServer {
  constructor(nodeId, nodePort, otherNodes) {
    this.nodeId = nodeId;
    this.nodePort = nodePort;
    this.otherNodes = otherNodes; // Array of { id, url }

    // Initialize RAFT core
    this.otherNodeIds = otherNodes.map(n => n.id).filter(id => id !== nodeId);
    this.raftCore = new RaftCore(nodeId, this.otherNodeIds);

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
          leader: leader ? leader.url : null,
        });
      }

      const result = this.raftCore.clientRequest(type, data);
      if (!result) {
        return res.status(400).json({ error: 'Failed to append entry' });
      }

      res.json({
        success: true,
        index: result.index,
        term: result.term,
      });
    } catch (err) {
      console.error('Client request error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async _handleRequestVote(req, res) {
    try {
      const args = req.body;
      const result = this.raftCore.handleRequestVote(args);
      res.json(result);
    } catch (err) {
      console.error('RequestVote error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async _handleAppendEntries(req, res) {
    try {
      const args = req.body;
      // Only log if there are actual entries (not just heartbeats)
      if (args.entries && args.entries.length > 0) {
        console.log(`[${this.nodeId}] Replicating ${args.entries.length} entries from ${args.leaderId}`);
      }
      const result = this.raftCore.handleAppendEntries(args);

      // If this is a heartbeat (no entries), just respond
      if (!args.entries || args.entries.length === 0) {
        return res.json(result);
      }

      // For log replication, handle success/failure
      if (result.success) {
        this.raftCore.handleReplicationSuccess(args.leaderId, result.lastLogIndex);
      } else {
        this.raftCore.handleReplicationFailure(args.leaderId, result.conflictIndex);
      }

      res.json(result);
    } catch (err) {
      console.error('AppendEntries error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async _handleSyncLog(req, res) {
    try {
      const { followerId, fromIndex } = req.body;
      const result = this.raftCore.handleSyncLog(followerId, fromIndex);
      res.json(result);
    } catch (err) {
      console.error('SyncLog error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  _handleHealth(req, res) {
    res.json({
      status: 'healthy',
      nodeId: this.nodeId,
      state: this.raftCore.getState(),
      term: this.raftCore.getTerm(),
    });
  }

  _handleStatus(req, res) {
    const info = this.raftCore.getNodeInfo();
    res.json(info);
  }

  _handleSnapshot(req, res) {
    const strokes = this.raftCore.getCommittedStrokes();
    res.json({ strokes });
  }

  async _handleBroadcast(req, res) {
    // This endpoint is for inter-replica communication
    // In our architecture, committed entries are broadcast via gateway
    res.json({ success: true });
  }

  /**
   * EVENT HANDLERS
   */

  async handleLeadershipGained(term) {
    console.log(`[${this.nodeId}] Became leader in term ${term}`);

    // Safety check: ensure otherNodeIds is initialized
    if (!this.otherNodeIds || this.otherNodeIds.length === 0) {
      console.error(`[${this.nodeId}] ERROR: otherNodeIds not properly initialized!`);
      return;
    }

    // Initialize follower state tracking
    this.followerRetries = {};
    this.followerBackoffUntil = {};
    this.otherNodeIds.forEach(nodeId => {
      this.followerRetries[nodeId] = 0;
      this.followerBackoffUntil[nodeId] = 0;
    });

    // Notify gateway of new leader
    await this.notifyGatewayOfLeader();

    // Start replication loop
    this.startReplicationLoop();
  }

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

    const now = Date.now();
    const otherNodeIds = this.raftCore.otherNodeIds;

    for (const nodeId of otherNodeIds) {
      // ALWAYS send heartbeat (even during backoff), but skip full replication
      const inBackoff = this.followerBackoffUntil[nodeId] && now < this.followerBackoffUntil[nodeId];

      let appendEntries = this.raftCore.prepareAppendEntries(nodeId);
      if (!appendEntries) continue;

      // If in backoff and this contains entries, skip it (heartbeat-only will be sent)
      if (inBackoff && appendEntries.entries && appendEntries.entries.length > 0) {
        continue;
      }

      let node = this.otherNodes.find(n => n.id === nodeId);
      if (!node) continue;

      try {
        let response = await axios.post(`${node.url}/append-entries`, appendEntries, {
          timeout: 6000,
        });

        if (response.data.success) {
          this.raftCore.handleReplicationSuccess(nodeId, response.data.lastLogIndex);
          // Reset retry counter on success
          this.followerRetries[nodeId] = 0;
          this.followerBackoffUntil[nodeId] = 0;
        } else {
          // Replication failed - check if sync is needed
          this.raftCore.handleReplicationFailure(nodeId, response.data.conflictIndex);
          this.followerRetries[nodeId]++;

          // Exponential backoff: 100ms * 2^retries, capped at 5s
          const backoffMs = Math.min(100 * Math.pow(2, this.followerRetries[nodeId]), 5000);
          this.followerBackoffUntil[nodeId] = now + backoffMs;

          // Check if we need to request sync for this follower
          const syncRequest = this.raftCore.checkAndRequestSync(
            this.nodeId,  // leaderId
            appendEntries.prevLogIndex,
            appendEntries.prevLogTerm
          );

          if (syncRequest) {
            console.log(`[${this.nodeId}] Requesting sync for ${nodeId} from index ${syncRequest.fromIndex}`);
            this.requestSyncLog(nodeId, syncRequest.fromIndex)
              .catch(err => {
                console.warn(`[${this.nodeId}] Sync request failed for ${nodeId}`);
              });
          }
        }
      } catch (err) {
        // Increment retry counter on error
        this.followerRetries[nodeId]++;

        // Exponential backoff: 100ms * 2^retries, capped at 5s
        const backoffMs = Math.min(100 * Math.pow(2, this.followerRetries[nodeId]), 5000);
        this.followerBackoffUntil[nodeId] = now + backoffMs;

        console.warn(`[${this.nodeId}] Error replicating to ${nodeId}: ${err.code || err.name} (attempt ${this.followerRetries[nodeId]}, backoff ${backoffMs}ms)`);
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
    }, 100); // Replicate every 100ms instead of 50ms to reduce load
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
      await axios.post('http://gateway:4000/leader', {
        leaderId: this.nodeId,
        leaderUrl: `http://${this.nodeId}:${this.nodePort}`,
      });
    } catch (err) {
      console.error('Failed to notify gateway:', err.message);
    }
  }

  async broadcastToGateway(entry) {
    try {
      // Send committed stroke to gateway to broadcast to clients
      await axios.post('http://gateway:4000/broadcast', {
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
      return { id: this.nodeId, url: `http://${this.nodeId}:${this.nodePort}` };
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

module.exports = ReplicaServer;
