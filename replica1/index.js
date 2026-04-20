const ReplicaServer = require('./replica-server');

const replica1 = new ReplicaServer('replica1', 5001, [
  { id: 'replica2', url: 'http://replica2:5002' },
  { id: 'replica3', url: 'http://replica3:5003' },
]);

replica1.start();

process.on('SIGINT', async () => {
  console.log('Shutting down replica1...');
  await replica1.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down replica1...');
  await replica1.stop();
  process.exit(0);
});
