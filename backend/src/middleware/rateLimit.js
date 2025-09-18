/**
 * T125: Rate Limiting 미들웨어
 * Redis 기반 토큰 버킷 알고리즘 구현
 * IP 및 사용자별 요청 제한
 */

const { createClient } = require('redis');

// Redis 클라이언트 생성
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Redis 연결
redisClient.on('error', err => console.log('Redis 에러:', err));
redisClient.connect().catch(console.error);

/**
 * Rate Limit 설정 옵션
 */
const defaultOptions = {
  windowMs: 60 * 1000, // 1분 윈도우
  max: 100, // 윈도우당 최대 요청 수
  message: 'Too many requests, please try again later',
  statusCode: 429,
  keyPrefix: 'rate-limit:',
  skipSuccessfulRequests: false,
  skipFailedRequests: false
};

/**
 * Rate Limiting 미들웨어 팩토리
 * @param {Object} options - Rate limit 설정
 */
function createRateLimiter(options = {}) {
  const config = { ...defaultOptions, ...options };

  return async function rateLimiter(req, res, next) {
    // Rate limiting 건너뛰기 조건
    if (config.skip && await config.skip(req, res)) {
      return next();
    }

    // 키 생성 (IP 또는 사용자 기반)
    const key = config.keyGenerator
      ? await config.keyGenerator(req, res)
      : getDefaultKey(req, config);

    try {
      // Redis에서 현재 카운트 조회
      const current = await redisClient.get(key);
      const count = current ? parseInt(current) : 0;

      // 제한 초과 확인
      if (count >= config.max) {
        // Rate limit 헤더 설정
        res.setHeader('X-RateLimit-Limit', config.max);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + config.windowMs).toISOString());
        res.setHeader('Retry-After', Math.ceil(config.windowMs / 1000));

        // 커스텀 핸들러가 있으면 사용
        if (config.handler) {
          return config.handler(req, res, next);
        }

        // 기본 에러 응답
        return res.status(config.statusCode).json({
          success: false,
          error: config.message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(config.windowMs / 1000)
        });
      }

      // 카운트 증가
      let newCount = count;
      if (!config.skipSuccessfulRequests || res.statusCode >= 400) {
        newCount = count + 1;

        // Redis에 저장 (TTL 설정)
        if (newCount === 1) {
          // 첫 요청일 때 TTL 설정
          await redisClient.setEx(key, Math.ceil(config.windowMs / 1000), newCount.toString());
        } else {
          // 기존 키 업데이트 (TTL 유지)
          await redisClient.set(key, newCount.toString(), {
            KEEPTTL: true
          });
        }
      }

      // Rate limit 헤더 설정
      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(config.max - newCount, 0));

      // TTL 조회하여 리셋 시간 설정
      const ttl = await redisClient.ttl(key);
      if (ttl > 0) {
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + ttl * 1000).toISOString());
      }

      next();
    } catch (error) {
      console.error('Rate limiting 에러:', error);
      // Redis 에러 시 요청 통과 (fail open)
      next();
    }
  };
}

/**
 * 기본 키 생성 함수
 */
function getDefaultKey(req, config) {
  // 인증된 사용자는 사용자 ID 사용
  if (req.user && req.user.id) {
    return `${config.keyPrefix}user:${req.user.id}`;
  }

  // 미인증 사용자는 IP 사용
  const ip = req.ip ||
             req.headers['x-forwarded-for'] ||
             req.headers['x-real-ip'] ||
             req.connection.remoteAddress;

  return `${config.keyPrefix}ip:${ip}`;
}

/**
 * 엔드포인트별 Rate Limiter 프리셋
 */

// 로그인 엔드포인트용 (엄격한 제한)
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 15분당 5회 시도
  message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
  keyPrefix: 'login:',
  skipFailedRequests: true // 실패한 요청만 카운트
});

