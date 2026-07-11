const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  console.log('Connected');
  conn.exec('docker exec -i tour_ops_db psql -U postgres -d tourops -c "SELECT username FROM users;"', (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).on('keyboard-interactive', (name, instr, instrLang, prompts, finish) => {
  finish(['devteam73Sleep*']);
}).connect({
  host: '88.99.192.160',
  port: 2235,
  username: 'devteam',
  tryKeyboard: true,
  password: 'devteam73Sleep*'
});
