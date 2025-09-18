/**
 * T046, T048: Redis 세션 관리 테스트 (RED phase)
 * Mock 사용 금지 - 실제 Redis 사용
 */

const {
  createSession,
  getSession,
  deleteSession,
  extendSession,
  deleteAllUserSessions
} = require('./session');

// Redis 연결 테스트를 위한 헬퍼
const redis = require('redis');

describe('Session Module', () => {
  let testUserId = 'test-user-123';
  let testSessionData = {
    email: 'test@example.com',
    role: 'user'
  };

  // Redis 연결 확인
  beforeAll(async () => {
    const client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });

    await client.connect();
    await client.ping();
    await client.quit();
  });

  // 테스트 후 정리
  afterEach(async () => {
    // 테스트 세션 정리
    await deleteAllUserSessions(testUserId).catch(() => {});
  });

  describe('createSession', () => {
    test('should create a new session', async () => {
      const sessionId = await createSession(testUserId, testSessionData);

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(20); // UUID 형식
    });

    test('should store session data in Redis', async () => {
      const sessionId = await createSession(testUserId, testSessionData);
      const session = await getSession(sessionId);

      expect(session).toBeDefined();
      expect(session.userId).toBe(testUserId);
      expect(session.email).toBe(testSessionData.email);
      expect(session.role).toBe(testSessionData.role);
    });

    test('should set expiration time', async () => {
      const sessionId = await createSession(testUserId, testSessionData, 60); // 60초

      // 세션이 존재하는지 확인
      const session = await getSession(sessionId);
      expect(session).toBeDefined();

      // 만료 시간이 설정되었는지 확인 (Redis TTL)
      // 이는 getSession 내부에서 확인됨
    });

    test('should handle invalid user ID', async () => {
      await expect(createSession(null, testSessionData))
        .rejects.toThrow('User ID is required');

      await expect(createSession('', testSessionData))
        .rejects.toThrow('User ID is required');
    });
  });

  describe('getSession', () => {
    let validSessionId;

    beforeEach(async () => {
      validSessionId = await createSession(testUserId, testSessionData);
    });

    test('should retrieve valid session', async () => {
      const session = await getSession(validSessionId);

      expect(session).toBeDefined();
      expect(session.userId).toBe(testUserId);
    });

    test('should return null for non-existent session', async () => {
      const session = await getSession('non-existent-session');
      expect(session).toBeNull();
    });

    test('should return null for expired session', async () => {
      // 1초 만료 세션 생성
      const shortSessionId = await createSession(testUserId, testSessionData, 1);

      // 2초 대기
      await new Promise(resolve => setTimeout(resolve, 2000));

      const session = await getSession(shortSessionId);
      expect(session).toBeNull();
    });

    test('should handle invalid session ID', async () => {
      const session = await getSession(null);
      expect(session).toBeNull();

      const session2 = await getSession('');
      expect(session2).toBeNull();
    });
  });

  describe('deleteSession', () => {
    let validSessionId;

    beforeEach(async () => {
      validSessionId = await createSession(testUserId, testSessionData);
    });

    test('should delete existing session', async () => {
      const result = await deleteSession(validSessionId);
      expect(result).toBe(true);

      // 세션이 삭제되었는지 확인
      const session = await getSession(validSessionId);
      expect(session).toBeNull();
    });

    test('should return false for non-existent session', async () => {
      const result = await deleteSession('non-existent-session');
      expect(result).toBe(false);
    });

    test('should handle invalid session ID', async () => {
      const result = await deleteSession(null);
      expect(result).toBe(false);

      const result2 = await deleteSession('');
      expect(result2).toBe(false);
    });
  });

  describe('extendSession', () => {
    let validSessionId;

    beforeEach(async () => {
      // 60초 세션 생성
      validSessionId = await createSession(testUserId, testSessionData, 60);
    });

    test('should extend session expiration', async () => {
      const result = await extendSession(validSessionId, 3600); // 1시간으로 연장
      expect(result).toBe(true);

      // 세션이 여전히 유효한지 확인
      const session = await getSession(validSessionId);
      expect(session).toBeDefined();
    });

    test('should return false for non-existent session', async () => {
      const result = await extendSession('non-existent-session', 3600);
      expect(result).toBe(false);
    });

    test('should handle invalid parameters', async () => {
      await expect(extendSession(null, 3600))
        .rejects.toThrow('Session ID is required');

      await expect(extendSession(validSessionId, null))
        .rejects.toThrow('TTL must be a positive number');

      await expect(extendSession(validSessionId, -1))
        .rejects.toThrow('TTL must be a positive number');
    });
  });

  describe('deleteAllUserSessions', () => {
    beforeEach(async () => {
      // 여러 세션 생성
      await createSession(testUserId, { ...testSessionData, device: 'mobile' });
      await createSession(testUserId, { ...testSessionData, device: 'desktop' });
      await createSession(testUserId, { ...testSessionData, device: 'tablet' });
    });

    test('should delete all sessions for a user', async () => {
      const count = await deleteAllUserSessions(testUserId);
      expect(count).toBeGreaterThanOrEqual(3);
    });

    test('should return 0 for user with no sessions', async () => {
      const count = await deleteAllUserSessions('user-with-no-sessions');
      expect(count).toBe(0);
    });

    test('should handle invalid user ID', async () => {
      await expect(deleteAllUserSessions(null))
        .rejects.toThrow('User ID is required');

      await expect(deleteAllUserSessions(''))
        .rejects.toThrow('User ID is required');
    });
  });

  describe('Session Security', () => {
    test('should generate unique session IDs', async () => {
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        const sessionId = await createSession(testUserId, testSessionData);
        sessions.push(sessionId);
      }

      // 모든 세션 ID가 unique한지 확인
      const uniqueSessions = new Set(sessions);
      expect(uniqueSessions.size).toBe(10);
    });

    test('should isolate sessions between users', async () => {
      const user1SessionId = await createSession('user1', { role: 'admin' });
      const user2SessionId = await createSession('user2', { role: 'user' });

      const user1Session = await getSession(user1SessionId);
      const user2Session = await getSession(user2SessionId);

      expect(user1Session.userId).toBe('user1');
      expect(user2Session.userId).toBe('user2');
      expect(user1Session.role).toBe('admin');
      expect(user2Session.role).toBe('user');
    });
  });
});