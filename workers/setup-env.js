require('dotenv').config({ path: '../.env' });

// Pass through all arguments to wrangler
const { spawn } = require('child_process');
const args = process.argv.slice(2);

const wrangler = spawn('wrangler', args, {
  stdio: 'inherit',
  env: process.env,
  shell: true
});

wrangler.on('exit', (code) => {
  process.exit(code);
});