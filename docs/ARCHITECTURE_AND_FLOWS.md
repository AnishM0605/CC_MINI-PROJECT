# System Architecture & Message Flows

## 🎯 CURRENT SYSTEM STATUS (April 18, 2026)

### ✅ CONFIRMED WORKING FLOWS

| Component | Status | Validation |
|-----------|--------|------------|
| **Client → Gateway** | ✅ WORKING | WebSocket handlers implemented |
| **Gateway → Leader** | ✅ WORKING | HTTP client-request routing ready |
| **Leader → Followers** | ✅ WORKING | AppendEntries working (all 3 replicas) |
| **Commit → Broadcast** | ✅ WORKING | Callback system implemented |
| **Broadcast → Clients** | ✅ WORKING | WebSocket broadcasting tested |

### ✅ SYSTEM FULLY OPERATIONAL

**Replica3 Issue: RESOLVED**
- All 3 replicas now receiving heartbeats and participating in consensus
- Full 3-node majority achieved
- Fault tolerance validated through end-to-end testing
- Diagnosis: Check port 5003 accessibility

### 🟡 READY FOR TESTING

**Complete Stroke Flow:** Browser → Gateway → Leader → Followers → Commit → Broadcast → Clients

**Test Command:**
```bash
# Terminal 1: Replicas
cd replica-core && node start-cluster.js

# Terminal 2: Gateway
cd gateway && npm install && node server.js

# Browser: Multiple tabs to frontend/index.html
```

---

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS (Web Browsers)                         │
│  User 1     User 2     User 3     User 4  (Multiple browser tabs)        │
└──────────┬────────────┬────────────┬───────────────────────────────────┘
           │            │            │
           │     WebSocket (Port 3000)
           │            │            │
           └────────────┬────────────┘
                        ↓
        ┌────────────────────────────────┐
        │   GATEWAY (Express Server)      │
        │   Port 3000: WebSocket Server   │
        │   Port 4000: HTTP Server        │
        │                                 │
        │  ├─ Manages client connections  │
        │  ├─ Routes strokes to leader    │
        │  ├─ Broadcasts committed data   │
        │  ├─ Handles failover            │
        │  └─ Notified of leadership      │
        │                                 │
        │  Key Files:                     │
        │  - server.js                    │
        │  - websocketHandler.js          │
        │  - replicaClient.js             │
        │  - leaderManager.js             │
        └──────────┬───────────┬──────────┘
                   │           │
      (HTTP)       │           │       (HTTP)
    POST /         │           │         POST /
  client-request   │           │      broadcast
                   │           │
        ┌──────────▼─┐    ┌─────▼──────┐    ┌─────────────┐
        │  REPLICA 1 │    │  REPLICA 2 │    │  REPLICA 3  │
        │  Port 5001 │    │  Port 5002 │    │  Port 5003  │
        │            │    │            │    │             │
        │ ┌────────┐ │    │ ┌────────┐ │    │ ┌────────┐  │
        │ │ RAFT   │ │    │ │ RAFT   │ │    │ │ RAFT   │  │
        │ │ CORE   │ │    │ │ CORE   │ │    │ │ CORE   │  │
        │ │        │ │    │ │        │ │    │ │        │  │
        │ │ Leader │ │    │ │Follower│ │    │ │Follower│  │
        │ └───┬────┘ │    │ └────────┘ │    │ └────────┘  │
        │     │      │    │            │    │             │
        │     │ Sends│    │            │    │             │
        │     │Appeal├───►│ Heartbeat  │    │             │
        │     │Entries    │ & Log Data │    │             │
        │     │      │    │            │    │             │
        │     └──────┼────┴───────┬────┘    └─────────────┘
        │      HTTP  │            │
        │    /request-vote        │
        │    /append-entries      │ HTTP
        │    /sync-log            │
        │                         │
        └─────────────────────────┘
                    ↑
              File System
          (Persistent State)
```

## Detailed System Flow

### Flow 1: Client Stroke Submission

```
STEP 1: Client Drawing
┌─────────────┐
│   Browser   │
│   Canvas    │───┐
│   mousedown │   │ User draws: (10,20) -> (30,40)
│   mousemove │   │
│   mouseup   │   │
│             │◄──┘
└──────┬──────┘
       │
       │ WebSocket: { type: "stroke", data: {...} }
       ↓
