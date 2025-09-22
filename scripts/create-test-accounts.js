#!/usr/bin/env node
/**
 * 테스트 계정 생성 스크립트
 * DOT Platform 개발/테스트용 계정을 자동으로 생성합니다.
 *
 * 사용법:
 * node scripts/create-test-accounts.js [환경]
 *
 * 예시:
 * node scripts/create-test-accounts.js local
 * node scripts/create-test-accounts.js production
 */

const fetch = require('node-fetch');
const colors = require('colors');

// 환경별 API URL 설정
const API_URLS = {
  local: 'http://localhost:3001/api/v1',
  development: 'http://localhost:3001/api/v1',
  production: 'https://dot-platform.vercel.app/api/v1' // 실제 프로덕션 URL로 변경 필요
};

// 테스트 계정 정의
const TEST_ACCOUNTS = [
  {
    email: 'owner@test.com',
    password: 'TestPass123!',
    name: '테스트사장님',
    phone: '010-1111-1111',
    role: 'owner',
    description: '사장님 역할 테스트 계정'
  },
  {
    email: 'worker@test.com',
    password: 'TestPass123!',
    name: '테스트직원',
    phone: '010-2222-2222',
    role: 'worker',
    description: '직원 역할 테스트 계정'
  },
  {
    email: 'seeker@test.com',
    password: 'TestPass123!',
    name: '테스트구직자',
    phone: '010-3333-3333',
    role: 'seeker',
    description: '구직자 역할 테스트 계정'
  },
  {
    email: 'admin@test.com',
    password: 'TestPass123!',
    name: '테스트관리자',
    phone: '010-9999-9999',
    role: 'admin',
    description: '관리자 역할 테스트 계정'
  }
];

// 로그 헬퍼 함수
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`.cyan),
  success: (msg) => console.log(`✅ ${msg}`.green),
  error: (msg) => console.error(`❌ ${msg}`.red),
  warning: (msg) => console.warn(`⚠️  ${msg}`.yellow)
};

/**
 * 계정 생성 함수
 */
async function createAccount(apiUrl, account) {
  try {
    log.info(`Creating account: ${account.email} (${account.description})`);

    const response = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        name: account.name,
        phone: account.phone
      })
    });

    const data = await response.json();

    if (response.status === 201 || response.status === 200) {
      log.success(`Created: ${account.email}`);
      return { success: true, account };
    } else if (response.status === 409) {
      log.warning(`Already exists: ${account.email}`);
      return { success: false, account, reason: 'duplicate' };
    } else {
      log.error(`Failed: ${account.email} - ${data.message || 'Unknown error'}`);
      return { success: false, account, reason: data.message };
    }
  } catch (error) {
    log.error(`Network error for ${account.email}: ${error.message}`);
    return { success: false, account, reason: error.message };
  }
}

/**
 * 연결 테스트
 */
async function testConnection(apiUrl) {
  try {
    log.info(`Testing connection to ${apiUrl}...`);
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      timeout: 5000
    });

    if (response.ok) {
      log.success('API server is reachable');
      return true;
    } else {
      log.warning(`API server responded with status ${response.status}`);
      // 상태 코드가 있다면 서버는 실행 중이므로 계속 진행
      return true;
    }
  } catch (error) {
    // health 엔드포인트가 없을 수 있으므로 경고만 표시
    log.warning('Health check failed, but will try to create accounts anyway');
    return true;
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('\n🚀 DOT Platform Test Account Creator\n'.bold);

  // 환경 파라미터 확인
  const environment = process.argv[2] || 'local';
  const apiUrl = API_URLS[environment];

  if (!apiUrl) {
    log.error(`Invalid environment: ${environment}`);
    log.info('Available environments: ' + Object.keys(API_URLS).join(', '));
    process.exit(1);
  }

  log.info(`Environment: ${environment}`);
  log.info(`API URL: ${apiUrl}\n`);

  // 연결 테스트
  const isConnected = await testConnection(apiUrl);
  if (!isConnected) {
    log.error('Could not connect to API server');
    process.exit(1);
  }

  console.log(''); // 빈 줄 추가

  // 계정 생성
  const results = {
    created: [],
    duplicates: [],
    failed: []
  };

  for (const account of TEST_ACCOUNTS) {
    const result = await createAccount(apiUrl, account);

    if (result.success) {
      results.created.push(result.account);
    } else if (result.reason === 'duplicate') {
      results.duplicates.push(result.account);
    } else {
      results.failed.push(result.account);
    }

    // API 부하 방지를 위한 딜레이
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 결과 요약
  console.log('\n📊 Summary\n'.bold);

  if (results.created.length > 0) {
    console.log('✅ Created accounts:'.green);
    results.created.forEach(acc => {
      console.log(`   - ${acc.email} (${acc.description})`);
    });
  }

  if (results.duplicates.length > 0) {
    console.log('\n⚠️  Already existing accounts:'.yellow);
    results.duplicates.forEach(acc => {
      console.log(`   - ${acc.email} (${acc.description})`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n❌ Failed to create:'.red);
    results.failed.forEach(acc => {
      console.log(`   - ${acc.email} (${acc.description})`);
    });
  }

  // 로그인 정보 출력
  console.log('\n🔐 Login Credentials\n'.bold);
  console.log('All test accounts use the same password: TestPass123!'.cyan);
  console.log('\nAccounts:');
  TEST_ACCOUNTS.forEach(acc => {
    console.log(`   📧 ${acc.email.padEnd(20)} - ${acc.description}`);
  });

  console.log('\n✨ Done!\n'.green.bold);
}

// 에러 핸들링
process.on('unhandledRejection', (error) => {
  log.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});

// 스크립트 실행
if (require.main === module) {
  main().catch((error) => {
    log.error(`Script failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { createAccount, TEST_ACCOUNTS };