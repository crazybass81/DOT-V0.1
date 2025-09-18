/**
 * T047, T049: Redis 세션 관리 구현 (GREEN phase)
 * Redis를 사용한 실제 구현
 */

const redis = require('redis');
const crypto = require('crypto');

// Redis 클라이언트 싱글톤
let redisClient = null;

// 기본 세션 TTL (24시간)
const DEFAULT_SESSION_TTL = 86400;

/**
 * Redis 클라이언트 초기화
 * @returns {Promise<redis.RedisClient>} Redis 클라이언트
 */
async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    },
    password: process.env.REDIS_PASSWORD || undefined
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error', err);
  });

  await redisClient.connect();
  return redisClient;
}

/**
 * 세션 ID 생성
 * @returns {string} UUID v4 형식의 세션 ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * 세션 키 생성
 * @param {string} sessionId - 세션 ID
 * @returns {string} Redis 키
 */
function getSessionKey(sessionId) {
  return `session:${sessionId}`;
}

/**
 * 사용자 세션 인덱스 키 생성
 * @param {string} userId - 사용자 ID
 * @returns {string} Redis 키
 */
function getUserSessionsKey(userId) {
  return `user:${userId}:sessions`;
}

/**
 * 새 세션 생성
 * @param {string} userId - 사용자 ID
 * @param {object} data - 세션 데이터
 * @param {number} ttl - TTL (초), 기본값: 24시간
 * @returns {Promise<string>} 생성된 세션 ID
 */
async function createSession(userId, data = {}, ttl = DEFAULT_SESSION_TTL) {
  // 입력 검증
  if (!userId) {
    throw new Error('User ID is required');
  }

  const client = await getRedisClient();
  const sessionId = generateSessionId();
  const sessionKey = getSessionKey(sessionId);
  const userSessionsKey = getUserSessionsKey(userId);

  // 세션 데이터 준비
  const sessionData = {
    ...data,
    userId,
    createdAt: new Date().toISOString()
  };

  try {
    // 트랜잭션으로 세션 생성
    const multi = client.multi();

    // 세션 데이터 저장 (TTL 포함)
    multi.set(sessionKey, JSON.stringify(sessionData), {
      EX: ttl
    });

    // 사용자 세션 목록에 추가 (Set 자료구조)
    multi.sAdd(userSessionsKey, sessionId);

    // 사용자 세션 목록에도 TTL 설정 (더 긴 시간)
    multi.expire(userSessionsKey, ttl + 3600);

    await multi.exec();

    return sessionId;
  } catch (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }
}

/**
 * 세션 조회
 * @param {string} sessionId - 세션 ID
 * @returns {Promise<object|null>} 세션 데이터 또는 null
 */
async function getSession(sessionId) {
  // 입력 검증
  if (!sessionId) {
    return null;
  }

  const client = await getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  try {
    const data = await client.get(sessionKey);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to get session: ${error.message}`);
    return null;
  }
}

/**
 * 세션 삭제
 * @param {string} sessionId - 세션 ID
 * @returns {Promise<boolean>} 삭제 성공 여부
 */
async function deleteSession(sessionId) {
  // 입력 검증
  if (!sessionId) {
    return false;
  }

  const client = await getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  try {
    // 먼저 세션 데이터를 가져와서 userId 확인
    const sessionData = await getSession(sessionId);

    if (!sessionData) {
      return false;
    }

    // 트랜잭션으로 삭제
    const multi = client.multi();

    // 세션 데이터 삭제
    multi.del(sessionKey);

    // 사용자 세션 목록에서 제거
    if (sessionData.userId) {
      const userSessionsKey = getUserSessionsKey(sessionData.userId);
      multi.sRem(userSessionsKey, sessionId);
    }

    const results = await multi.exec();

    // 첫 번째 명령(del)의 결과가 1이면 성공
    return results && results.length > 0 && results[0] >= 1;
  } catch (error) {
    console.error(`Failed to delete session: ${error.message}`);
    return false;
  }
}

/**
 * 세션 만료 시간 연장
 * @param {string} sessionId - 세션 ID
 * @param {number} ttl - 새로운 TTL (초)
 * @returns {Promise<boolean>} 연장 성공 여부
 */
async function extendSession(sessionId, ttl) {
  // 입력 검증
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  if (!ttl || ttl <= 0) {
    throw new Error('TTL must be a positive number');
  }

  const client = await getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  try {
    // 세션이 존재하는지 확인
    const exists = await client.exists(sessionKey);

    if (!exists) {
      return false;
    }

    // TTL 업데이트
    const result = await client.expire(sessionKey, ttl);
    return result === true || result === 1;
  } catch (error) {
    throw new Error(`Failed to extend session: ${error.message}`);
  }
}

/**
 * 특정 사용자의 모든 세션 삭제
 * @param {string} userId - 사용자 ID
 * @returns {Promise<number>} 삭제된 세션 수
 */
async function deleteAllUserSessions(userId) {
  // 입력 검증
  if (!userId) {
    throw new Error('User ID is required');
  }

  const client = await getRedisClient();
  const userSessionsKey = getUserSessionsKey(userId);

  try {
    // 사용자의 모든 세션 ID 가져오기
    const sessionIds = await client.sMembers(userSessionsKey);

    if (!sessionIds || sessionIds.length === 0) {
      return 0;
    }

    // 모든 세션 삭제
    const multi = client.multi();

    for (const sessionId of sessionIds) {
      const sessionKey = getSessionKey(sessionId);
      multi.del(sessionKey);
    }

    // 사용자 세션 목록도 삭제
    multi.del(userSessionsKey);

    await multi.exec();

    return sessionIds.length;
  } catch (error) {
    throw new Error(`Failed to delete user sessions: ${error.message}`);
  }
}

/**
 * Redis 연결 종료 (테스트용)
 */
async function closeRedisConnection() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  extendSession,
  deleteAllUserSessions,
  closeRedisConnection,
  DEFAULT_SESSION_TTL
};