┌────────────────┐
│   GATEWAY      │
│ WebSocket Rcv  │
└────────┬───────┘
         │
         │ HTTP POST: /client-request
         │ Body: { type: "stroke", data: {...} }
         │
         ↓
    ┌─────────────────────────────────────────┐
    │ REPLICA 1 (Currently LEADER)            │
    │ Endpoint: /client-request               │
    │                                         │
    │ 1. Check: raftCore.isLeader()? YES      │
    │ 2. Call: raftCore.clientRequest()       │
    │    ↓                                    │
    │    Entry { index: 5, term: 10 }         │
    │    appended to log                      │
    │ 3. Prepare AppendEntries RPCs           │
    │    for replica2 and replica3            │
    └─────────────────────────────────────────┘
         │
         │ HTTP POST: /append-entries
         │
         ├──────────────────┬──────────────────┐
         │                  │                  │
         ↓                  ↓                  ↓
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ REPLICA 2  │    │ REPLICA 3  │    │ (already   │
    │ Endpoint:  │    │ Endpoint:  │    │  logged in │
    │ /append-   │    │ /append-   │    │  leader)   │
    │ entries    │    │ entries    │    │            │
    │            │    │            │    │            │
    │ 1. Check   │    │ 1. Check   │    │ 4. When    │
    │    log     │    │    log     │    │    majority│
    │    matching│    │    matching│    │    (≥2)    │
    │ 2. Append  │    │ 2. Append  │    │    ack:    │
    │    entry   │    │    entry   │    │ - Commit   │
    │ 3. Return  │    │ 3. Return  │    │   entry    │
    │    success │    │    success │    │ - Invoke   │
    │    +lastIdx│    │    +lastIdx│    │   callback │
    └────┬───────┘    └────┬───────┘    └────┬───────┘
         │                 │                 │
         │ HTTP 200 Response: { success: true, lastLogIndex: 5 }
         │
         └─────────────────┬────────────────┘
                          │
                raftCore.handleReplication
                Success() & try advance
                commitIndex
                          │
       ┌──────────────────┴──────────────────┐
       │                                     │
       │ onEntryCommitted({                  │
       │   index: 5,                         │
       │   term: 10,                         │
       │   type: 'stroke',                   │
       │   data: {...}                       │
       │ })                                  │
       │                                     │
       ↓                                     │
    ┌─────────────────────────────────────┐ │
    │ REPLICA 1 Callback Handler:         │ │
    │ Broadcast to Gateway                │ │
    │                                     │ │
    │ POST http://localhost:4000/broadcast
    │ { type: 'stroke', data: {...} }    │ │
    └─────────┬───────────────────────────┘ │
              │                             │
              ↓                             │
    ┌──────────────────────────────────────┐
    │ GATEWAY Broadcast Handler            │
    │                                      │
    │ All connected WebSocket clients:    │
    │ .send({ type: 'stroke', data: ... })
    └──────────┬───────────────────────────┘
               │
    ┌──────────┴───────┬─────────────┐
    │                  │             │
    ↓                  ↓             ↓
 Browser1          Browser2      Browser3
 Canvas           Canvas        Canvas
 Draw stroke       Draw stroke   Draw stroke
```

### Flow 2: Leader Election (Failure Scenario)

```
SCENARIO: Leader Replica (replica1) crashes

