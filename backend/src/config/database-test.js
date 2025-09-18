/**
 * 테스트 전용 데이터베이스 연결 설정
 * RLS 정책 테스트를 위한 일반 사용자 계정 사용
 * 한글 주석: 테스트용 DB 풀 설정
 */

const { Pool } = require('pg');

// 기본 설정 로드 (trust 인증 방식 사용)
const config = {
  user: 'dot_test_user',        // 일반 사용자 (non-superuser)
  host: 'localhost',
  database: 'dot_platform_dev',
  // password는 생략 (trust 인증)
  port: 5432,
  max: 10,                      // 최대 연결 수
  idleTimeoutMillis: 30000,     // 유휴 연결 타임아웃
  connectionTimeoutMillis: 2000, // 연결 타임아웃
};

// 테스트용 PostgreSQL 연결 풀 생성
const testPool = new Pool(config);

// 연결 오류 핸들링
testPool.on('error', (err) => {
  console.error('테스트 DB 연결 오류:', err);
});

// 연결 테스트 함수
async function testConnection() {
  try {
    const client = await testPool.connect();
    const result = await client.query('SELECT current_user, current_database()');
    console.log('테스트 DB 연결 성공:', result.rows[0]);
    client.release();
    return true;
  } catch (error) {
    console.error('테스트 DB 연결 실패:', error.message);
    return false;
  }
}

module.exports = {
  pool: testPool,
  testConnection
};