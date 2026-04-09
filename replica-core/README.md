# RAFT Core Engine - Complete Implementation

Pure RAFT consensus logic implementation for distributed drawing board. This module contains **only the core RAFT protocol logic** with no HTTP, Express, or Docker dependencies.

## 📁 Folder Structure

```
replica-core/
├── raft/                          # Core RAFT algorithm components
│   ├── state.js                   # State machine (Follower/Candidate/Leader)
│   ├── election.js                # Leader election logic
│   ├── heartbeat.js               # Heartbeat and log matching
│   ├── logReplication.js          # Log replication and commit logic
│   └── sync.js                    # Catch-up synchronization for rejoining nodes
│
├── models/                        # Core data models
│   ├── logEntry.js                # Log entry representation
│   └── nodeState.js               # Complete node state
│
├── services/                      # Utility services
│   ├── termManager.js             # Term management and verification
│   └── timerService.js            # Election timers and heartbeat timers
│
├── utils/
│   └── logger.js                  # Structured logging
│
├── constants.js                   # RAFT protocol constants
├── index.js                       # Main RaftCore orchestrator (entry point)
├── INTEGRATION_GUIDE.md           # How to integrate with frontend/gateway
├── REPLICA_EXAMPLE.js             # Example replica server implementation
└── README.md                      # This file
```

## 🚀 Quick Start

### Installation

```javascript
// In your replica server file
const RaftCore = require('./replica-core');

// Create instance
const raftCore = new RaftCore('replica1', ['replica2', 'replica3']);

// Register event handlers
raftCore.onElectionWon((term) => {
  console.log('This node is now LEADER');
  notifyGateway();
});

raftCore.onEntryCommitted((entry) => {
  console.log('Entry committed:', entry);
  broadcastToClients(entry);
});

// Start RAFT
raftCore.start();
```

### Basic API

```javascript
// Check leadership
if (raftCore.isLeader()) {
  // Send client strokes
  const result = raftCore.clientRequest('stroke', strokeData);
}

// Handle incoming RPC responses
raftCore.handleRequestVote({ term, candidateId, lastLogIndex, lastLogTerm });
raftCore.handleAppendEntries({ term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommitIndex });
raftCore.handleSyncLog(followerId, fromIndex);

// Record responses
raftCore.recordVoteResponse(voteGranted);
raftCore.handleReplicationSuccess(followerId, lastLogIndex);
raftCore.handleReplicationFailure(followerId, conflictIndex);

// Get state
const info = raftCore.getNodeInfo();
const committed = raftCore.getCommittedStrokes();
```

## 📋 Core Components

### 1. **State Machine** (`raft/state.js`)
Manages node state transitions: FOLLOWER → CANDIDATE → LEADER

```javascript
// States
raftCore.stateMachine.getState()        // Returns: 'FOLLOWER', 'CANDIDATE', 'LEADER'
raftCore.stateMachine.isLeader()        // Boolean
raftCore.stateMachine.becomeFollower(term)
raftCore.stateMachine.becomeCandidate(term)
raftCore.stateMachine.becomeLeader(term)
```

### 2. **Election Logic** (`raft/election.js`)
Implements RAFT leader election with RequestVote RPC

```javascript
// Candidate initiates election
const voteRequest = raftCore.election.startElection(currentTerm);
// Returns: { term, candidateId, lastLogIndex, lastLogTerm }

// Follower votes (called by RPC handler)
const voteResp = raftCore.election.handleRequestVote(voteRequest);
// Returns: { voteGranted, term }

// Track votes
raftCore.election.recordVote(voteGranted);
raftCore.election.hasMajority()         // Boolean if we have ≥2 votes
```

**Election Properties:**
- Timeout: 500-800ms (random per follower)
- Heartbeat: 150ms (from leader)
- Quorum: 2 out of 3 nodes

### 3. **Heartbeat Logic** (`raft/heartbeat.js`)
Handles AppendEntries RPC for heartbeats and log replication

