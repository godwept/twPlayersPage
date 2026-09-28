import { pbkdf2Sync, randomBytes } from 'node:crypto';

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password is not echoed.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') { process.stdin.setRawMode(false); process.stdin.pause(); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        else { value += char; process.stdout.write('*'); }
      }
    };
    process.stdin.on('data', onData);
  });
}

try {
  const password = await readHidden('Administrator password: ');
  const confirmation = await readHidden('Confirm password: ');
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, Buffer.from(salt, 'base64url'), 100_000, 32, 'sha256').toString('base64url');
  process.stdout.write(`\nPaste only this value into Wrangler's secret prompt (leave out ADMIN_PASSWORD_HASH=):\npbkdf2_sha256$100000$${salt}$${hash}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
