/**
 * Test login for all staff accounts on production server via node fetch inside container
 */
import { Client } from 'ssh2';

const conn = new Client();

const script = `
node -e "
const accounts = [
  {u:'superadmin1',p:'staff'},
  {u:'airlinesupplier1',p:'staff'},
  {u:'countrymanager1',p:'staff'},
  {u:'hotelmanager1',p:'staff'},
  {u:'transportmanager1',p:'staff'},
  {u:'guidemanager1',p:'staff'},
  {u:'supplier1',p:'staff'},
];
(async()=>{
  for(const a of accounts){
    try{
      const r = await fetch('http://localhost:5000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:a.u,password:'password123',portal:a.p})});
      const d = await r.json();
      console.log(a.u+': HTTP '+r.status+' | role='+d.role+' | msg='+d.message);
    }catch(e){console.log(a.u+': ERROR '+e.message);}
  }
})();
"
`;

const cmd = `docker exec tour_ops_app sh -c '${script.trim().replace(/'/g, "'\\''")}'`;

conn.on('ready', () => {
  console.log('Testing staff logins...\n');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Error:', err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('\n--- Done ---'); conn.end(); });
  });
}).on('error', err => console.error('Connection error:', err))
.connect({
  host: '88.99.192.160', port: 2235,
  username: 'devteam', password: 'devteam73Sleep*', tryKeyboard: true
});
conn.on('keyboard-interactive', (_n,_i,_il,prompts,finish) => {
  finish(prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password') ? ['devteam73Sleep*'] : []);
});