```javascript
// Leader sends heartbeats
const appendEntries = raftCore.heartbeat.prepareHeartbeat(followerId);

// Follower receives
const response = raftCore.heartbeat.handleAppendEntries({
  term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommitIndex
});
// Returns: { success, term, lastLogIndex }

// On success: update replication progress
raftCore.handleReplicationSuccess(followerId, lastLogIndex);
// On failure: back off and retry
raftCore.handleReplicationFailure(followerId);
```

**Key Guarantees:**
- Log matching property enforced
- Entries never overwritten once committed
- Heartbeat resets election timer on followers

### 4. **Log Replication** (`raft/logReplication.js`)
Manages stroke log replication and commit advancement

```javascript
// Leader appends client request to log
const result = raftCore.logReplication.handleClientRequest('stroke', data);
// Returns: { index, term, entry }

// Leader tracks replication progress
raftCore.logReplication.recordReplication(followerId, lastLogIndex);
raftCore.logReplication.recordReplicationFailure(followerId);

// Advance commit index when majority replicates
const advanced = raftCore.logReplication.advanceCommitIndex([otherNodeIds]);

// Retrieve entries for sending
const entries = raftCore.logReplication.getEntriesToSend(followerId);

// Check what's committed
const committed = raftCore.logReplication.getUnappliedCommittedEntries();
```

**Commit Rules:**
- Entry must be in current leader's term
- Majority (≥2) must acknowledge
- All earlier entries are also committed

### 5. **Sync Logic** (`raft/sync.js`)
Handles catch-up synchronization for restarted/rejoining nodes

```javascript
// Follower detects it's out of sync
const syncRequest = raftCore.checkAndRequestSync(leaderId, prevLogIndex, prevLogTerm);
// Returns: { followerId, fromIndex } or null

// Leader responds with all committed entries from an index
const response = raftCore.handleSyncLog(followerId, fromIndex);
// Returns: { success, entries, commitIndex }

// Follower applies the sync response
raftCore.applySyncLogResponse(leaderId, entries, commitIndex);
```

**Catch-Up Process:**
1. Restarted node starts with empty log
2. Leader's AppendEntries fails (log mismatch)
3. Node requests sync from leader
4. Leader sends all committed entries
5. Node appends and is now in sync

### 6. **Term Manager** (`services/termManager.js`)
Manages RAFT terms and critical term update logic

```javascript
raftCore.termManager.getTerm()           // Current term
raftCore.termManager.incrementTerm()     // For election
raftCore.termManager.updateTerm(newTerm) // If higher term seen

// Register for term change events
raftCore.termManager.onTermChange((newTerm) => {
  // Handle term change
});
```

**Term Safety:**
- Higher term always wins
- On higher term: become follower, reset votedFor
- Terms monotonically increase

### 7. **Timer Service** (`services/timerService.js`)
Manages election timeout and heartbeat timers

```javascript
// Followers use election timer
raftCore.timerService.startElectionTimer(() => {
  // Trigger election on timeout
});
raftCore.timerService.resetElectionTimer(() => {
  // Reset when heartbeat received
});

// Leaders use heartbeat timer
raftCore.timerService.startHeartbeatTimer(() => {
  // Send heartbeats
});

raftCore.timerService.cleanup()  // On shutdown
```

**Timing Constants:**
- Election timeout: 500-800ms (randomized)
- Heartbeat interval: 150ms
- Ensures elections don't overlap

### 8. **Node State** (`models/nodeState.js`)
Complete node persistent and volatile state

```javascript
// Persistent state (save to disk)
raftCore.nodeState.currentTerm
raftCore.nodeState.votedFor
raftCore.nodeState.log              // Array of LogEntry

// Volatile state
raftCore.nodeState.commitIndex      // Highest committed entry
raftCore.nodeState.lastApplied      // Highest applied entry
raftCore.nodeState.nextIndex        // For each follower (leader only)
raftCore.nodeState.matchIndex       // For each follower (leader only)

// Utilities
raftCore.nodeState.getLastLogIndex()
raftCore.nodeState.getLastLogTerm()
raftCore.nodeState.appendEntry(entry)
raftCore.nodeState.getEntriesFrom(index)
raftCore.nodeState.removeEntriesFrom(index)
```

## 🔄 Event Callbacks

Register callbacks for important RAFT events:

