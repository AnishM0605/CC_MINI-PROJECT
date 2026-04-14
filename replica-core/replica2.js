const ReplicaServer = require('./REPLICA_EXAMPLE');

const replica2 = new ReplicaServer('replica2', 5002, [
  { id: 'replica1', url: 'http://localhost:5001' },
  { id: 'replica3', url: 'http://localhost:5003' },
]);

replica2.start();

process.on('SIGINT', async () => {
  console.log('Shutting down replica2...');
  replica2.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down replica2...');
  replica2.stop();
  process.exit(0);
});
