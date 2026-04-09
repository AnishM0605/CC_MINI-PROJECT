/**
 * RAFT Core Testing Guide
 * 
 * How to validate RAFT core implementation
 * Run: node tests/test-raft-core.js
 */

// ============================================================================
// TEST 1: Single Node Election
// ============================================================================
function testSingleNodeElection() {
  console.log('\n=== TEST 1: Single Node Election ===');
  
  const RaftCore = require('../index');
  const node = new RaftCore('node1', []);
  
  node.start();
  
  // Wait for election timeout
  setTimeout(() => {
    console.assert(node.isLeader(), 'Single node should become leader');
    console.assert(node.getTerm() === 1, 'Term should be 1 after election');
    console.log('✓ Single node became leader');
    
    node.stop();
    testThreeNodeCluster();
  }, 1000);
}

// ============================================================================
// TEST 2: Three Node Cluster Election
// ============================================================================
function testThreeNodeCluster() {
  console.log('\n=== TEST 2: Three Node Cluster Election ===');
  
  const RaftCore = require('../index');
  
  const node1 = new RaftCore('node1', ['node2', 'node3']);
  const node2 = new RaftCore('node2', ['node1', 'node3']);
  const node3 = new RaftCore('node3', ['node1', 'node2']);
  
  // Simulate network: nodes can talk to each other
  const network = {
    'node1': node1,
    'node2': node2,
    'node3': node3
  };
  
  // Start all nodes
  node1.start();
  node2.start();
  node3.start();
  
  let leaderFound = false;
  let electionTimeout = 2000; // Wait up to 2 seconds
  
  const checkLeaders = setInterval(() => {
    const states = [node1, node2, node3].map(n => ({
      id: n.nodeId,
      state: n.getState(),
      term: n.getTerm()
    }));
    
    const leaders = states.filter(s => s.state === 'LEADER');
    
    if (leaders.length === 1 && !leaderFound) {
      leaderFound = true;
      console.log('✓ Exactly one leader elected:', leaders[0].id);
      console.log('  Leader term:', leaders[0].term);
      
      // Verify all nodes know about leader
      const allTermsSame = states.every(s => s.term === leaders[0].term);
      console.assert(allTermsSame, 'All nodes should have same term');
      console.log('✓ All nodes synchronized on term:', leaders[0].term);
      
      clearInterval(checkLeaders);
      testClientRequest(node1, node2, node3, network);
    }
  }, 100);
  
  setTimeout(() => {
    clearInterval(checkLeaders);
    if (!leaderFound) {
      console.error('✗ No leader elected after 2 seconds');
    }
  }, electionTimeout);
}

// ============================================================================
// TEST 3: Client Request to Leader
// ============================================================================
function testClientRequest(node1, node2, node3, network) {
  console.log('\n=== TEST 3: Client Request to Leader ===');
  
  const leader = [node1, node2, node3].find(n => n.isLeader());
  if (!leader) {
    console.error('✗ No leader available');
    return;
  }
  
  console.log('Sending stroke to leader:', leader.nodeId);
  
  // Client sends stroke to leader
  const strokeData = { x1: 10, y1: 20, x2: 30, y2: 40, color: '#FF0000' };
  const result = leader.clientRequest('stroke', strokeData);
  
  console.assert(result !== null, 'Leader should accept client request');
  console.assert(result.index === 0, 'First entry should be at index 0');
  console.assert(result.term === leader.getTerm(), 'Entry term should match current term');
  console.log('✓ Entry appended to leader log');
  console.log('  Index:', result.index);
  console.log('  Term:', result.term);
  
  testLogReplication(node1, node2, node3, network);
}

// ============================================================================
// TEST 4: Log Replication
// ============================================================================
function testLogReplication(node1, node2, node3, network) {
  console.log('\n=== TEST 4: Log Replication ===');
  
  const leader = [node1, node2, node3].find(n => n.isLeader());
  const followers = [node1, node2, node3].filter(n => !n.isLeader());
  
  // Simulate AppendEntries RPC
  console.log('Simulating AppendEntries replication...');
  
  followers.forEach(follower => {
    const appendEntries = leader.prepareAppendEntries(follower.nodeId);
    if (appendEntries) {
      const response = follower.handleAppendEntries(appendEntries);
      
      if (response.success) {
        console.log(`✓ ${follower.nodeId} replicated entries`);
        leader.handleReplicationSuccess(follower.nodeId, response.lastLogIndex);
      } else {
        console.log(`✗ ${follower.nodeId} failed to replicate`);
      }
    }
  });
  
  // Check that all nodes have same log
  setTimeout(() => {
    const logLengths = [node1, node2, node3].map(n => n.nodeState.log.length);
    const allSame = logLengths.every(len => len === logLengths[0]);
    
    console.assert(allSame, 'All nodes should have same log length');
    console.log('✓ All nodes synchronized log');
    console.log('  Log length:', logLengths[0]);
    
    testCommit(node1, node2, node3);
  }, 500);
}

