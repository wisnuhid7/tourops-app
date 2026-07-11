const { Client } = require('ssh2');
const path = require('path');

const conn = new Client();
const newVersion = 'v1.2.8';

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    console.log('SFTP :: ready');
    
    const localFile = path.join(__dirname, 'build.tar.gz');
    const remoteFile = '/home/devteam/build.tar.gz';
    
    console.log('Uploading build.tar.gz...');
    sftp.fastPut(localFile, remoteFile, (err) => {
      if (err) throw err;
      console.log('Upload successful.');
      
      const commands = `
        cd /home/devteam
        rm -rf build_dir
        mkdir -p build_dir
        tar -xzf build.tar.gz -C build_dir
        cd build_dir
        echo "Building docker image..."
        docker build -t ghcr.io/wisnuhid7/tourops:${newVersion} .
        cd ~/tourops
        echo "Updating docker-compose.yml..."
        sed -i 's|ghcr.io/wisnuhid7/tourops:.*|ghcr.io/wisnuhid7/tourops:${newVersion}|g' docker-compose.yml
        echo "Deploying..."
        docker compose down
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
