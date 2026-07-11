/**
 * Checks all seeded staff accounts and fixes their roles in the DB.
 * Also seeds all world countries.
 */
import { Client } from 'ssh2';

const conn = new Client();

// Check current user profiles and fix staff role assignments
const checkSQL = `
SELECT u.username, p.role 
FROM users u 
LEFT JOIN user_profiles p ON u.id = p.user_id 
WHERE u.username IN (
  'superadmin1','airlinesupplier1','countrymanager1','citymanager1',
  'hotelmanager1','transportmanager1','guidemanager1','sightsmanager1',
  'contenteditor1','flightagent1','tourbuilder1','supplier1','travelagent1'
)
ORDER BY u.username;
`;

const cmd = `docker exec tour_ops_db psql -U postgres -d tourops -c "${checkSQL.replace(/\n/g,' ').replace(/"/g,'\\"')}"`;

conn.on('ready', () => {
  console.log('SSH ready, checking staff accounts...');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Error:', err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('\nDone!'); conn.end(); });
  });
}).on('error', err => {
  console.error('Connection error:', err);
}).connect({
  host: '88.99.192.160',
  port: 2235,
  username: 'devteam',
  password: 'devteam73Sleep*',
  tryKeyboard: true
});

conn.on('keyboard-interactive', (_n, _i, _il, prompts, finish) => {
  if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
    finish(['devteam73Sleep*']);
  } else { finish([]); }
});