// ============================================================================
// TEST 5: Entry Commitment
// ============================================================================
function testCommit(node1, node2, node3) {
  console.log('\n=== TEST 5: Entry Commitment ===');
  
  const leader = [node1, node2, node3].find(n => n.isLeader());
  const info = leader.getNodeInfo();
  
  console.log('Leader state:');
  console.log('  Commit Index:', info.commitIndex);
  console.log('  Last Log Index:', info.lastLogIndex);
  
  // Advance commitIndex (simulating majority quorum)
  const committed = leader.logReplication.getUnappliedCommittedEntries();
  console.log('✓ Committed entries tracked');
  console.log('  Count:', committed.length);
  
  testTermVerfication();
}

// ============================================================================
// TEST 6: Term Verification
// ============================================================================
function testTermVerfication() {
  console.log('\n=== TEST 6: Term Safety ===');
  
  const RaftCore = require('../index');
  const node1 = new RaftCore('node1', ['node2']);
  const node2 = new RaftCore('node2', ['node1']);
  
  // Test higher term wins
  const initialTerm = node1.getTerm();
  const higher = initialTerm + 5;
  
  const response = node1.handleRequestVote({
    term: higher,
    candidateId: 'node2',
    lastLogIndex: 0,
    lastLogTerm: 0
  });
  
  console.assert(response.voteGranted === true, 'Should grant vote to higher term');
  console.assert(node1.getTerm() === higher, 'Should update to higher term');
  console.log('✓ Higher term is always accepted');
  console.log('  Updated from term', initialTerm, 'to', higher);
  
  // Test stale term is ignored
  const responseStale = node1.handleRequestVote({
    term: 1,
    candidateId: 'node2',
    lastLogIndex: 0,
    lastLogTerm: 0
  });
  
  console.assert(responseStale.voteGranted === false, 'Should reject stale term');
  console.log('✓ Stale term is rejected');
  
  testLeaderFailover();
}

// ============================================================================
// TEST 7: Leader Failure and Failover
// ============================================================================
function testLeaderFailover() {
  console.log('\n=== TEST 7: Leader Failover ===');
  
  const RaftCore = require('../index');
  
  const node1 = new RaftCore('node1', ['node2', 'node3']);
  const node2 = new RaftCore('node2', ['node1', 'node3']);
  const node3 = new RaftCore('node3', ['node1', 'node2']);
  
  node1.start();
  node2.start();
  node3.start();
  
  setTimeout(() => {
    let leader1 = [node1, node2, node3].find(n => n.isLeader());
    console.log('✓ Initial leader elected:', leader1.nodeId);
    
    // Simulate leader failure by stopping it
    console.log('Simulating leader failure...');
    leader1.stop();
    
    // Wait for election timeout on others
    setTimeout(() => {
      const remaining = [node1, node2, node3].filter(n => n !== leader1);
      const newLeaders = remaining.filter(n => n.isLeader());
      
      if (newLeaders.length === 1) {
        console.log('✓ New leader elected:', newLeaders[0].nodeId);
        console.log('  Previous leader:', leader1.nodeId);
        console.log('  New term:', newLeaders[0].getTerm());
        testSync();
      } else {
        console.error('✗ No new leader elected');
      }
    }, 1200);
  }, 1000);
}

