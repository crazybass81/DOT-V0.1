/**
 * 간단한 DB 연결 테스트
 */

const { Pool } = require('pg');
const redis = require('redis');

async function testConnections() {
  console.log('DB 연결 테스트 시작...');

  // PostgreSQL 연결 테스트
  const pgPool = new Pool({
    host: 'localhost',
    port: 5435,  // 테스트 DB 포트
    database: 'dot_platform_test',
    user: 'postgres',
    password: 'postgres123',
    max: 1
  });

  try {
    const result = await pgPool.query('SELECT NOW()');
    console.log('✅ PostgreSQL 연결 성공:', result.rows[0].now);
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error.message);
  } finally {
    await pgPool.end();
  }

  // Redis 연결 테스트
  const redisClient = redis.createClient({
    url: 'redis://localhost:6379'
  });

  try {
    await redisClient.connect();
    await redisClient.set('test', 'value');
    const value = await redisClient.get('test');
    console.log('✅ Redis 연결 성공:', value);
  } catch (error) {
    console.error('❌ Redis 연결 실패:', error.message);
  } finally {
    await redisClient.quit();
  }
}

testConnections().then(() => {
  console.log('테스트 완료');
  process.exit(0);
}).catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});