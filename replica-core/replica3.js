const ReplicaServer = require('./REPLICA_EXAMPLE');

const replica3 = new ReplicaServer('replica3', 5003, [
  { id: 'replica1', url: 'http://localhost:5001' },
  { id: 'replica2', url: 'http://localhost:5002' },
]);

replica3.start();

process.on('SIGINT', async () => {
  console.log('Shutting down replica3...');
  replica3.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down replica3...');
  replica3.stop();
  process.exit(0);
});
