/**
 * Stress Testing Script for Distributed Drawing Board
 * Simulates concurrent clients sending drawing strokes
 */

const WebSocket = require('ws');
const { performance } = require('perf_hooks');

class StressTester {
  constructor(gatewayUrl = 'ws://localhost:3000', numClients = 10, duration = 30000) {
    this.gatewayUrl = gatewayUrl;
    this.numClients = numClients;
    this.duration = duration;
    this.clients = [];
    this.stats = {
      connected: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      startTime: null,
      endTime: null,
    };
  }

  async run() {
    console.log(`🚀 Starting stress test with ${this.numClients} clients for ${this.duration}ms`);

    this.stats.startTime = performance.now();

    // Connect all clients
    await this.connectClients();

    // Start sending messages
    this.startMessaging();

    // Wait for duration
    await this.sleep(this.duration);

    // Stop and report
    await this.stop();
  }

  async connectClients() {
    const promises = [];
    for (let i = 0; i < this.numClients; i++) {
      promises.push(this.connectClient(i));
    }
    await Promise.all(promises);
    console.log(`✅ Connected ${this.stats.connected} clients`);
  }

  connectClient(id) {
    return new Promise((resolve) => {
      const ws = new WebSocket(this.gatewayUrl);

      ws.on('open', () => {
        this.stats.connected++;
        this.clients.push(ws);
        resolve();
      });

      ws.on('message', (data) => {
        this.stats.messagesReceived++;
      });

      ws.on('error', (err) => {
        this.stats.errors++;
        console.error(`Client ${id} error:`, err.message);
        resolve(); // Still resolve to continue
      });

      ws.on('close', () => {
        // Remove from clients array
        const index = this.clients.indexOf(ws);
        if (index > -1) {
          this.clients.splice(index, 1);
        }
      });
    });
  }

  startMessaging() {
    // Send a stroke every 100ms from each client
    this.messageInterval = setInterval(() => {
      this.clients.forEach((ws, index) => {
        if (ws.readyState === WebSocket.OPEN) {
          const stroke = {
            type: 'stroke',
            data: {
              x: Math.random() * 800,
              y: Math.random() * 600,
              color: '#000000',
              size: 2,
              timestamp: Date.now(),
            },
          };
          ws.send(JSON.stringify(stroke));
          this.stats.messagesSent++;
        }
      });
    }, 100);
  }

  async stop() {
    clearInterval(this.messageInterval);

    // Close all connections
    const closePromises = this.clients.map(ws => {
      return new Promise(resolve => {
        ws.close();
        resolve();
      });
    });

    await Promise.all(closePromises);

    this.stats.endTime = performance.now();
    this.report();
  }

  report() {
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;
    const throughput = this.stats.messagesSent / duration;

    console.log('\n📊 Stress Test Results:');
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Clients: ${this.stats.connected}`);
    console.log(`Messages Sent: ${this.stats.messagesSent}`);
    console.log(`Messages Received: ${this.stats.messagesReceived}`);
    console.log(`Throughput: ${throughput.toFixed(2)} msg/s`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log(`Success Rate: ${((this.stats.messagesReceived / this.stats.messagesSent) * 100).toFixed(2)}%`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Command line usage
const args = process.argv.slice(2);
const numClients = parseInt(args[0]) || 10;
const duration = parseInt(args[1]) || 30000;

const tester = new StressTester('ws://localhost:3000', numClients, duration);
tester.run().catch(console.error);
