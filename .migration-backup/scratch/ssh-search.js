const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('grep -ri "Failed to upload image" /var/www /home /opt /usr', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '88.99.192.160',
  port: 5022,
  username: 'root',
  privateKey: fs.readFileSync('C:\\Users\\it-arta\\.ssh\\id_rsa')
});
