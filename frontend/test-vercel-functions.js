#!/usr/bin/env node
// Vercel Functions 테스트 스크립트

const https = require('https');

const BASE_URL = 'https://dot-platform-frontend.vercel.app';

async function testEndpoint(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DOT-Platform-Test/1.0'
      }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Vercel Functions 테스트 시작\n');

  // 1. Health Check
  console.log('1️⃣ Health Check 테스트');
  try {
    const health = await testEndpoint('/api/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Response:`, health.data);
    console.log(`   ✅ Health check ${health.status === 200 ? 'SUCCESS' : 'FAILED'}\n`);
  } catch (error) {
    console.log(`   ❌ Health check ERROR:`, error.message, '\n');
  }

  // 2. API Proxy Test (GET)
  console.log('2️⃣ API Proxy GET 테스트');
  try {
    const proxy = await testEndpoint('/api/v1/auth/health');
    console.log(`   Status: ${proxy.status}`);
    console.log(`   Response:`, proxy.data);
    console.log(`   ✅ Proxy GET ${proxy.status < 500 ? 'SUCCESS' : 'FAILED'}\n`);
  } catch (error) {
    console.log(`   ❌ Proxy GET ERROR:`, error.message, '\n');
  }

  // 3. API Proxy Test (POST)
  console.log('3️⃣ API Proxy POST 테스트');
  try {
    const postData = { test: true, timestamp: Date.now() };
    const proxy = await testEndpoint('/api/v1/auth/test', 'POST', postData);
    console.log(`   Status: ${proxy.status}`);
    console.log(`   Response:`, proxy.data);
    console.log(`   ✅ Proxy POST ${proxy.status < 500 ? 'SUCCESS' : 'FAILED'}\n`);
  } catch (error) {
    console.log(`   ❌ Proxy POST ERROR:`, error.message, '\n');
  }

  // 4. CORS Test
  console.log('4️⃣ CORS 테스트');
  try {
    const cors = await testEndpoint('/api/v1/test', 'OPTIONS');
    console.log(`   Status: ${cors.status}`);
    console.log(`   CORS Headers:`, {
      'access-control-allow-origin': cors.headers['access-control-allow-origin'],
      'access-control-allow-methods': cors.headers['access-control-allow-methods'],
      'access-control-allow-headers': cors.headers['access-control-allow-headers']
    });
    console.log(`   ✅ CORS ${cors.status === 200 ? 'SUCCESS' : 'FAILED'}\n`);
  } catch (error) {
    console.log(`   ❌ CORS ERROR:`, error.message, '\n');
  }

  console.log('🏁 테스트 완료!');
  console.log('\n📋 결과 요약:');
  console.log('   - Health Check: /api/health');
  console.log('   - API Proxy: /api/v1/* → http://100.25.70.173:3001/api/v1/*');
  console.log('   - CORS: 모든 도메인 허용');
  console.log('   - Method: GET, POST, PUT, DELETE, PATCH, OPTIONS');
}

runTests().catch(console.error);