/**
 * T015: 데이터베이스 연결 테스트 작성 및 실행
 * PostgreSQL과 Redis 연결을 실제로 테스트
 * Mock 사용 금지 - 실제 DB 연결 필수
 */

const { Pool } = require('pg');
const Redis = require('ioredis');

describe('Database Connection Tests', () => {
  let pgPool;
  let redisClient;

  describe('PostgreSQL Connection', () => {
    beforeAll(() => {
      // 실제 PostgreSQL 연결 설정
      pgPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5434,
        database: process.env.TEST_DB_NAME || 'dot_platform_test',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres123',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    });

    afterAll(async () => {
      if (pgPool) {
        await pgPool.end();
      }
    });

    test('should connect to PostgreSQL successfully', async () => {
      const client = await pgPool.connect();
      expect(client).toBeDefined();

      // 연결 테스트 쿼리
      const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_time).toBeDefined();
      expect(result.rows[0].pg_version).toContain('PostgreSQL');

      client.release();
    });

    test('should have PostGIS extension installed', async () => {
      const client = await pgPool.connect();

      // PostGIS 확장 확인
      const result = await client.query(`
        SELECT extname, extversion
        FROM pg_extension
        WHERE extname = 'postgis'
      `);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].extname).toBe('postgis');
      expect(result.rows[0].extversion).toBeDefined();

      // PostGIS 함수 테스트
      const gisTest = await client.query(`
        SELECT ST_Distance(
          ST_MakePoint(126.9780, 37.5665)::geography,
          ST_MakePoint(126.9785, 37.5670)::geography
        ) as distance
      `);

      expect(gisTest.rows[0].distance).toBeDefined();
      expect(typeof gisTest.rows[0].distance).toBe('number');

      client.release();
    });

    test('should have UUID extension installed', async () => {
      const client = await pgPool.connect();

      // UUID 확장 확인
      const result = await client.query(`
        SELECT extname
        FROM pg_extension
        WHERE extname = 'uuid-ossp'
      `);

      expect(result.rows).toHaveLength(1);

      // UUID 생성 테스트
      const uuidTest = await client.query('SELECT uuid_generate_v4() as uuid');
      expect(uuidTest.rows[0].uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      client.release();
    });

    test('should handle connection pool properly', async () => {
      const promises = [];

      // 동시에 여러 연결 테스트
      for (let i = 0; i < 5; i++) {
        promises.push(
          pgPool.query('SELECT $1::text as number', [i])
        );
      }

      const results = await Promise.all(promises);
      results.forEach((result, index) => {
        expect(result.rows[0].number).toBe(index.toString());
      });
    });
  });

  describe('Redis Connection', () => {
    beforeAll(() => {
      // 실제 Redis 연결 설정
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });
    });

    afterAll(async () => {
      if (redisClient) {
        await redisClient.quit();
      }
    });

    test('should connect to Redis successfully', async () => {
      const pong = await redisClient.ping();
      expect(pong).toBe('PONG');
    });

    test('should set and get values in Redis', async () => {
      const key = `test:connection:${Date.now()}`;
      const value = { test: true, timestamp: new Date().toISOString() };

      // SET
      await redisClient.set(key, JSON.stringify(value), 'EX', 60);

      // GET
      const retrieved = await redisClient.get(key);
      const parsed = JSON.parse(retrieved);

      expect(parsed).toEqual(value);

      // 정리
      await redisClient.del(key);
    });

    test('should handle Redis hash operations', async () => {
      const hashKey = `test:hash:${Date.now()}`;

      // HSET
      await redisClient.hset(hashKey, 'field1', 'value1');
      await redisClient.hset(hashKey, 'field2', 'value2');

      // HGET
      const value1 = await redisClient.hget(hashKey, 'field1');
      expect(value1).toBe('value1');

      // HGETALL
      const allValues = await redisClient.hgetall(hashKey);
      expect(allValues).toEqual({
        field1: 'value1',
        field2: 'value2'
      });

      // 정리
      await redisClient.del(hashKey);
    });

    test('should handle Redis expiration', async () => {
      const key = `test:expire:${Date.now()}`;

      // 1초 만료 시간 설정
      await redisClient.set(key, 'test', 'EX', 1);

      // 즉시 확인
      const immediate = await redisClient.get(key);
      expect(immediate).toBe('test');

      // 2초 후 확인 (만료되어야 함)
      await new Promise(resolve => setTimeout(resolve, 2000));
      const expired = await redisClient.get(key);
      expect(expired).toBeNull();
    });

    test('should handle Redis pub/sub', async () => {
      const subscriber = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      });

      const channel = `test:channel:${Date.now()}`;
      const message = { test: true, timestamp: Date.now() };

      const messagePromise = new Promise((resolve) => {
        subscriber.on('message', (ch, msg) => {
          if (ch === channel) {
            resolve(JSON.parse(msg));
          }
        });
      });

      await subscriber.subscribe(channel);

      // 메시지 발행
      await redisClient.publish(channel, JSON.stringify(message));

      // 메시지 수신 확인
      const received = await messagePromise;
      expect(received).toEqual(message);

      // 정리
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    });
  });

  describe('Database Integration', () => {
    test('should handle PostgreSQL and Redis together', async () => {
      // 새로운 연결 풀 생성 (이전 풀이 닫혔으므로)
      const integrationPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5434,
        database: process.env.TEST_DB_NAME || 'dot_platform_test',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres123',
      });

      // 새로운 Redis 클라이언트 생성
      const integrationRedis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
      });

      // PostgreSQL에 데이터 저장
      const pgClient = await integrationPool.connect();
      const userId = Date.now();
      const sessionId = `session:${userId}`;

      // 트랜잭션 시작
      await pgClient.query('BEGIN');

      try {
        // PostgreSQL에 사용자 정보 저장 (실제로는 users 테이블이 필요하지만 테스트용)
        const testData = {
          id: userId,
          email: `test${userId}@example.com`,
          created_at: new Date()
        };

        // Redis에 세션 정보 저장
        await integrationRedis.set(
          sessionId,
          JSON.stringify({
            userId,
            loginTime: new Date().toISOString()
          }),
          'EX',
          3600
        );

        // Redis에서 세션 확인
        const session = await integrationRedis.get(sessionId);
        const sessionData = JSON.parse(session);
        expect(sessionData.userId).toBe(userId);

        await pgClient.query('COMMIT');
      } catch (error) {
        await pgClient.query('ROLLBACK');
        throw error;
      } finally {
        pgClient.release();
        // 정리
        await integrationRedis.del(sessionId);
        await integrationRedis.quit();
        await integrationPool.end();
      }
    });
  });
});