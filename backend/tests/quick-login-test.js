/**
 * 빠른 로그인 API 테스트
 */

const request = require('supertest');
const { Pool } = require('pg');

async function testLogin() {
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

  // 1. 먼저 회원가입
  const timestamp = Date.now();
  const registerData = {
    email: `test${timestamp}@example.com`,
    password: 'SecurePass123!',
    name: '김철수',
    phone: `010-${String(timestamp).slice(-4)}-5678`
  };

  console.log('\n1. 회원가입 시도...');
  try {
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send(registerData)
      .expect(201);

    console.log('✅ 회원가입 성공:', registerResponse.body.user.email);
  } catch (error) {
    console.error('❌ 회원가입 실패:', error.message);
    await pgPool.end();
    process.exit(1);
  }

  // 2. 로그인 테스트
  console.log('\n2. 로그인 시도...');
  try {
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: registerData.email,
        password: registerData.password
      })
      .expect(200);

    console.log('✅ 로그인 성공!');
    console.log('  - User ID:', loginResponse.body.user.id);
    console.log('  - Email:', loginResponse.body.user.email);
    console.log('  - Name:', loginResponse.body.user.name);
    console.log('  - Roles:', loginResponse.body.user.roles);
    console.log('  - Access Token:', loginResponse.body.accessToken ? '발급됨' : '없음');
    console.log('  - Refresh Token:', loginResponse.body.refreshToken ? '발급됨' : '없음');

    // JWT 토큰 디코드
    if (loginResponse.body.accessToken) {
      const tokenParts = loginResponse.body.accessToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      console.log('\n액세스 토큰 정보:');
      console.log('  - 사용자 ID:', payload.userId);
      console.log('  - 이메일:', payload.email);
      console.log('  - 만료시간:', new Date(payload.exp * 1000).toLocaleString());
    }
  } catch (error) {
    console.error('❌ 로그인 실패:', error.message);
    if (error.response) {
      console.error('응답:', error.response.body);
    }
  }

  // 3. 잘못된 비밀번호로 로그인 시도
  console.log('\n3. 잘못된 비밀번호로 로그인 시도...');
  try {
    await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: registerData.email,
        password: 'WrongPassword123!'
      })
      .expect(401);

    console.log('✅ 예상대로 401 에러 반환');
  } catch (error) {
    console.error('❌ 예상치 못한 응답:', error.message);
  }

  // 4. 존재하지 않는 이메일로 로그인 시도
  console.log('\n4. 존재하지 않는 이메일로 로그인 시도...');
  try {
    await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!'
      })
      .expect(401);

    console.log('✅ 예상대로 401 에러 반환');
  } catch (error) {
    console.error('❌ 예상치 못한 응답:', error.message);
  }

  await pgPool.end();
  console.log('\n✅ 모든 테스트 완료!');
  process.exit(0);
}

testLogin().catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});