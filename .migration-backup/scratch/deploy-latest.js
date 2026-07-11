const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  console.log('Client :: ready');
  const commands = `
    echo "cd ~/tourops-src"
    cd ~/tourops-src
    
    echo "git pull"
    git pull
    
    echo "docker build -t tourops:latest ."
    docker build -t tourops:latest .
    
    echo "cd ~/tourops"
    cd ~/tourops
    
    echo "docker compose down"
    docker compose down
    
    echo "docker compose up -d"
    docker compose up -d
    
    echo "Deployment complete."
  `;
  
  conn.exec(commands, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write('STDOUT: ' + data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write('STDERR: ' + data.toString());
    });
  });
}).on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
  finish(['devteam73Sleep*']);
}).connect({
  host: '88.99.192.160',
  port: 2235,
  username: 'devteam',
  password: 'devteam73Sleep*',
  tryKeyboard: true
});
