/**
 * Chaos Testing Script for Distributed Drawing Board
 * Simulates network failures, rapid restarts, and chaotic conditions
 */

const { exec } = require('child_process');
const WebSocket = require('ws');

class ChaosTester {
  constructor() {
    this.isRunning = false;
    this.testDuration = 60000; // 1 minute
    this.failureInterval = 5000; // 5 seconds
  }

  async run() {
    console.log('🔥 Starting Chaos Testing...');
    console.log('This will randomly kill and restart replica containers');
    console.log('Make sure docker-compose is running!');

    this.isRunning = true;

    // Start monitoring
    this.monitorSystem();

    // Start chaos
    this.startChaos();

    // Wait for test duration
    await this.sleep(this.testDuration);

    // Stop chaos
    this.isRunning = false;
    console.log('🛑 Chaos testing completed');
  }

  monitorSystem() {
    // Monitor WebSocket connections
    this.monitorWebSocket();

    // Monitor container health
    this.monitorContainers();
  }

  monitorWebSocket() {
    const ws = new WebSocket('ws://localhost:3000');

    ws.on('open', () => {
      console.log('📡 WebSocket connected for monitoring');
    });

    ws.on('message', (data) => {
      // Just monitoring connectivity
    });

    ws.on('close', () => {
      console.log('⚠️  WebSocket disconnected');
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  }

  monitorContainers() {
    setInterval(() => {
      exec('docker ps --filter "name=replica" --format "table {{.Names}}\t{{.Status}}"', (err, stdout) => {
        if (!err) {
          console.log('🐳 Container Status:');
          console.log(stdout);
        }
      });
    }, 10000);
  }

  startChaos() {
    const chaosActions = [
      () => this.killRandomReplica(),
      () => this.restartRandomReplica(),
      () => this.killLeader(),
      () => this.simulateNetworkPartition(),
    ];

    setInterval(() => {
      if (!this.isRunning) return;

      const action = chaosActions[Math.floor(Math.random() * chaosActions.length)];
      action();
    }, this.failureInterval);
  }

  killRandomReplica() {
    const replicas = ['replica1', 'replica2', 'replica3'];
    const target = replicas[Math.floor(Math.random() * replicas.length)];

    console.log(`💀 Killing ${target}...`);
    exec(`docker stop ${target}`, (err) => {
      if (!err) {
        console.log(`✅ ${target} stopped`);
        // Auto restart after random delay
        setTimeout(() => {
          console.log(`🔄 Restarting ${target}...`);
          exec(`docker start ${target}`, (err) => {
            if (!err) {
              console.log(`✅ ${target} restarted`);
            }
          });
        }, Math.random() * 5000 + 2000);
      }
    });
  }

  restartRandomReplica() {
    const replicas = ['replica1', 'replica2', 'replica3'];
    const target = replicas[Math.floor(Math.random() * replicas.length)];

    console.log(`🔄 Restarting ${target}...`);
    exec(`docker restart ${target}`, (err) => {
      if (!err) {
        console.log(`✅ ${target} restarted`);
      }
    });
  }

  async killLeader() {
    try {
      // Get current leader from gateway
      const response = await fetch('http://localhost:4000/status');
      const status = await response.json();

      if (status.leader) {
        console.log(`🎯 Killing leader ${status.leader}...`);
        exec(`docker stop ${status.leader}`, (err) => {
          if (!err) {
            console.log(`✅ Leader ${status.leader} stopped`);
          }
        });
      }
    } catch (err) {
      console.log('Could not determine leader, skipping...');
    }
  }

  simulateNetworkPartition() {
    // Simulate network partition by stopping a replica for a short time
    const replicas = ['replica1', 'replica2', 'replica3'];
    const target = replicas[Math.floor(Math.random() * replicas.length)];

    console.log(`🌐 Simulating network partition for ${target}...`);
    exec(`docker pause ${target}`, (err) => {
      if (!err) {
        console.log(`⏸️  ${target} paused`);
        setTimeout(() => {
          exec(`docker unpause ${target}`, (err) => {
            if (!err) {
              console.log(`▶️  ${target} unpaused`);
            }
          });
        }, Math.random() * 3000 + 1000);
      }
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run chaos test
const chaos = new ChaosTester();
chaos.run().catch(console.error);