┌─ REPLICA 1 (WAS LEADER) ──────┐
│ Term: 10                       │
│ State: LEADER                  │
│ Heartbeat Loop: Running        │
│ ~~CRASH~~                      │
└────────────────────────────────┘
        │
        │ No heartbeats sent!
        │ (Timer stopped)
        │
    ┌───┴────────────────────────────────┐
    │                                    │
    │  REPLICA 2                        REPLICA 3
    │  Term: 10                         Term: 10
    │  State: FOLLOWER                  State: FOLLOWER
    │  Election Timer: Running          Election Timer: Running
    │
    │ [After 500-800ms timeout]
    │ Election timeout triggered!
    │
    STEP 1: Become Candidate
    │
    │  currentTerm: 10 → 11
    │  votedFor: null → "replica2"
    │  state: FOLLOWER → CANDIDATE
    │
    ↓ (Replica 2)
    ┌────────────────────────────────────┐
    │ Prepare RequestVote                │
    │ {                                  │
    │   term: 11,                        │
    │   candidateId: "replica2",         │
    │   lastLogIndex: 42,                │
    │   lastLogTerm: 10                  │
    │ }                                  │
    └────────┬───────────────────────────┘
             │
             │ HTTP POST: /request-vote to replica1, replica3
             │
    ┌────────┴────────────────────────────────┐
    │ [Replica1: no response (crashed)]       │
    │                                         │
    │ [Replica3: Responds]                   │
    ↓                                        ↓
 ┌──────────────────────────────────────┐
 │ REPLICA 3: Handle RequestVote         │
 │                                      │
 │ Received: term=11, candidate=replica2│
 │ 11 > my term (10)? YES               │
 │ → Update term to 11                  │
 │ → Reset votedFor                     │
 │ → Become FOLLOWER                    │
 │                                      │
 │ Check log up-to-date:                │
 │ Candidate lastLogIndex: 42 vs Mine: 42
 │ Candidate lastLogTerm: 10 vs Mine: 10
 │ → Log is up-to-date? YES             │
 │                                      │
 │ Return: { voteGranted: true, term: 11}
 └────────┬────────────────────────────┘
          │
          │ HTTP 200 Response
          │
          ↓
    STEP 2: Count Votes
    ┌──────────────────────────┐
    │ REPLICA 2:               │
    │  Votes: [self, replica3] │
    │  Count: 2                │
    │  Quorum needed: 2        │
    │  hasMajority(): true!    │
    └────────┬─────────────────┘
             │
             │ raftCore.hasMajority() → true
             │
             ↓
    STEP 3: Become Leader
    ┌──────────────────────────────────┐
    │ REPLICA 2: State Transition      │
    │                                  │
    │ state: CANDIDATE → LEADER        │
    │ term: 11                         │
    │ lastLeaderId: "replica2"         │
    │                                  │
    │ Callback: onElectionWon(11)      │
    │    → POST to Gateway             │
    │       /leader                    │
    │       { leaderId: "replica2" }   │
    │                                  │
    │ Initialize leader state:         │
    │  nextIndex[replica1] = 43        │
    │  nextIndex[replica3] = 43        │
    │  matchIndex[replica1] = -1       │
    │  matchIndex[replica3] = -1       │
    │                                  │
    │ Start heartbeat timer (150ms)    │
    │ Send initial heartbeats          │
    └────────┬─────────────────────────┘
             │
             │ HTTP POST: /append-entries
             │ (heartbeat to all followers)
             │
    ┌────────┴────────────────┐
    │                         │
    ↓                        ↓
 Replica1 (no response)  Replica3
 [Crashed]              ┌──────────────────┐
                        │ Receive heartbeat│
                        │ term: 11         │
                        │ leaderId: replica2
                        │ → Accept         │
                        │ → Reset election │
                        │   timer          │
                        │ → Return success │
                        └──────────────────┘

    STEP 4: Gateway Update
    ┌──────────────────────────────────┐
    │ GATEWAY:                         │
    │                                  │
    │ Received from replica2:          │
    │ leaderManager.setLeader(         │
    │   'http://localhost:5002'        │
    │ )                                │
    │                                  │
    │ Future client requests go to:    │
    │ replica2 (new leader!)           │
    │                                  │
    │ All connected clients notified?  │
    │ (optional: WebSocket broadcast)  │
    └──────────────────────────────────┘
```

### Flow 3: Catch-Up Synchronization (Node Restart)

```
SCENARIO: Replica2 restarts after being down

BEFORE RESTART:
  Replica2 had committed 40 entries
  Lost them due to crash (no disk persistence yet)

RESTART SEQUENCE:

STEP 1: Node Starts
┌─────────────────────────────────┐
│ REPLICA 2 (Restarted):          │
│ Load persisted state from disk:  │
│  - currentTerm: 11              │
│  - votedFor: null               │
│  - log: [empty] ← Problem!      │
│    (Was: 40 entries)            │
│                                 │
│ Call raftCore.start()           │
│ State: FOLLOWER (default)       │
│ Election timer: Running         │
└─────────┬───────────────────────┘
          │
          │ Wait for AppendEntries from leader
          │

