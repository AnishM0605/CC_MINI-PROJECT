const ReplicaServer = require('./replica-server');

const replica3 = new ReplicaServer('replica3', 5003, [
  { id: 'replica1', url: 'http://replica1:5001' },
  { id: 'replica2', url: 'http://replica2:5002' },
]);

replica3.start();

process.on('SIGINT', async () => {
  console.log('Shutting down replica3...');
  await replica3.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down replica3...');
  await replica3.stop();
  process.exit(0);
});
