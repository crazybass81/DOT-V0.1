/**
 * Rate Limiter 미들웨어
 * API 요청 속도 제한을 위한 미들웨어
 * Redis를 사용한 sliding window 방식 구현
 */

const redis = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Rate Limiter 설정 옵션
 */
const defaultOptions = {
  windowMs: 60 * 1000, // 1분
  maxRequests: 100, // 분당 최대 요청 수
  message: 'Too many requests from this IP, please try again later.',
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyPrefix: 'rate_limit:'
};

/**
 * IP 기반 Rate Limiter
 * @param {Object} options - Rate limiter 설정
 */
function createRateLimiter(options = {}) {
  const config = { ...defaultOptions, ...options };

  return async function rateLimiter(req, res, next) {
    // 개발 환경에서는 rate limiting 비활성화
    if (process.env.NODE_ENV === 'development' && !process.env.ENABLE_RATE_LIMIT) {
      return next();
    }

    try {
      // 클라이언트 식별 (IP 주소 또는 인증된 사용자)
      const identifier = req.user?.id ||
                        req.headers['x-forwarded-for'] ||
                        req.connection.remoteAddress ||
                        req.ip;

      const key = `${config.keyPrefix}${identifier}`;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Redis 파이프라인으로 원자적 실행
      const pipeline = redis.pipeline();

      // 만료된 요청 제거
      pipeline.zremrangebyscore(key, '-inf', windowStart);

      // 현재 요청 추가
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // 현재 윈도우의 요청 수 카운트
      pipeline.zcard(key);

      // TTL 설정
      pipeline.expire(key, Math.ceil(config.windowMs / 1000));

      const results = await pipeline.exec();
      const requestCount = results[2][1]; // zcard 결과

      // Rate limit 헤더 설정
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - requestCount));
      res.setHeader('X-RateLimit-Reset', new Date(now + config.windowMs).toISOString());

      // 제한 초과 확인
      if (requestCount > config.maxRequests) {
        // 초과된 요청 제거 (롤백)
        await redis.zrem(key, `${now}-${Math.random()}`);

        logger.warn(`Rate limit exceeded for ${identifier}`, {
          ip: identifier,
          requests: requestCount,
          limit: config.maxRequests
        });

        return res.status(429).json({
          success: false,
          error: config.message,
          retryAfter: Math.ceil(config.windowMs / 1000)
        });
      }

      // 성공/실패에 따른 스킵 옵션 처리
      const originalSend = res.send;
      res.send = function(data) {
        const statusCode = res.statusCode;

        // 성공 요청 스킵
        if (config.skipSuccessfulRequests && statusCode < 400) {
          redis.zrem(key, `${now}-${Math.random()}`).catch(err => {
            logger.error('Rate limiter cleanup error:', err);
          });
        }

        // 실패 요청 스킵
        if (config.skipFailedRequests && statusCode >= 400) {
          redis.zrem(key, `${now}-${Math.random()}`).catch(err => {
            logger.error('Rate limiter cleanup error:', err);
          });
        }

        return originalSend.call(this, data);
      };

      next();

    } catch (error) {
      logger.error('Rate limiter error:', error);
      // Redis 오류 시 요청 통과 (fail open)
      next();
    }
  };
}

/**
 * 사전 정의된 rate limiter 설정
 */
const rateLimiters = {
  // 일반 API 엔드포인트용
  general: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100
  }),

  // 인증 엔드포인트용 (더 엄격함)
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15분
    maxRequests: 5,
    message: '너무 많은 인증 시도입니다. 15분 후 다시 시도해주세요.',
    skipSuccessfulRequests: true
  }),

  // 파일 업로드용
  upload: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: '파일 업로드 제한을 초과했습니다. 잠시 후 다시 시도해주세요.'
  }),

  // WebSocket 연결용
  websocket: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'WebSocket 연결 제한을 초과했습니다.'
  })
};

// 동적 rate limiter 생성 함수
rateLimiters.custom = createRateLimiter;

// 하위 호환성을 위한 별칭
rateLimiters.apiLimiter = rateLimiters.general;

module.exports = rateLimiters;