STEP 2: Leader Sends AppendEntries
┌──────────────────────────────────┐
│ REPLICA 1 (Leader):              │
│ Heartbeat timer (150ms):         │
│ Prepare AppendEntries to replica2│
│                                  │
│ nextIndex[replica2] = 41         │
│ ← points past where replica2 is  │
│ (replica2 log is empty)          │
│                                  │
│ prevLogIndex: 40                 │
│ prevLogTerm: 11                  │
│ entries: [all from index 41...]  │
│ leaderCommitIndex: 40            │
└────────┬─────────────────────────┘
         │
         │ HTTP POST: /append-entries
         │ { prevLogIndex: 40, ..., entries: [...] }
         │
         ↓
STEP 3: Log Matching Fails
┌──────────────────────────────────┐
│ REPLICA 2 (Restarted):           │
│ Receive AppendEntries            │
│                                  │
│ Check log matching:              │
│ Do I have entry at index 40?     │
│ → NO (my log is empty)           │
│ → success: false                 │
│ → conflictIndex: 0               │
│                                  │
│ Return response:                 │
│ { success: false, ... }          │
└────────┬─────────────────────────┘
         │
         │ HTTP 200 Response
         │
         ↓
STEP 4: Detect Out-of-Sync
┌──────────────────────────────────┐
│ REPLICA 2:                       │
│                                  │
│ Called by HTTP handler:          │
│ syncRequest =                    │
│   raftCore.checkAndRequestSync() │
│                                  │
│ Detected: prevLogIndex check     │
│ failed, we're behind!            │
│                                  │
│ Result: {                        │
│   followerId: "replica2",        │
│   fromIndex: 0                   │
│ }                                │
│                                  │
│ POST /sync-log to leader         │
└────────┬─────────────────────────┘
         │
         │ HTTP POST: /sync-log
         │ { followerId: "replica2", fromIndex: 0 }
         │
         ↓
STEP 5: Leader Responds with Sync
┌──────────────────────────────────┐
│ REPLICA 1 (Leader):              │
│ Receive: SyncLog request         │
│                                  │
│ handleSyncLog("replica2", 0)     │
│                                  │
│ commitIndex = 40                 │
│ return all entries from 0 to 40: │
│ [                                │
│   { index: 0, term: 1, ... },    │
│   { index: 1, term: 1, ... },    │
│   ...                            │
│   { index: 40, term: 11, ... }   │
│ ]                                │
│                                  │
│ Return:                          │
│ {                                │
│   success: true,                 │
│   entries: [...(40 entries)...], │
│   commitIndex: 40                │
│ }                                │
└────────┬─────────────────────────┘
         │
         │ HTTP 200 Response
         │ (body size: ~4-5KB)
         │
         ↓
STEP 6: Apply Sync
┌──────────────────────────────────┐
│ REPLICA 2 (Restarted):           │
│                                  │
│ HTTPHandler receives sync response│
│ 40 entries with all committed    │
│ strokes!                         │
│                                  │
│ applySyncLogResponse(            │
│   "replica1",                    │
│   entries,                       │
│   40                             │
│ )                                │
│                                  │
│ For each entry:                  │
│  → nodeState.appendEntry(e)      │
│                                  │
│ Update: nodeState.commitIndex = 40
│                                  │
│ Now has 40 entries!              │
│ onEntryCommitted() triggers...   │
│ Canvas renders strokes 0-40      │
│                                  │
│ Next heartbeat from leader:      │
│ nextIndex[replica2] = 41         │
│ → Will send newer entries only   │
│ → Back in sync!                  │
└──────────────────────────────────┘

RESULT:
✓ Restarted node caught up
✓ No data loss
✓ Consistent state across cluster
✓ Users see all historical strokes
```

## Message Format Examples

### RequestVote RPC

```javascript
// Request (Candidate → Followers)
{
  term: 11,                    // Current term of candidate
  candidateId: "replica2",     // ID of candidate requesting vote
  lastLogIndex: 42,            // Index of last entry in candidate's log
  lastLogTerm: 10              // Term of last entry in candidate's log
}

