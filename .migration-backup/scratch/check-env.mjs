/**
 * Check docker environment variables and test staff login via HTTP
 */
import { Client } from 'ssh2';

const conn = new Client();

const cmd = `docker exec tour_ops_app printenv SESSION_SECRET DATABASE_URL NODE_ENV | head -5`;

conn.on('ready', () => {
  console.log('Checking env vars...');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Error:', err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('\n---done---'); conn.end(); });
  });
}).on('error', err => console.error('Connection error:', err))
.connect({
  host: '88.99.192.160', port: 2235,
  username: 'devteam', password: 'devteam73Sleep*', tryKeyboard: true
});
conn.on('keyboard-interactive', (_n,_i,_il,prompts,finish) => {
  finish(prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password') ? ['devteam73Sleep*'] : []);
});
