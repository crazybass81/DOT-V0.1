/**
 * Redis 연결 설정
 * 세션 관리 및 캐싱을 위한 Redis 클라이언트
 */

const redis = require('redis');
const logger = require('../utils/logger');

// Redis 연결 설정
const redisConfig = {
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || (process.env.NODE_ENV === 'test' ? 6380 : 6379)}`,
  socket: {
    connectTimeout: 5000,
    commandTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis 재연결 시도 횟수 초과');
        return false;
      }
      const delay = Math.min(retries * 100, 3000);
      logger.info(`Redis 재연결 시도 ${retries}회, ${delay}ms 후 재시도`);
      return delay;
    }
  },
  // 연결이 끊어져도 명령을 큐에 저장
  enableOfflineQueue: true,
  // 자동 파이프라이닝으로 성능 향상
  enableAutoPipelining: true,
  // 메모리 사용량 최적화
  lazyConnect: true,
  // 한국 시간대 고려한 기본 TTL (1시간)
  defaultTTL: 3600
};

// Redis 클라이언트 생성
const client = redis.createClient(redisConfig);

// Redis 연결 상태
let isConnected = false;

// Redis 연결
client.connect().then(() => {
  isConnected = true;
  logger.info('Redis 연결 성공');
}).catch((err) => {
  logger.error('Redis 연결 실패:', err);
});

// Redis 이벤트 핸들러
client.on('error', (err) => {
  logger.error('Redis 클라이언트 에러:', err);
  isConnected = false;
});

client.on('connect', () => {
  logger.info('Redis 연결됨');
  isConnected = true;
});

client.on('reconnecting', () => {
  logger.info('Redis 재연결 중...');
  isConnected = false;
});

client.on('ready', () => {
  logger.info('Redis 준비 완료');
  isConnected = true;
});

// 헬퍼 함수들

/**
 * Redis 연결 상태 확인
 */
function isRedisConnected() {
  return isConnected && client.isReady;
}

/**
 * 키 존재 여부 확인
 */
async function exists(key) {
  try {
    return await client.exists(key);
  } catch (error) {
    logger.error('Redis exists 에러:', error);
    throw error;
  }
}

/**
 * TTL과 함께 값 설정
 */
async function setWithTTL(key, value, ttlSeconds) {
  try {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
    await client.setEx(key, ttlSeconds, stringValue);
  } catch (error) {
    logger.error('Redis setWithTTL 에러:', error);
    throw error;
  }
}

/**
 * 값 가져오기
 */
async function get(key) {
  try {
    const value = await client.get(key);
    if (!value) return null;

    // JSON 파싱 시도
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    logger.error('Redis get 에러:', error);
    throw error;
  }
}

/**
 * 여러 키 삭제
 */
async function deleteKeys(pattern) {
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    return keys.length;
  } catch (error) {
    logger.error('Redis deleteKeys 에러:', error);
    throw error;
  }
}

/**
 * 캐시 헬퍼: 캐시가 있으면 반환, 없으면 함수 실행 후 캐시
 */
async function cacheOrExecute(key, ttlSeconds, fn) {
  try {
    // 캐시 확인
    const cached = await get(key);
    if (cached) {
      logger.debug(`캐시 히트: ${key}`);
      return cached;
    }

    // 함수 실행
    const result = await fn();

    // 결과 캐싱
    if (result !== null && result !== undefined) {
      await setWithTTL(key, result, ttlSeconds);
      logger.debug(`캐시 저장: ${key}`);
    }

    return result;
  } catch (error) {
    logger.error('cacheOrExecute 에러:', error);
    // 에러 시 함수만 실행
    return await fn();
  }
}

/**
 * 세션 관리 헬퍼 함수들
 */
async function setSession(sessionId, sessionData, ttlSeconds = redisConfig.defaultTTL) {
  const key = `session:${sessionId}`;
  await setWithTTL(key, sessionData, ttlSeconds);
}

async function getSession(sessionId) {
  const key = `session:${sessionId}`;
  return await get(key);
}

async function deleteSession(sessionId) {
  const key = `session:${sessionId}`;
  return await client.del(key);
}

/**
 * 한국 특화 캐시 키 생성
 */
function createKoreanCacheKey(type, identifier) {
  const timestamp = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\./g, '-').replace(/\s/g, '');

  return `kr:${type}:${identifier}:${timestamp}`;
}

// 기본 클라이언트와 헬퍼 함수들을 export
module.exports = client;
module.exports.config = redisConfig;
module.exports.isConnected = isRedisConnected;
module.exports.exists = exists;
module.exports.setWithTTL = setWithTTL;
module.exports.get = get;
module.exports.deleteKeys = deleteKeys;
module.exports.cacheOrExecute = cacheOrExecute;

// 세션 관리
module.exports.setSession = setSession;
module.exports.getSession = getSession;
module.exports.deleteSession = deleteSession;

// 한국 특화 기능
module.exports.createKoreanCacheKey = createKoreanCacheKey;

// 파이프라인 지원
module.exports.pipeline = () => client.pipeline();

// 헬스체크
module.exports.healthCheck = async () => {
  try {
    await client.ping();
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
  }
};