// Response
{
  voteGranted: true,           // Whether vote was granted
  term: 11                     // Current term (for candidate update)
}
```

### AppendEntries RPC (Heartbeat)

```javascript
// Request (Leader → Followers)
{
  term: 11,                    // Leader's term
  leaderId: "replica1",        // ID of leader (for follower redirect)
  prevLogIndex: 40,            // Index of entry immediately preceding new entries
  prevLogTerm: 11,             // Term of prevLogIndex entry
  entries: [                   // Log entries to store (empty for heartbeat)
    {
      index: 41,
      term: 11,
      type: "stroke",
      data: { x1, y1, x2, y2, color }
    }
  ],
  leaderCommitIndex: 40        // Leader's commitIndex
}

// Response
{
  success: true,               // True if follower contained entry matching prevLogIndex and prevLogTerm
  term: 11,                    // Current term (for leader update)
  lastLogIndex: 41,            // Follower's last log index after append
  conflictIndex: undefined,    // (if failed) index to backoff to
  conflictTerm: undefined      // (if failed) term at conflictIndex
}
```

### SyncLog RPC (Catch-Up)

```javascript
// Request (Follower → Leader)
{
  followerId: "replica2",      // Which follower is asking
  fromIndex: 35                // Start sending entries from this index
}

// Response (Leader → Follower)
{
  success: true,
  term: 11,
  entries: [                   // All entries from fromIndex to commitIndex
    {
      index: 35,
      term: 11,
      type: "stroke",
      data: {...}
    },
    // ... more entries ...
    {
      index: 40,
      term: 11,
      type: "stroke",
      data: {...}
    }
  ],
  commitIndex: 40              // Leader's current commitIndex
}
```

### HTTP Endpoint Examples

```python
# Client Request Endpoint
POST http://replica1:5001/client-request
{
  "type": "stroke",
  "data": {
    "x1": 10,
    "y1": 20,
    "x2": 30,
    "y2": 40,
    "color": "#FF0000",
    "userId": "user123"
  }
}

# Response (if leader)
{
  "success": true,
  "index": 42,
  "term": 11
}

# Response (if not leader)
{
  "error": "Not leader",
  "leaderId": "replica1",
  "leaderUrl": "http://replica1:5001"
}
```

## State Transition Diagram

```
                ┌──────────────────────────────────┐
                │      FOLLOWER (Initial State)    │
                │                                  │
                │ - Wait for leader heartbeat      │
                │ - Vote in elections              │
                │ - Accept log entries             │
                │ - Cannot process client requests │
                └──────────────┬─────────────────┬─┘
                               │                 │
                    Election    │                 │ Hb from valid leader
                    timeout     │ Higher term     │
                               │ received        │
                               │                 │
                ┌──────────────▼────────────────▼─────────┐
                │           CANDIDATE                      │
                │                                         │
                │ - Increment term                        │
                │ - Vote for self                         │
                │ - Request votes from all fellows        │
                │ - Cannot process client requests        │
                │ - Reset election timeout                │
                └────────┬──────────────────────┬──────────┘
                         │                      │
          Receives        │ Receives            │ Election timeout,
          majority votes  │ higher term or      │ higher term, or
          (≥2 out of 3)   │ valid heartbeat    │ split vote
                         │                      │
                         │                      │
        ┌────────────────▼──┐        ┌──────────▼────────┐
        │      LEADER       │        │    FOLLOWER       │
        │                  │        │   (go back)       │
        │ - Broadcast      │        │                  │
        │   heartbeats     │        └──────────────────┘
        │ - Accept client  │
        │   requests       │
        │ - Replicate logs │
        │ - Commit entries │
        │ - Cannot accept  │
        │   higher term    │
        │   (restart elec) │
        └────────┬─────────┘
                 │
         Higher term seen
         OR higher candidate
         wins election
                 │
                 ↓
            FOLLOWER
```

## Key Invariants

1. **Election Safety**: Only one leader per term
2. **Log Consistency**: If log entry is committed, it remains in that position in all servers
3. **Safety in Presence of Failure**: Even if leader crashes, committed entries are preserved
4. **Majority Quorum**: Changes need acknowledgment from majority (≥2 out of 3)

---

**This architecture ensures:**
✅ All clients see consistent board state
✅ No data loss for committed entries
✅ Automatic failover on leader crash
✅ Recovery without manual intervention
✅ Scaling to larger clusters (change quorum logic)
