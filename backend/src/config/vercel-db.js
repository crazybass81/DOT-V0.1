/**
 * Vercel Serverless 환경을 위한 데이터베이스 설정
 * 연결 풀링 최적화 및 Serverless 호환성 보장
 */

const { Pool } = require('pg');
const redis = require('redis');

// Serverless 환경에서는 연결을 재사용
let pgPool = null;
let redisClient = null;

/**
 * PostgreSQL 연결 풀 가져오기
 * Serverless 환경에서 연결 재사용
 */
function getPgPool() {
  if (!pgPool) {
    pgPool = new Pool({
      host: process.env.POSTGRES_HOST || process.env.DB_HOST,
      port: process.env.POSTGRES_PORT || process.env.DB_PORT || 5432,
      database: process.env.POSTGRES_DATABASE || process.env.DB_NAME || 'dot_platform',
      user: process.env.POSTGRES_USER || process.env.DB_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,

      // Serverless 환경 최적화 설정
      max: 1, // Serverless에서는 연결 수 제한
      idleTimeoutMillis: 10000, // 10초 후 유휴 연결 종료
      connectionTimeoutMillis: 5000, // 5초 연결 타임아웃

      // Vercel PostgreSQL 특별 설정
      ssl: process.env.POSTGRES_SSL === 'true' ? {
        rejectUnauthorized: false
      } : false
    });

    // 에러 핸들링
    pgPool.on('error', (err) => {
      console.error('PostgreSQL 풀 에러:', err);
      pgPool = null; // 에러 시 풀 재생성
    });
  }

  return pgPool;
}

/**
 * Redis 클라이언트 가져오기
 * Serverless 환경에서 연결 재사용
 */
async function getRedisClient() {
  if (!redisClient || !redisClient.isReady) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL ||
           `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,

      // Serverless 최적화
      socket: {
        connectTimeout: 3000, // 3초 연결 타임아웃
        keepAlive: false, // Serverless에서는 keepAlive 비활성화
        reconnectStrategy: false // 재연결 비활성화
      },

      // Vercel Redis (Upstash) 설정
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME
    });

    try {
      await redisClient.connect();
    } catch (err) {
      console.error('Redis 연결 실패:', err);
      // Redis 실패해도 앱은 계속 실행
      redisClient = null;
    }
  }

  return redisClient;
}

/**
 * 연결 정리 함수
 * Serverless 함수 종료 시 호출
 */
async function cleanup() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }

  if (redisClient && redisClient.isReady) {
    await redisClient.quit();
    redisClient = null;
  }
}

module.exports = {
  getPgPool,
  getRedisClient,
  cleanup
};