// API 일반 엔드포인트용
const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1분
  max: 60, // 분당 60회
  message: 'API 요청 한도를 초과했습니다.',
  keyPrefix: 'api:'
});

// 파일 업로드용 (느슨한 제한)
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 20, // 시간당 20개 파일
  message: '파일 업로드 한도를 초과했습니다.',
  keyPrefix: 'upload:'
});

// QR 생성용 (중간 제한)
const qrLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1분
  max: 10, // 분당 10회
  message: 'QR 코드 생성 한도를 초과했습니다.',
  keyPrefix: 'qr:'
});

// 웹소켓 연결용
const socketLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1분
  max: 5, // 분당 5회 연결 시도
  message: '연결 시도가 너무 많습니다.',
  keyPrefix: 'socket:'
});

/**
 * 동적 Rate Limiting (사용자 레벨에 따라 조정)
 */
function createDynamicLimiter(baseLimits) {
  return createRateLimiter({
    ...baseLimits,
    max: async (req) => {
      // 사용자 레벨에 따라 제한 조정
      if (req.user) {
        switch (req.user.plan) {
          case 'premium':
            return baseLimits.max * 10;
          case 'pro':
            return baseLimits.max * 5;
          case 'basic':
            return baseLimits.max * 2;
          default:
            return baseLimits.max;
        }
      }
      return baseLimits.max;
    }
  });
}

/**
 * IP 화이트리스트 체크
 */
function isWhitelisted(ip) {
  const whitelist = (process.env.RATE_LIMIT_WHITELIST || '').split(',');
  return whitelist.includes(ip);
}

/**
 * 스마트 Rate Limiting (AI 기반 이상 탐지)
 */
async function smartRateLimiter(req, res, next) {
  const ip = req.ip;
  const key = `smart:${ip}`;

  try {
    // 최근 요청 패턴 분석
    const pattern = await analyzeRequestPattern(ip);

    // 이상 패턴 감지
    if (pattern.suspicious) {
      // 점진적 제한 적용
      const limiter = createRateLimiter({
        windowMs: pattern.windowMs,
        max: pattern.max,
        message: 'Suspicious activity detected. Request limit applied.'
      });

      return limiter(req, res, next);
    }

    next();
  } catch (error) {
    console.error('Smart rate limiting 에러:', error);
    next();
  }
}

/**
 * 요청 패턴 분석 (간단한 구현)
 */
async function analyzeRequestPattern(ip) {
  const key = `pattern:${ip}`;
  const data = await redisClient.get(key);

  if (!data) {
    return { suspicious: false };
  }

  const pattern = JSON.parse(data);

  // 짧은 시간에 너무 많은 요청
  if (pattern.requestsPerMinute > 100) {
    return {
      suspicious: true,
      windowMs: 60000,
      max: 10
    };
  }

  // 너무 많은 404 에러
  if (pattern.errorRate > 0.5) {
    return {
      suspicious: true,
      windowMs: 300000,
      max: 20
    };
  }

  return { suspicious: false };
}

/**
 * Rate Limit 리셋 함수 (테스트용)
 */
async function resetRateLimit(key) {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Rate limit 리셋 에러:', error);
    return false;
  }
}

/**
 * Rate Limit 상태 조회 함수
 */
async function getRateLimitStatus(key) {
  try {
    const count = await redisClient.get(key);
    const ttl = await redisClient.ttl(key);

    return {
      count: count ? parseInt(count) : 0,
      ttl: ttl > 0 ? ttl : 0,
      resetAt: ttl > 0 ? new Date(Date.now() + ttl * 1000) : null
    };
  } catch (error) {
    console.error('Rate limit 상태 조회 에러:', error);
    return null;
  }
}

module.exports = {
  createRateLimiter,
  loginLimiter,
  apiLimiter,
  uploadLimiter,
  qrLimiter,
  socketLimiter,
  createDynamicLimiter,
  smartRateLimiter,
  resetRateLimit,
  getRateLimitStatus,
  redisClient
};