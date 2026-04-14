const { fork } = require('child_process');
const path = require('path');

const replicas = ['replica1.js', 'replica2.js', 'replica3.js'].map((file) =>
  path.join(__dirname, file)
);

const children = replicas.map((script) => {
  console.log(`Starting ${path.basename(script)}`);
  const child = fork(script, [], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    console.log(`${path.basename(script)} exited with code=${code} signal=${signal}`);
  });

  return child;
});

function shutdown() {
  console.log('Shutting down replica cluster...');
  children.forEach((child) => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Replica cluster launcher started.');
