const { Client } = require('ssh2');

const conn = new Client();

console.log("Connecting to dev server...");

conn.on('ready', () => {
  console.log('Client :: ready');
  
  const cmd = `
    cd tourops &&
    echo "Pulling latest code..." && git pull origin main &&
    echo "Building docker image..." && docker build -t tourops:latest . &&
    echo "Restarting containers..." && docker compose down && docker compose up -d
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      process.stderr.write('STDERR: ' + data);
    });
  });
}).connect({
  host: '88.99.192.160',
  port: 2235,
  username: 'devteam',
  password: 'devteam73Sleep*'
});

conn.on('error', (err) => {
  console.error("SSH Error:", err);
});
