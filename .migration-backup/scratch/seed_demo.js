const { Client } = require('ssh2');
const bcrypt = require('bcryptjs');

async function seedDemoUser() {
  const hash = await bcrypt.hash('demo123', 10);
  const adminId = `demo-admin-${Date.now()}`;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      const sql = `
        INSERT INTO users (id, username, password_hash, first_name) 
        VALUES ('${adminId}', 'demoadmin', '${hash}', 'Demo Admin')
        ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
        
        INSERT INTO user_profiles (user_id, role) 
        VALUES ('${adminId}', 'admin')
        ON CONFLICT (user_id) DO NOTHING;
      `;
      
      const safeSql = sql.replace(/\n/g, ' ').replace(/\$/g, '\\$');
      const cmd = `docker exec -i tour_ops_db psql -U postgres -d tourops -c "${safeSql}"`;
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => process.stdout.write(d));
        stream.on('close', () => {
          conn.end();
          resolve();
        });
      });
    }).on('keyboard-interactive', (name, instr, instrLang, prompts, finish) => {
      finish(['devteam73Sleep*']);
    }).connect({
      host: '88.99.192.160', port: 2235, username: 'devteam', tryKeyboard: true, password: 'devteam73Sleep*'
    });
  });
}

seedDemoUser().catch(console.error);
