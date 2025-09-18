/**
 * Redis 캐싱 미들웨어
 *
 * API 응답 캐싱을 통한 성능 최적화
 * - GET 요청 자동 캐싱
 * - 캐시 무효화 전략
 * - 사용자/역할별 캐시 분리
 */

const redis = require('redis');
const crypto = require('crypto');

// Redis 클라이언트 초기화
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis 재연결 실패');
        return new Error('Redis 연결 실패');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

// Redis 연결
redisClient.connect().catch(console.error);

redisClient.on('error', (err) => {
  console.error('Redis 에러:', err);
});

redisClient.on('connect', () => {
  console.log('Redis 연결 성공');
});

/**
 * 캐시 키 생성
 * URL, 쿼리 파라미터, 사용자 ID를 조합하여 고유 키 생성
 */
function generateCacheKey(req) {
  const { originalUrl, method, user } = req;
  const userId = user?.id || 'anonymous';
  const businessId = user?.businessId || 'none';

  // 캐시 키 구성 요소
  const components = {
    method,
    url: originalUrl,
    userId,
    businessId,
    role: user?.role || 'guest'
  };

  // SHA256 해시로 키 생성
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(components))
    .digest('hex');

  return `cache:${method}:${hash}`;
}

/**
 * 캐시 TTL 결정
 * 엔드포인트별로 다른 캐시 유효 시간 설정
 */
function getCacheTTL(url) {
  // 정적 데이터 - 긴 TTL
  if (url.includes('/api/v1/businesses/types')) {
    return 3600; // 1시간
  }

  // 사용자 정보 - 중간 TTL
  if (url.includes('/api/v1/users/profile')) {
    return 300; // 5분
  }

  // 근태 현황 - 짧은 TTL
  if (url.includes('/api/v1/attendance/status')) {
    return 30; // 30초
  }

  // 스케줄 정보 - 중간 TTL
  if (url.includes('/api/v1/schedules')) {
    return 180; // 3분
  }

  // 통계 데이터 - 긴 TTL
  if (url.includes('/api/v1/statistics')) {
    return 600; // 10분
  }

  // 기본 TTL
  return 60; // 1분
}

/**
 * 캐시 미들웨어
 */
const cacheMiddleware = (options = {}) => {
  const {
    enabled = true,
    ttl = 60,
    excludePaths = [],
    includeOnlyPaths = null
  } = options;

  return async (req, res, next) => {
    // 캐싱 비활성화 상태
    if (!enabled) {
      return next();
    }

    // GET 요청만 캐싱
    if (req.method !== 'GET') {
      return next();
    }

    // 제외 경로 확인
    if (excludePaths.some(path => req.originalUrl.startsWith(path))) {
      return next();
    }

    // 포함 경로 확인
    if (includeOnlyPaths && !includeOnlyPaths.some(path => req.originalUrl.startsWith(path))) {
      return next();
    }

    // 캐시 키 생성
    const cacheKey = generateCacheKey(req);

    try {
      // 캐시 조회
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        // 캐시 히트
        const data = JSON.parse(cachedData);

        // 캐시 헤더 설정
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-TTL', getCacheTTL(req.originalUrl));

        // 캐시된 응답 반환
        return res.status(data.statusCode || 200).json(data.body);
      }

      // 캐시 미스 - 응답 가로채기
      res.set('X-Cache', 'MISS');

      // 원본 json 메서드 저장
      const originalJson = res.json;

      // json 메서드 오버라이드
      res.json = function(body) {
        // 성공 응답만 캐싱
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheData = {
            statusCode: res.statusCode,
            body,
            timestamp: Date.now()
          };

          // 비동기로 캐시 저장
          const cacheTTL = getCacheTTL(req.originalUrl);
          redisClient.setex(
            cacheKey,
            cacheTTL,
            JSON.stringify(cacheData)
          ).catch(err => {
            console.error('캐시 저장 실패:', err);
          });
        }

        // 원본 json 메서드 호출
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      console.error('캐시 미들웨어 에러:', error);
      // 에러 발생시 캐싱 없이 계속 진행
      next();
    }
  };
};

/**
 * 캐시 무효화 미들웨어
 * POST, PUT, PATCH, DELETE 요청시 관련 캐시 삭제
 */
const invalidateCacheMiddleware = () => {
  return async (req, res, next) => {
    // 읽기 작업은 무시
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // 원본 json 메서드 저장
    const originalJson = res.json;

    // json 메서드 오버라이드
    res.json = function(body) {
      // 성공 응답시 캐시 무효화
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidateRelatedCache(req).catch(err => {
          console.error('캐시 무효화 실패:', err);
        });
      }

      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * 관련 캐시 무효화
 */
async function invalidateRelatedCache(req) {
  const patterns = [];

  // 엔드포인트별 무효화 패턴
  if (req.originalUrl.includes('/attendance')) {
    patterns.push('cache:GET:*attendance*');
    patterns.push('cache:GET:*statistics*');
  }

  if (req.originalUrl.includes('/schedules')) {
    patterns.push('cache:GET:*schedules*');
    patterns.push('cache:GET:*calendar*');
  }

  if (req.originalUrl.includes('/users')) {
    patterns.push(`cache:GET:*user:${req.user?.id}*`);
    patterns.push('cache:GET:*team*');
  }

  if (req.originalUrl.includes('/businesses')) {
    patterns.push(`cache:GET:*business:${req.user?.businessId}*`);
    patterns.push('cache:GET:*employees*');
  }

  // 패턴 매칭으로 키 찾기
  for (const pattern of patterns) {
    const keys = await redisClient.keys(pattern);

    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`캐시 무효화: ${keys.length}개 키 삭제 (패턴: ${pattern})`);
    }
  }
}

