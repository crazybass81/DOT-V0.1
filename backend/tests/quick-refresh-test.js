/**
 * 빠른 토큰 갱신 API 테스트
 */

const request = require('supertest');
const { Pool } = require('pg');

async function testRefresh() {
  const pgPool = new Pool({
    host: 'localhost',
    port: 5435,
    database: 'dot_platform_test',
    user: 'postgres',
    password: 'postgres123'
  });

  try {
    // 기존 데이터 삭제
    await pgPool.query('DELETE FROM user_roles WHERE 1=1');
    await pgPool.query('DELETE FROM users WHERE 1=1');
    console.log('✅ 테이블 초기화 완료');
  } catch (error) {
    console.log('초기화 실패:', error.message);
  }

  // Express 앱 가져오기
  process.env.NODE_ENV = 'test';
  const app = require('../src/app');

  // 1. 먼저 회원가입 및 로그인
  const timestamp = Date.now();
  const userData = {
    email: `refresh${timestamp}@example.com`,
    password: 'SecurePass123!',
    name: '토큰테스트',
    phone: `010-${String(timestamp).slice(-4)}-1234`
  };

  console.log('\n1. 회원가입 및 로그인...');
  let refreshToken = '';

  try {
    // 회원가입
    await request(app)
      .post('/api/v1/auth/register')
      .send(userData)
      .expect(201);

    // 로그인
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: userData.email,
        password: userData.password
      })
      .expect(200);

    refreshToken = loginResponse.body.refreshToken;
    console.log('✅ 로그인 성공, 리프레시 토큰 획득');
  } catch (error) {
    console.error('❌ 회원가입/로그인 실패:', error.message);
    await pgPool.end();
    process.exit(1);
  }

  // 2. 토큰 갱신 테스트
  console.log('\n2. 토큰 갱신 시도...');
  try {
    const refreshResponse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    console.log('✅ 토큰 갱신 성공!');
    console.log('  - 새 액세스 토큰:', refreshResponse.body.accessToken ? '발급됨' : '없음');
    console.log('  - 새 리프레시 토큰:', refreshResponse.body.refreshToken ? '발급됨' : '없음');

    // 새 토큰이 기존과 다른지 확인
    if (refreshResponse.body.refreshToken === refreshToken) {
      console.log('⚠️ 경고: 새 리프레시 토큰이 기존과 동일함');
    } else {
      console.log('✅ 새 리프레시 토큰이 정상 발급됨');
    }
  } catch (error) {
    console.error('❌ 토큰 갱신 실패:', error.message);
    if (error.response) {
      console.error('응답:', error.response.body);
    }
  }

  // 3. 빈 토큰으로 시도
  console.log('\n3. 빈 토큰으로 갱신 시도...');
  try {
    await request(app)
      .post('/api/v1/auth/refresh')
      .send({})
      .expect(400);

    console.log('✅ 예상대로 400 에러 반환');
  } catch (error) {
    console.error('❌ 예상치 못한 응답:', error.message);
  }

  // 4. 잘못된 토큰으로 시도
  console.log('\n4. 잘못된 토큰으로 갱신 시도...');
  try {
    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid_token_12345' })
      .expect(401);

    console.log('✅ 예상대로 401 에러 반환');
  } catch (error) {
    console.error('❌ 예상치 못한 응답:', error.message);
  }

  // 5. 이미 사용한 토큰으로 시도
  console.log('\n5. 이미 사용한 토큰으로 재시도...');
  try {
    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    console.log('✅ 예상대로 401 에러 반환 (이미 사용된 토큰)');
  } catch (error) {
    console.error('❌ 예상치 못한 응답:', error.message);
  }

  await pgPool.end();
  console.log('\n✅ 모든 테스트 완료!');
  process.exit(0);
}

testRefresh().catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});