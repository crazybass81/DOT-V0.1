#!/usr/bin/env node

/**
 * 로컬에서 프록시 함수 동작 테스트
 * Vercel 환경과 로컬 환경의 차이점 확인
 */

const fetch = require('node-fetch');

// 테스트할 데이터
const testData = {
  email: "test-local@example.com",
  password: "Test123!",
  name: "로컬테스트",
  phone: "010-1111-2222"
};

async function testDirectBackend() {
  console.log('=== 백엔드 직접 테스트 ===');

  try {
    const response = await fetch('http://100.25.70.173:3001/api/v1/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Local-Test/1.0'
      },
      body: JSON.stringify(testData)
    });

    const data = await response.text();

    console.log('상태 코드:', response.status);
    console.log('응답 헤더:', Object.fromEntries(response.headers.entries()));
    console.log('응답 본문:', data);

    return response.status;
  } catch (error) {
    console.error('백엔드 직접 테스트 실패:', error.message);
    return 500;
  }
}

async function testVercelAPI() {
  console.log('\n=== Vercel API 테스트 ===');

  try {
    const response = await fetch('https://dot-platform-six.vercel.app/api/v1/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Local-Test/1.0'
      },
      body: JSON.stringify(testData)
    });

    const data = await response.text();

    console.log('상태 코드:', response.status);
    console.log('응답 헤더:', Object.fromEntries(response.headers.entries()));
    console.log('응답 본문:', data);

    return response.status;
  } catch (error) {
    console.error('Vercel API 테스트 실패:', error.message);
    return 500;
  }
}

async function testHealthEndpoints() {
  console.log('\n=== Health 엔드포인트 테스트 ===');

  const endpoints = [
    'http://100.25.70.173:3001/health',
    'http://100.25.70.173:3001/api/health',
    'http://100.25.70.173:3001/api/v1/health',
    'https://dot-platform-six.vercel.app/api/v1/health'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'User-Agent': 'Local-Test/1.0'
        }
      });

      const data = await response.text();
      console.log(`${endpoint}: ${response.status} - ${data.substring(0, 100)}`);
    } catch (error) {
      console.log(`${endpoint}: ERROR - ${error.message}`);
    }
  }
}

async function main() {
  console.log('DOT Platform API 테스트 시작\n');

  // Health 엔드포인트 테스트
  await testHealthEndpoints();

  // 백엔드 직접 테스트
  const backendStatus = await testDirectBackend();

  // Vercel을 통한 테스트
  const vercelStatus = await testVercelAPI();

  console.log('\n=== 결과 요약 ===');
  console.log(`백엔드 직접: ${backendStatus}`);
  console.log(`Vercel 프록시: ${vercelStatus}`);

  if (backendStatus === 409 && vercelStatus === 405) {
    console.log('\n❌ 프록시 함수에서 HTTP Method가 올바르게 전달되지 않음');
  } else if (backendStatus === 409 && vercelStatus === 409) {
    console.log('\n✅ 프록시 함수가 정상적으로 작동함');
  } else {
    console.log('\n⚠️  예상과 다른 결과. 추가 조사 필요');
  }
}

main().catch(console.error);