import { Client } from 'ssh2';

const conn = new Client();

const commands = [
  'cd tourops-src',
  'git pull',
  'docker build -t tourops:latest .',
  'cd ../tourops',
  'docker compose down',
  'docker compose up -d'
].join(' && ');

conn.on('ready', () => {
  console.log('SSH Client :: ready');
  console.log(`Executing commands: ${commands}`);

  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('Execution error:', err);
      conn.end();
      process.exit(1);
    }

    stream.on('close', (code, signal) => {
      console.log(`Stream :: close :: code: ${code}, signal: ${signal}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString('utf8'));
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString('utf8'));
    });
  });
}).on('error', (err) => {
  console.error('Connection error:', err);
  process.exit(1);
}).connect({
  host: '88.99.192.160',
  port: 2235,
  username: 'devteam',
  password: 'devteam73Sleep*',
  tryKeyboard: true
});

conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
  if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
    finish(['devteam73Sleep*']);
  } else {
    finish([]);
  }
});
