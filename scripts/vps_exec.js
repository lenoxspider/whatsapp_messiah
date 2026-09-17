import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '172.86.74.20';
const username = 'root';
const pwdPath = 'c:\\Users\\YOOF1337\\Downloads\\whatsapp_messiah\\vpstemp.txt';
const password = fs.readFileSync(pwdPath, 'utf8').trim();

const cmd = process.argv.slice(2).join(' ') || 'git status';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      process.exit(1);
    }
    stream.on('close', (code, signal) => {
      conn.end();
      process.exit(code || 0);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection error:', err.message);
  process.exit(1);
}).connect({
  host,
  port: 22,
  username,
  password,
  readyTimeout: 20000
});
