import { Client } from 'ssh2';

const conn = new Client();

const queries = [
  `INSERT INTO countries (code, iso3, name, capital_city, continent, region, subregion, currency_code, currency_name, phone_code, latitude, longitude, is_active) VALUES ('IL', 'ISR', 'Israel', 'Jerusalem', 'Asia', 'Asia', 'Western Asia', 'ILS', 'Israeli New Shekel', '+972', '31.5', '34.75', true) ON CONFLICT (code) DO NOTHING`,
  `INSERT INTO cities (name, ascii_name, country_id, is_capital, is_tourism_city, is_active) SELECT v.name, v.ascii_name, c.id, v.is_cap, v.is_tour, true FROM countries c, (VALUES ('Jerusalem','Jerusalem',true,true),('Tel Aviv','Tel Aviv',false,true),('Haifa','Haifa',false,true),('Nazareth','Nazareth',false,true),('Bethlehem','Bethlehem',false,true),('Jericho','Jericho',false,true),('Tiberias','Tiberias',false,true),('Eilat','Eilat',false,true)) AS v(name,ascii_name,is_cap,is_tour) WHERE c.code = 'IL' ON CONFLICT DO NOTHING`,
  `SELECT id, code, name FROM countries WHERE code = 'IL'`,
];

const allSQL = queries.join('; ');
const cmd = `docker exec tour_ops_db psql -U postgres -d tourops -c "${allSQL.replace(/"/g, '\\"')}"`;

conn.on('ready', () => {
  console.log('SSH ready, seeding Israel...');
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
  } else {
    finish([]);
  }
});
