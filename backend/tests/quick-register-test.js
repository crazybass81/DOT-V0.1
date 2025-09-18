/**
 * 빠른 회원가입 API 테스트
 */

const request = require('supertest');
const { Pool } = require('pg');

async function testRegister() {
  // DB 초기화
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

    // 현재 users 테이블 확인
    const existingUsers = await pgPool.query('SELECT email FROM users');
    console.log('현재 users 수:', existingUsers.rows.length);
  } catch (error) {
    console.log('테이블이 없거나 초기화 실패:', error.message);
  }

  // Express 앱 가져오기
  process.env.NODE_ENV = 'test';
  const app = require('../src/app');

  // 회원가입 테스트 - 매번 다른 이메일 사용
  const timestamp = Date.now();
  const registerData = {
    email: `test${timestamp}@example.com`,
    password: 'SecurePass123!',
    name: '김철수',
    phone: `010-${String(timestamp).slice(-4)}-5678`
  };

  console.log('테스트 데이터:', registerData);

  try {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send(registerData)
      .expect(201);

    console.log('✅ 회원가입 성공:', response.body);

    // DB에서 확인
    const result = await pgPool.query(
      'SELECT * FROM users WHERE email = $1',
      [registerData.email]
    );
    console.log('✅ DB 저장 확인:', result.rows[0]);

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    if (error.response) {
      console.error('응답 내용:', error.response.body);
    }
  } finally {
    await pgPool.end();
    process.exit(0);
  }
}

testRegister();