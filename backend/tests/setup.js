/**
 * Jest 테스트 환경 설정
 * 실제 PostgreSQL과 Redis 사용
 */

const { Pool } = require('pg');

// 테스트용 데이터베이스 풀
global.testPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: 5435,
  database: 'dot_platform_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  max: 5,
});

// 테스트용 Redis 클라이언트
const redis = require('redis');
global.testRedis = redis.createClient({
  url: `redis://localhost:6380`,
  socket: {
    connectTimeout: 5000
  }
});

// Redis 연결
beforeAll(async () => {
  try {
    await global.testRedis.connect();
    console.log('✅ Redis 연결 성공');
  } catch (error) {
    console.error('❌ Redis 연결 실패:', error);
  }
});

// 각 테스트 전 데이터 초기화
beforeEach(async () => {
  const client = await global.testPool.connect();
  try {
    // 트랜잭션으로 데이터 초기화
    await client.query('BEGIN');

    // 테이블 순서대로 삭제 (외래키 제약 고려)
    await client.query('TRUNCATE TABLE user_verifications CASCADE');
    await client.query('TRUNCATE TABLE email_verification_requests CASCADE');
    await client.query('TRUNCATE TABLE user_roles CASCADE');
    await client.query('TRUNCATE TABLE users CASCADE');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('데이터 초기화 실패:', error);
  } finally {
    client.release();
  }

  // Redis 초기화
  try {
    await global.testRedis.flushDb();
  } catch (error) {
    console.error('Redis 초기화 실패:', error);
  }
});

// 테스트 종료 후 정리
afterAll(async () => {
  try {
    await global.testPool.end();
    await global.testRedis.quit();
  } catch (error) {
    console.error('연결 종료 실패:', error);
  }
});

// 테스트 타임아웃 설정
jest.setTimeout(30000);