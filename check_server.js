const { spawn } = require('child_process');

console.log('Starting server.js...');
const serverProcess = spawn('node', ['server.js'], { stdio: 'pipe' });

let output = '';

serverProcess.stdout.on('data', (data) => {
    output += data.toString();
    console.log(`STDOUT: ${data.toString()}`);
});

serverProcess.stderr.on('data', (data) => {
    output += data.toString();
    console.error(`STDERR: ${data.toString()}`);
});

serverProcess.on('error', (err) => {
    console.error(`Failed to start subprocess: ${err}`);
});

serverProcess.on('close', (code) => {
    console.log(`server.js exited with code ${code}`);
    process.exit(code);
});

// Run for 5 seconds then kill it
setTimeout(() => {
    console.log('\n--- 5 Seconds Passed ---');
    console.log('The server is still running. Killing the process now...');
    serverProcess.kill('SIGTERM');
    console.log('Server process terminated.');
    process.exit(0);
}, 5000);