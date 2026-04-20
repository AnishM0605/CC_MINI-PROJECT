const ReplicaServer = require('./replica-server');

const replica2 = new ReplicaServer('replica2', 5002, [
  { id: 'replica1', url: 'http://replica1:5001' },
  { id: 'replica3', url: 'http://replica3:5003' },
]);

replica2.start();

process.on('SIGINT', async () => {
  console.log('Shutting down replica2...');
  await replica2.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down replica2...');
  await replica2.stop();
  process.exit(0);
});