/**
 * 캐시 워밍 함수
 * 자주 사용되는 데이터를 미리 캐싱
 */
async function warmCache(endpoints = []) {
  const axios = require('axios');
  const baseURL = process.env.API_BASE_URL || 'http://localhost:5000';

  for (const endpoint of endpoints) {
    try {
      await axios.get(`${baseURL}${endpoint}`);
      console.log(`캐시 워밍 완료: ${endpoint}`);
    } catch (error) {
      console.error(`캐시 워밍 실패: ${endpoint}`, error.message);
    }
  }
}

/**
 * 캐시 통계 조회
 */
async function getCacheStats() {
  try {
    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbSize();

    // 통계 파싱
    const stats = {};
    info.split('\r\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    });

    return {
      totalKeys: dbSize,
      keyspaceHits: parseInt(stats.keyspace_hits || 0),
      keyspaceMisses: parseInt(stats.keyspace_misses || 0),
      hitRate: stats.keyspace_hits && stats.keyspace_misses
        ? (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses)) * 100).toFixed(2) + '%'
        : '0%',
      usedMemory: stats.used_memory_human,
      connectedClients: parseInt(stats.connected_clients || 0)
    };
  } catch (error) {
    console.error('캐시 통계 조회 실패:', error);
    return null;
  }
}

/**
 * 캐시 정리 스케줄러
 * 만료된 키와 사용되지 않는 캐시 정리
 */
function startCacheCleanup(intervalMs = 3600000) {
  setInterval(async () => {
    try {
      // 메모리 사용률 확인
      const info = await redisClient.info('memory');
      const usedMemory = parseInt(info.match(/used_memory:(\d+)/)[1]);
      const maxMemory = parseInt(info.match(/maxmemory:(\d+)/)?.[1] || '0');

      if (maxMemory > 0) {
        const usagePercent = (usedMemory / maxMemory) * 100;

        if (usagePercent > 80) {
          console.warn(`Redis 메모리 사용률 높음: ${usagePercent.toFixed(2)}%`);

          // LRU 정책에 따라 자동 정리되지만 수동으로도 정리
          const keys = await redisClient.keys('cache:*');
          const now = Date.now();

          for (const key of keys) {
            const data = await redisClient.get(key);
            if (data) {
              const parsed = JSON.parse(data);
              // 1시간 이상 된 캐시 삭제
              if (now - parsed.timestamp > 3600000) {
                await redisClient.del(key);
              }
            }
          }
        }
      }

      console.log('캐시 정리 완료');
    } catch (error) {
      console.error('캐시 정리 실패:', error);
    }
  }, intervalMs);
}

/**
 * Express 라우터 - 캐시 관리 엔드포인트
 */
const express = require('express');
const cacheRouter = express.Router();

// 캐시 통계 조회
cacheRouter.get('/stats', async (req, res) => {
  const stats = await getCacheStats();
  res.json(stats);
});

// 캐시 초기화
cacheRouter.delete('/flush', async (req, res) => {
  try {
    await redisClient.flushDb();
    res.json({ message: '캐시가 초기화되었습니다' });
  } catch (error) {
    res.status(500).json({ error: '캐시 초기화 실패' });
  }
});

// 특정 패턴 캐시 삭제
cacheRouter.delete('/pattern/:pattern', async (req, res) => {
  try {
    const pattern = req.params.pattern;
    const keys = await redisClient.keys(`cache:*${pattern}*`);

    if (keys.length > 0) {
      await redisClient.del(keys);
    }

    res.json({
      message: '캐시 삭제 완료',
      deletedKeys: keys.length
    });
  } catch (error) {
    res.status(500).json({ error: '캐시 삭제 실패' });
  }
});

// 캐시 워밍 트리거
cacheRouter.post('/warm', async (req, res) => {
  const { endpoints } = req.body;

  if (!endpoints || !Array.isArray(endpoints)) {
    return res.status(400).json({ error: 'endpoints 배열이 필요합니다' });
  }

  // 비동기로 워밍 실행
  warmCache(endpoints).catch(console.error);

  res.json({ message: '캐시 워밍이 시작되었습니다' });
});

module.exports = {
  cacheMiddleware,
  invalidateCacheMiddleware,
  warmCache,
  getCacheStats,
  startCacheCleanup,
  cacheRouter,
  redisClient
};