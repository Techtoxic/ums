/**
 * Test API Endpoints
 * Run with: node test-api-endpoints.js
 * 
 * This tests if the admin dashboard API endpoints are working
 */

const fetch = require('node-fetch');
const baseUrl = 'http://localhost:5502';

async function testEndpoint(name, endpoint) {
    try {
        console.log(`\n🧪 Testing ${name}...`);
        console.log(`   URL: ${baseUrl}${endpoint}`);
        
        const response = await fetch(`${baseUrl}${endpoint}`);
        const status = response.status;
        
        if (status === 200) {
            const data = await response.json();
            const count = Array.isArray(data) ? data.length : (data.trainers ? data.trainers.length : 'N/A');
            console.log(`   ✅ Success! Status: ${status}`);
            console.log(`   📊 Data count: ${count}`);
            return true;
        } else {
            console.log(`   ❌ Failed! Status: ${status}`);
            const text = await response.text();
            console.log(`   Error: ${text.substring(0, 100)}...`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return false;
    }
}

async function runTests() {
    console.log('═══════════════════════════════════════');
    console.log('  API Endpoints Test');
    console.log('═══════════════════════════════════════');
    console.log(`\n🌐 Base URL: ${baseUrl}`);
    console.log('⏰ Starting tests...\n');
    
    const tests = [
        { name: 'Students API', endpoint: '/api/students' },
        { name: 'Trainers API', endpoint: '/api/trainers/all-departments' },
        { name: 'Programs API', endpoint: '/api/programs' },
        { name: 'Payments API', endpoint: '/api/payments' }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        const result = await testEndpoint(test.name, test.endpoint);
        if (result) passed++;
        else failed++;
    }
    
    console.log('\n═══════════════════════════════════════');
    console.log('  Test Summary');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Passed: ${passed}/${tests.length}`);
    console.log(`❌ Failed: ${failed}/${tests.length}`);
    console.log('\n');
    
    if (failed > 0) {
        console.log('💡 Troubleshooting Tips:');
        console.log('   1. Make sure server is running: node server.js');
        console.log('   2. Check if MongoDB is connected');
        console.log('   3. Verify collections have data');
        console.log('   4. Check server logs for errors\n');
    }
}

// Check if server is running first
fetch(`${baseUrl}/api/students`)
    .then(() => {
        runTests();
    })
    .catch(error => {
        console.log('\n❌ Cannot connect to server!');
        console.log(`   Error: ${error.message}`);
        console.log('\n💡 Make sure server is running:');
        console.log('   node server.js\n');
    });