```javascript
// Called when this node wins election
raftCore.onElectionWon((term) => {
  console.log('LEADER elected in term', term);
  broadcastToGateway({ leaderId: 'replica1', term });
});

// Called when entry is committed
raftCore.onEntryCommitted((entry) => {
  console.log('Entry committed:', entry);
  applyToStateMachine(entry);
});

// Called when state changes (FOLLOWER/CANDIDATE/LEADER)
raftCore.onStateChanged((state, term) => {
  console.log(`Now ${state} in term ${term}`);
});

// Called when leader changes
raftCore.onLeaderChanged((leaderId, term) => {
  if (leaderId) {
    console.log(`New leader: ${leaderId} in term ${term}`);
  }
});
```

## 🌐 Integration with Frontend/Gateway

### Message Flow

```
Frontend (Browser)
    ↓ WebSocket
Gateway (Port 3000/4000)
    ↓ HTTP
Replica Instance (Port 5001/5002/5003)
    ↓ Uses
RAFT Core (Pure Logic)
```

### HTTP Endpoint Mapping

| Endpoint | Purpose | RAFT Core Method |
|----------|---------|------------------|
| `POST /client-request` | Client stroke | `clientRequest()` |
| `POST /request-vote` | Election vote | `handleRequestVote()` |
| `POST /append-entries` | Log replication | `handleAppendEntries()` |
| `POST /sync-log` | Catch-up sync | `handleSyncLog()` |
| `GET /snapshot` | Initial data | `getCommittedStrokes()` |
| `GET /health` | Status | `getNodeInfo()` |

### Example: Stroke Submission

```javascript
// Frontend sends stroke to Gateway WebSocket
{ type: "stroke", data: { x1, y1, x2, y2, color, ... } }

// Gateway forwards to Leader via HTTP
POST /client-request
{ "type": "stroke", "data": {...} }

// Replica (Leader)
const result = raftCore.clientRequest('stroke', data);
// Sends AppendEntries to followers
// When majority acks, entry is committed
// Replica broadcasts to Gateway

// Gateway broadcasts to all clients WebSocket
{ type: "stroke", data: {...} }

// All frontends render stroke
```

## 💾 State Persistence

Save and restore RAFT state:

```javascript
// Save state to disk (do periodically)
const persistentState = raftCore.getPersistentState();
// Contains: { currentTerm, votedFor, log }
fs.writeFileSync('state.json', JSON.stringify(persistentState));

// Restore on startup (BEFORE calling start())
const saved = JSON.parse(fs.readFileSync('state.json'));
raftCore.restoreState(saved);
raftCore.start();
```

**What to persist:**
- `currentTerm` - Must never decrease
- `votedFor` - Don't vote twice per term
- `log` - The stroke history

**What NOT to persist:**
- `commitIndex` - Will be rebuilt by replicas
- `state` - Will be reelected
- `nextIndex/matchIndex` - Leader-specific

## 🧪 Common Scenarios

### Scenario 1: Normal Operation (No Failures)

```
1. Client sends stroke to leader
2. Leader appends to log (index 5)
3. Leader sends AppendEntries to followers
4. Followers append to logs, respond success
5. Leader receives 2 successes (majority)
6. Leader commits entry 5
7. Follower commits entry 5
8. All nodes apply stroke to canvas
```

### Scenario 2: Leader Failure

```
1. Leader crashes
2. Followers don't receive heartbeat
3. Election timeout fires on follower
4. Follower becomes candidate, increments term
5. Candidate requests votes from others
6. Receives 2 votes (majority), becomes leader
7. New leader sends heartbeats
8. Clients detect old leader down, connect to new
```

### Scenario 3: Restarted Node Rejoins

```
1. Node restores persisted state (term, log)
2. Receives AppendEntries from leader
3. prevLogIndex check fails (node is behind)
4. checkAndRequestSync() triggers
5. Sends SyncLog request to leader
6. Leader sends all committed entries from that index
7. Node appends all entries in order
8. Node is now caught up and participates normally
```

### Scenario 4: Network Partition

```
Minority partition:
- Follows old (crashed) leader
- Can't reach majority
- Elections fail continuously
- Cannot commit new entries

Majority partition:
- Can reach quorum
- Elects new leader
- Commits new entries normally
- Sends heartbeats

When healed:
- Minority partition syncs from majority leader
- Acknowledges higher term
- Becomes follower
```

