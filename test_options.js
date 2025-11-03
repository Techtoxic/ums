const http = require('http');

// Test OPTIONS request (CORS preflight)
const options = {
    hostname: 'localhost',
    port: 5502,
    path: '/api/auth/forgot-password',
    method: 'OPTIONS',
    headers: {
        'Origin': 'http://localhost:5502',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
    }
};

console.log('Testing OPTIONS request (CORS preflight):');
console.log('Path:', options.path);
console.log('Method:', options.method);

const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('Response:', data);
        process.exit(0);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
    process.exit(1);
});

req.end();