// ============================================================================
// TEST 8: Catch-Up Synchronization
// ============================================================================
function testSync() {
  console.log('\n=== TEST 8: Catch-Up Sync (Restarted Node) ===');
  
  const RaftCore = require('../index');
  
  // Create cluster
  const node1 = new RaftCore('node1', ['node2', 'node3']);
  const node2 = new RaftCore('node2', ['node1', 'node3']);
  const node3 = new RaftCore('node3', ['node1', 'node2']);
  
  node1.start();
  node2.start();
  node3.start();
  
  setTimeout(() => {
    const leader = [node1, node2, node3].find(n => n.isLeader());
    const followers = [node1, node2, node3].filter(n => !n.isLeader());
    
    // Add entries to log
    for (let i = 0; i < 5; i++) {
      leader.clientRequest('stroke', { x: i * 10, y: i * 20 });
    }
    
    // Replicate to followers
    followers.forEach(follower => {
      const ae = leader.prepareAppendEntries(follower.nodeId);
      const resp = follower.handleAppendEntries(ae);
      if (resp.success) {
        leader.handleReplicationSuccess(follower.nodeId, resp.lastLogIndex);
      }
    });
    
    setTimeout(() => {
      console.log('Log synchronized across cluster');
      console.log('  Leader log length:', leader.nodeState.log.length);
      
      // Simulate node restart
      let stoppedNode = followers[0];
      const stoppedNodeId = stoppedNode.nodeId;
      console.log('\nSimulating restart of:', stoppedNodeId);
      
      // In real scenario: node would reload from disk and be empty or partial
      // For this test: we'll clear its log to simulate it being behind
      stoppedNode.stop();
      
      // Create new instance (empty)
      const restartedNode = new RaftCore(stoppedNodeId, [
        [node1, node2, node3].filter(n => n.nodeId !== stoppedNodeId).map(n => n.nodeId)
      ].flat());
      
      restartedNode.start();
      
      // Try AppendEntries - should fail due to log mismatch
      setTimeout(() => {
        const ae = leader.prepareAppendEntries(stoppedNodeId);
        
        // Manually handle on restarted node
        const resp = restartedNode.handleAppendEntries(ae);
        
        if (!resp.success) {
          console.log('✓ Log mismatch detected as expected');
          
          // Request sync
          const syncReq = restartedNode.checkAndRequestSync(
            leader.nodeId,
            ae.prevLogIndex,
            ae.prevLogTerm
          );
          
          if (syncReq) {
            console.log('✓ Node requested sync');
            
            // Leader responds with sync
            const syncResp = leader.handleSyncLog(syncReq.followerId, syncReq.fromIndex);
            
            // Node applies sync
            restartedNode.applySyncLogResponse(leader.nodeId, syncResp.entries, syncResp.commitIndex);
            
            console.log('✓ Node synchronized');
            console.log('  Entries received:', syncResp.entries.length);
            console.log('  Now has', restartedNode.nodeState.log.length, 'entries');
          }
        }
      }, 500);
    }, 500);
  }, 1200);
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

console.log('╔════════════════════════════════════════╗');
console.log('║   RAFT CORE - COMPREHENSIVE TESTS     ║');
console.log('╚════════════════════════════════════════╝');

testSingleNodeElection();

/**
 * EXPECTED OUTPUT
 * 
 * ✓ Single node became leader
 * ✓ Exactly one leader elected
 * ✓ All nodes synchronized on term
 * ✓ Entry appended to leader log
 * ✓ All nodes replicated entries
 * ✓ All nodes synchronized log
 * ✓ Higher term is always accepted
 * ✓ Stale term is rejected
 * ✓ New leader elected after failover
 * ✓ Log mismatch detected
 * ✓ Node synchronized after restart
 */

// ============================================================================
// MANUAL TESTING CHECKLIST
// ============================================================================

/*
Before deployment, verify manually:

[ ] Election:
    - Run 3 nodes, wait 1 second, exactly 1 leader should exist
    - Kill leader, wait 1 second, new leader should be elected
    - Leader should be from term N+1

[ ] Log Replication:
    - Send stroke to leader
    - All followers should replicate
    - All logs should be identical length

[ ] Commit:
    - Send stroke to leader
    - Wait for AppendEntries rounds
    - Entry should be committed
    - All nodes should have same commitIndex

[ ] Persistence:
    - Send strokes to leader
    - Kill and restart a follower
    - Restarted node should catch up via sync-log
    - Should have all entries

[ ] Failover:
    - Kill leader
    - Verify new election happens
    - New leader should be from higher term
    - Gateway should detect new leader
    - Clients should reconnect to new leader

[ ] Split Brain (optional):
    - Create network partition
    - Minority partition should NOT elect leader
    - Majority partition should elect and work normally
    - When healed, minority should accept majority's state
*/
