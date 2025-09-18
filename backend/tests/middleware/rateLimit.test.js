/**
 * T125: Rate Limiting 미들웨어 테스트
 * 실제 Redis 사용 (Mock 없음)
 */

const express = require('express');
const request = require('supertest');
const {
  createRateLimiter,
  loginLimiter,
  apiLimiter,
  resetRateLimit,
  getRateLimitStatus,
  redisClient
} = require('../../src/middleware/rateLimit');

describe('Rate Limiting 미들웨어', () => {
  let app;

  beforeEach(async () => {
    // 테스트용 Express 앱 생성
    app = express();

    // 테스트 전 Redis 정리
    await redisClient.flushDb();
  });

  afterAll(async () => {
    // Redis 연결 종료
    await redisClient.quit();
  });

  describe('기본 Rate Limiting', () => {
    test('제한 내에서 요청 허용', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 3,
        keyPrefix: 'test:'
      });

      app.get('/test', limiter, (req, res) => {
        res.json({ success: true });
      });

      // 3번 요청 모두 성공
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get('/test')
          .set('X-Forwarded-For', '192.168.1.1');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('3');
        expect(response.headers['x-ratelimit-remaining']).toBe(String(2 - i));
      }
    });

    test('제한 초과 시 429 응답', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 2,
        keyPrefix: 'test-exceed:'
      });

      app.get('/exceed', limiter, (req, res) => {
        res.json({ success: true });
      });

      // 2번 요청 성공
      await request(app).get('/exceed').set('X-Forwarded-For', '192.168.1.2');
      await request(app).get('/exceed').set('X-Forwarded-For', '192.168.1.2');

      // 3번째 요청 실패
      const response = await request(app)
        .get('/exceed')
        .set('X-Forwarded-For', '192.168.1.2');

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      });
      expect(response.headers['retry-after']).toBe('60');
    });

    test('다른 IP는 독립적으로 제한', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        keyPrefix: 'test-ip:'
      });

      app.get('/ip-test', limiter, (req, res) => {
        res.json({ success: true });
      });

      // IP1 요청 성공
      const response1 = await request(app)
        .get('/ip-test')
        .set('X-Forwarded-For', '192.168.1.10');
      expect(response1.status).toBe(200);

      // IP2 요청도 성공
      const response2 = await request(app)
        .get('/ip-test')
        .set('X-Forwarded-For', '192.168.1.20');
      expect(response2.status).toBe(200);

      // IP1 두번째 요청 실패
      const response3 = await request(app)
        .get('/ip-test')
        .set('X-Forwarded-For', '192.168.1.10');
      expect(response3.status).toBe(429);

      // IP2 두번째 요청도 실패
      const response4 = await request(app)
        .get('/ip-test')
        .set('X-Forwarded-For', '192.168.1.20');
      expect(response4.status).toBe(429);
    });
  });

  describe('로그인 Rate Limiting', () => {
    test('로그인 시도 제한', async () => {
      app.post('/login', loginLimiter, (req, res) => {
        res.json({ success: true });
      });

      const ip = '192.168.1.100';

      // 5번 시도 허용
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/login')
          .set('X-Forwarded-For', ip);
        expect(response.status).toBe(200);
      }

      // 6번째 시도 차단
      const response = await request(app)
        .post('/login')
        .set('X-Forwarded-For', ip);

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('로그인 시도가 너무 많습니다');
    });
  });

  describe('사용자 기반 Rate Limiting', () => {
    test('인증된 사용자는 사용자 ID로 제한', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 2,
        keyPrefix: 'user:'
      });

      app.get('/user-limit',
        // 사용자 정보 추가 미들웨어
        (req, res, next) => {
          req.user = { id: 123, email: 'user@test.com' };
          next();
        },
        limiter,
        (req, res) => {
          res.json({ success: true });
        }
      );

      // 같은 사용자로 2번 요청 성공
      await request(app).get('/user-limit');
      await request(app).get('/user-limit');

      // 3번째 요청 실패 (IP가 달라도 같은 사용자)
      const response = await request(app)
        .get('/user-limit')
        .set('X-Forwarded-For', '10.0.0.1');

      expect(response.status).toBe(429);
    });

    test('미인증 사용자는 IP로 제한', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        keyPrefix: 'anon:'
      });

      app.get('/anon-limit', limiter, (req, res) => {
        res.json({ success: true });
      });

      // 첫 요청 성공
      const response1 = await request(app)
        .get('/anon-limit')
        .set('X-Forwarded-For', '192.168.1.50');
      expect(response1.status).toBe(200);

      // 같은 IP 두번째 요청 실패
      const response2 = await request(app)
        .get('/anon-limit')
        .set('X-Forwarded-For', '192.168.1.50');
      expect(response2.status).toBe(429);
    });
  });

  describe('커스텀 설정', () => {
    test('커스텀 메시지', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        message: '커스텀 에러 메시지',
        keyPrefix: 'custom:'
      });

      app.get('/custom', limiter, (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/custom');
      const response = await request(app).get('/custom');

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('커스텀 에러 메시지');
    });

    test('커스텀 핸들러', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        keyPrefix: 'handler:',
        handler: (req, res) => {
          res.status(503).json({
            customError: '서비스 일시 중단'
          });
        }
      });

      app.get('/handler', limiter, (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/handler');
      const response = await request(app).get('/handler');

      expect(response.status).toBe(503);
      expect(response.body.customError).toBe('서비스 일시 중단');
    });

    test('skip 옵션으로 특정 요청 건너뛰기', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        keyPrefix: 'skip:',
        skip: (req) => {
          // health check는 건너뛰기
          return req.path === '/health';
        }
      });

      app.get('/limited', limiter, (req, res) => {
        res.json({ success: true });
      });

      app.get('/health', limiter, (req, res) => {
        res.json({ status: 'ok' });
      });

      // health는 무제한
      for (let i = 0; i < 5; i++) {
        const response = await request(app).get('/health');
        expect(response.status).toBe(200);
      }

      // limited는 제한 적용
      await request(app).get('/limited');
      const response = await request(app).get('/limited');
      expect(response.status).toBe(429);
    });
  });

  describe('Rate Limit 헤더', () => {
    test('Rate Limit 헤더가 올바르게 설정됨', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 5,
        keyPrefix: 'headers:'
      });

      app.get('/headers', limiter, (req, res) => {
        res.json({ success: true });
      });

      const response1 = await request(app).get('/headers');

      expect(response1.headers['x-ratelimit-limit']).toBe('5');
      expect(response1.headers['x-ratelimit-remaining']).toBe('4');
      expect(response1.headers['x-ratelimit-reset']).toBeDefined();

      // 리셋 시간이 ISO 8601 형식인지 확인
      const resetTime = new Date(response1.headers['x-ratelimit-reset']);
      expect(resetTime).toBeInstanceOf(Date);
      expect(resetTime.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('유틸리티 함수', () => {
    test('Rate Limit 리셋', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        keyPrefix: 'reset:'
      });

      app.get('/reset-test', limiter, (req, res) => {
        res.json({ success: true });
      });

      // 첫 요청 성공
      await request(app).get('/reset-test');

      // 두번째 요청 실패
      let response = await request(app).get('/reset-test');
      expect(response.status).toBe(429);

      // Rate Limit 리셋
      await resetRateLimit('reset:ip:::ffff:127.0.0.1');

      // 리셋 후 요청 성공
      response = await request(app).get('/reset-test');
      expect(response.status).toBe(200);
    });

    test('Rate Limit 상태 조회', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 3,
        keyPrefix: 'status:'
      });

      app.get('/status-test', limiter, (req, res) => {
        res.json({ success: true });
      });

      // 2번 요청
      await request(app).get('/status-test');
      await request(app).get('/status-test');

      // 상태 조회
      const status = await getRateLimitStatus('status:ip:::ffff:127.0.0.1');

      expect(status.count).toBe(2);
      expect(status.ttl).toBeGreaterThan(0);
      expect(status.ttl).toBeLessThanOrEqual(60);
      expect(status.resetAt).toBeInstanceOf(Date);
    });
  });

  describe('TTL 만료', () => {
    test('시간이 지나면 카운트 리셋', async () => {
      const limiter = createRateLimiter({
        windowMs: 1000, // 1초
        max: 1,
        keyPrefix: 'ttl:'
      });

      app.get('/ttl', limiter, (req, res) => {
        res.json({ success: true });
      });

      // 첫 요청 성공
      let response = await request(app).get('/ttl');
      expect(response.status).toBe(200);

      // 즉시 두번째 요청 실패
      response = await request(app).get('/ttl');
      expect(response.status).toBe(429);

      // 1.1초 대기
      await new Promise(resolve => setTimeout(resolve, 1100));

      // TTL 만료 후 요청 성공
      response = await request(app).get('/ttl');
      expect(response.status).toBe(200);
    });
  });

  describe('동시 요청 처리', () => {
    test('동시 요청도 정확히 카운트', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 5,
        keyPrefix: 'concurrent:'
      });

      app.get('/concurrent', limiter, (req, res) => {
        res.json({ success: true });
      });

      // 10개 동시 요청
      const promises = Array(10).fill().map(() =>
        request(app).get('/concurrent')
      );

      const responses = await Promise.all(promises);

      // 5개는 성공, 5개는 실패
      const successCount = responses.filter(r => r.status === 200).length;
      const failCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBe(5);
      expect(failCount).toBe(5);
    });
  });
});