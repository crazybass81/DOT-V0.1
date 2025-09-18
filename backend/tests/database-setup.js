/**
 * 데이터베이스 테스트 설정
 * 실제 PostgreSQL과 Redis 연결 설정
 */

const { initDatabase, closeDatabase } = require('../src/config/database');
const redis = require('../src/config/redis');

// 전역 데이터베이스 설정
beforeAll(async () => {
  // 테스트 환경 확인
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('테스트는 NODE_ENV=test 환경에서만 실행할 수 있습니다.');
  }

  // PostgreSQL 연결 초기화 및 확인
  try {
    const pool = await initDatabase();
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL 연결 성공');
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error.message);
    throw error;
  }

  // Redis 연결 확인
  try {
    await redis.ping();
    console.log('✅ Redis 연결 성공');
  } catch (error) {
    console.error('❌ Redis 연결 실패:', error.message);
    throw error;
  }
});

// 모든 테스트 완료 후 연결 정리
afterAll(async () => {
  try {
    // PostgreSQL 연결 종료
    await closeDatabase();
    console.log('✅ PostgreSQL 연결 종료');
  } catch (error) {
    console.error('❌ PostgreSQL 연결 종료 실패:', error.message);
  }

  try {
    // Redis 연결 종료
    await redis.quit();
    console.log('✅ Redis 연결 종료');
  } catch (error) {
    console.error('❌ Redis 연결 종료 실패:', error.message);
  }
});