## 📊 Protocol Constants

Located in `constants.js`:

```javascript
// Timing
ELECTION_TIMEOUT_MIN: 500      // ms
ELECTION_TIMEOUT_MAX: 800      // ms
HEARTBEAT_INTERVAL: 150        // ms

// Cluster
QUORUM_SIZE: 2                 // For 3 nodes

// State constants
STATES: {
  FOLLOWER: 'FOLLOWER',
  CANDIDATE: 'CANDIDATE',
  LEADER: 'LEADER'
}
```

## 🔍 Logging

All core operations are logged:

```javascript
raftCore.logger.info('Message', { data })
raftCore.logger.warn('Warning', { data })
raftCore.logger.error('Error', { data })

// RAFT-specific logs
raftCore.logger.electionStarted(term)
raftCore.logger.electionWon(term)
raftCore.logger.stateTransition(oldState, newState, term)
raftCore.logger.entryCommitted(index, term, type)
```

Enable debug logging:

```bash
DEBUG=true node replica.js
```

## 🛠️ Testing The RAFT Core

### Unit Tests Example

```javascript
// Test election logic
const { Election } = require('./raft/election');
const election = new Election('node1', nodeState, termManager, logger);

// Test vote granting
const response = election.handleRequestVote({
  term: 1,
  candidateId: 'node2',
  lastLogIndex: 5,
  lastLogTerm: 1
});
assert(response.voteGranted === true);
```

### Integration Test Example

```javascript
// Simulate multi-node scenario
const node1 = new RaftCore('node1', ['node2', 'node3']);
const node2 = new RaftCore('node2', ['node1', 'node3']);
const node3 = new RaftCore('node3', ['node1', 'node2']);

node1.start();
node2.start();
node3.start();

// Wait for election
setTimeout(() => {
  // Should have one leader
  const leaders = [node1, node2, node3].filter(n => n.isLeader());
  assert(leaders.length === 1);
}, 1000);

// Send stroke to leader
const leader = leaders[0];
const result = leader.clientRequest('stroke', { x: 10, y: 20 });

// Should replicate to others
setTimeout(() => {
  assert(node1.nodeState.log.length === node2.nodeState.log.length);
}, 500);
```

## 🚨 Error Handling

The RAFT core handles errors gracefully:

- **Invalid RPC from old term**: Discarded
- **Log mismatch**: Backs off and retries with earlier entries
- **Node out of sync**: Requests full catch-up
- **Callback errors**: Logged but don't crash consensus
- **Network errors**: Handled by replica implementation

## 📝 Notes for Team Members

### For Replica Implementation (Team 3)

1. **Create replica servers** using the `REPLICA_EXAMPLE.js` template
2. **HTTP endpoints** must map correctly to RAFT methods
3. **Handle responses** from other replicas and call appropriate RAFT methods
4. **Persist state** to prevent losing committed entries
5. **Run heartbeat loop** at 150ms intervals (leader only)
6. **Notify gateway** when leadership changes
7. **Use Docker** with bind mounts for hot reload

### For Gateway Update (Team 1)

Consider adding:
1. `POST /leader` endpoint to notify of leader changes
2. `POST /broadcast` endpoint to receive committed entries
3. Leader health checks to detect failures
4. Better error responses from replicas

### Key Debugging

If leadership doesn't change:
- Check election timeouts (500-800ms)
- Verify RequestVote RPC is being sent
- Check vote counting

If strokes don't replicate:
- Check AppendEntries RPC format
- Verify log matching (prevLogIndex/prevLogTerm)
- Check sync mechanism for lagging followers

If node won't rejoin:
- Check restoreState() call order
- Verify SyncLog mechanism
- Check network connectivity

## 📚 References

- [RAFT Consensus Algorithm](https://raft.github.io/)
- [Extended Raft (optimizations)](https://raft.github.io/raftpaper/raft-extended.pdf)
- Project specification: See `INTEGRATION_GUIDE.md`

---

**RAFT Core is pure consensus logic.** HTTP routing, Docker, and deployment are handled by the replica instances and DevOps setup.
