const http = require('http');

const postData = JSON.stringify({
    email: 'test@example.com',
    resetMethod: 'otp',
    userType: 'student'
});

const options = {
    hostname: 'localhost',
    port: 5502,
    path: '/api/auth/forgot-password',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('Testing endpoint:', options.path);
console.log('Request data:', postData);

const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('Response:', data);
        try {
            const jsonResponse = JSON.parse(data);
            console.log('Parsed JSON:', jsonResponse);
        } catch (e) {
            console.log('Not valid JSON:', e.message);
        }
        process.exit(0);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
    process.exit(1);
});

req.write(postData);
req.end();

