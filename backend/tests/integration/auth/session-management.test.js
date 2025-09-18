const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { User, Session } = require('../../../src/models');
const Redis = require('redis');

// Redis 세션 관리 통합 테스트
describe.skip('Redis Session Management Integration', () => {
  let server;
  let redisClient;
  let testUser;
  let accessToken;
  let refreshToken;
  let sessionId;

  beforeAll(async () => {
    // 테스트용 서버 시작
    server = app.listen();

    // Redis 클라이언트 연결
    redisClient = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_TEST_DB || 1 // 테스트용 DB 사용
    });

    await redisClient.connect();

    // 데이터베이스 초기화
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    // Redis 테스트 데이터 정리
    await redisClient.flushDb();
    await redisClient.disconnect();

    // 데이터베이스 정리
    await sequelize.close();

    // 서버 종료
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(async () => {
    // 각 테스트 전 데이터 초기화
    await redisClient.flushDb(); // Redis 테스트 DB 초기화
    await User.destroy({ where: {}, force: true });
    await Session.destroy({ where: {}, force: true });
  });

  describe('Session Lifecycle Management', () => {
    test('1단계: 로그인 시 Redis 세션 생성', async () => {
      // 사전 준비: 테스트 사용자 생성
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // 로그인 요청
      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data.tokens.accessToken).toBeTruthy();
      expect(loginResponse.body.data.tokens.refreshToken).toBeTruthy();

      accessToken = loginResponse.body.data.tokens.accessToken;
      refreshToken = loginResponse.body.data.tokens.refreshToken;
      sessionId = loginResponse.body.data.sessionId;

      // Redis에서 세션 데이터 확인
      const sessionData = await redisClient.get(`session:${sessionId}`);
      expect(sessionData).toBeTruthy();

      const parsedSession = JSON.parse(sessionData);
      expect(parsedSession.userId).toBe(testUser.id);
      expect(parsedSession.email).toBe(testUser.email);
      expect(parsedSession.role).toBe(testUser.role);
      expect(parsedSession.isActive).toBe(true);

      // PostgreSQL에서 세션 레코드 확인
      const sessionRecord = await Session.findOne({
        where: { sessionId: sessionId }
      });
      expect(sessionRecord).toBeTruthy();
      expect(sessionRecord.userId).toBe(testUser.id);
      expect(sessionRecord.isActive).toBe(true);
    });

    test('2단계: 토큰 갱신 시 세션 유지 및 업데이트', async () => {
      // 사전 준비: 로그인된 사용자와 세션
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      sessionId = 'test-session-id';
      const initialSessionData = {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        deviceInfo: {
          userAgent: 'test-agent',
          ip: '127.0.0.1'
        }
      };

      // Redis에 초기 세션 저장
      await redisClient.setEx(
        `session:${sessionId}`,
        3600, // 1시간 TTL
        JSON.stringify(initialSessionData)
      );

      // PostgreSQL에 세션 레코드 저장
      await Session.create({
        sessionId: sessionId,
        userId: testUser.id,
        refreshToken: 'old-refresh-token',
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000) // 1시간 후
      });

      refreshToken = 'old-refresh-token';

      // 토큰 갱신 요청
      const refreshResponse = await request(server)
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken
        });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.data.tokens.accessToken).toBeTruthy();
      expect(refreshResponse.body.data.tokens.refreshToken).toBeTruthy();

      // 새로운 토큰이 이전과 다른지 확인
      expect(refreshResponse.body.data.tokens.refreshToken).not.toBe(refreshToken);

      // Redis 세션이 업데이트되었는지 확인
      const updatedSessionData = await redisClient.get(`session:${sessionId}`);
      const parsedUpdatedSession = JSON.parse(updatedSessionData);
      expect(parsedUpdatedSession.lastAccessedAt).not.toBe(initialSessionData.lastAccessedAt);
      expect(parsedUpdatedSession.isActive).toBe(true);

      // PostgreSQL 세션 레코드 업데이트 확인
      const updatedSessionRecord = await Session.findOne({
        where: { sessionId: sessionId }
      });
      expect(updatedSessionRecord.refreshToken).toBe(refreshResponse.body.data.tokens.refreshToken);
      expect(updatedSessionRecord.isActive).toBe(true);
    });

    test('3단계: 로그아웃 시 Redis 및 PostgreSQL 세션 삭제', async () => {
      // 사전 준비: 활성 세션이 있는 로그인된 사용자
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      sessionId = 'active-session-id';
      accessToken = 'valid-access-token';

      // Redis에 활성 세션 저장
      const sessionData = {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      };

      await redisClient.setEx(
        `session:${sessionId}`,
        3600,
        JSON.stringify(sessionData)
      );

      // PostgreSQL에 세션 레코드 저장
      await Session.create({
        sessionId: sessionId,
        userId: testUser.id,
        refreshToken: 'current-refresh-token',
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000)
      });

      // 로그아웃 요청
      const logoutResponse = await request(server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: sessionId
        });

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);

      // Redis에서 세션이 삭제되었는지 확인
      const deletedSession = await redisClient.get(`session:${sessionId}`);
      expect(deletedSession).toBeNull();

      // PostgreSQL에서 세션이 비활성화되었는지 확인
      const deactivatedSession = await Session.findOne({
        where: { sessionId: sessionId }
      });
      expect(deactivatedSession.isActive).toBe(false);
      expect(deactivatedSession.loggedOutAt).toBeTruthy();
    });

    test('4단계: 세션 만료 자동 처리', async () => {
      // 사전 준비: 만료된 세션
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      sessionId = 'expired-session-id';
      accessToken = 'expired-access-token';

      // Redis에 짧은 TTL로 세션 저장 (즉시 만료되도록)
      const sessionData = {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      };

      await redisClient.setEx(
        `session:${sessionId}`,
        1, // 1초 TTL
        JSON.stringify(sessionData)
      );

      // PostgreSQL에 만료된 세션 레코드 저장
      await Session.create({
        sessionId: sessionId,
        userId: testUser.id,
        refreshToken: 'expired-refresh-token',
        isActive: true,
        expiresAt: new Date(Date.now() - 1000) // 1초 전 만료
      });

      // 1초 대기하여 Redis 세션 만료
      await new Promise(resolve => setTimeout(resolve, 1100));

      // 만료된 토큰으로 보호된 리소스 접근 시도
      const protectedResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(protectedResponse.status).toBe(401);
      expect(protectedResponse.body.success).toBe(false);
      expect(protectedResponse.body.error.code).toBe('SESSION_EXPIRED');

      // Redis에서 세션이 만료되었는지 확인
      const expiredSession = await redisClient.get(`session:${sessionId}`);
      expect(expiredSession).toBeNull();

      // 만료된 세션 정리 API 호출 시뮬레이션
      const cleanupResponse = await request(server)
        .delete('/api/auth/cleanup-expired-sessions')
        .set('Authorization', 'Bearer admin-token');

      expect(cleanupResponse.status).toBe(200);

      // PostgreSQL에서 만료된 세션이 비활성화되었는지 확인
      const cleanedSession = await Session.findOne({
        where: { sessionId: sessionId }
      });
      expect(cleanedSession.isActive).toBe(false);
    });

    test('5단계: 다중 디바이스 세션 관리', async () => {
      // 사전 준비: 여러 디바이스에서 로그인할 사용자
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // 첫 번째 디바이스 (웹)에서 로그인
      const webLoginResponse = await request(server)
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Web Browser)')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#',
          deviceInfo: {
            type: 'WEB',
            name: 'Chrome Browser',
            os: 'Windows 10'
          }
        });

      const webSessionId = webLoginResponse.body.data.sessionId;
      const webAccessToken = webLoginResponse.body.data.tokens.accessToken;

      // 두 번째 디바이스 (모바일)에서 로그인
      const mobileLoginResponse = await request(server)
        .post('/api/auth/login')
        .set('User-Agent', 'DOT-Mobile-App/1.0')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#',
          deviceInfo: {
            type: 'MOBILE',
            name: 'DOT Mobile App',
            os: 'iOS 17.0'
          }
        });

      const mobileSessionId = mobileLoginResponse.body.data.sessionId;
      const mobileAccessToken = mobileLoginResponse.body.data.tokens.accessToken;

      // 두 세션이 모두 활성 상태인지 확인
      expect(webSessionId).not.toBe(mobileSessionId);

      // Redis에서 두 세션 모두 확인
      const webSession = await redisClient.get(`session:${webSessionId}`);
      const mobileSession = await redisClient.get(`session:${mobileSessionId}`);
      expect(webSession).toBeTruthy();
      expect(mobileSession).toBeTruthy();

      // 사용자의 모든 활성 세션 조회
      const sessionsResponse = await request(server)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${webAccessToken}`);

      expect(sessionsResponse.status).toBe(200);
      expect(sessionsResponse.body.data.sessions.length).toBe(2);

      // 특정 디바이스 세션 종료 (모바일 세션 종료)
      const terminateResponse = await request(server)
        .delete(`/api/auth/sessions/${mobileSessionId}`)
        .set('Authorization', `Bearer ${webAccessToken}`);

      expect(terminateResponse.status).toBe(200);

      // 모바일 세션이 종료되었는지 확인
      const terminatedMobileSession = await redisClient.get(`session:${mobileSessionId}`);
      expect(terminatedMobileSession).toBeNull();

      // 웹 세션은 여전히 활성 상태인지 확인
      const activeWebSession = await redisClient.get(`session:${webSessionId}`);
      expect(activeWebSession).toBeTruthy();

      // 모바일 토큰으로 접근 시도 시 실패 확인
      const mobileAccessResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${mobileAccessToken}`);

      expect(mobileAccessResponse.status).toBe(401);

      // 웹 토큰으로는 정상 접근 가능 확인
      const webAccessResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${webAccessToken}`);

      expect(webAccessResponse.status).toBe(200);
    });
  });

  describe('Session Security Features', () => {
    test('세션 하이재킹 감지 및 방어', async () => {
      // 사전 준비: 정상 로그인된 사용자
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      const loginResponse = await request(server)
        .post('/api/auth/login')
        .set('User-Agent', 'Original-Browser')
        .set('X-Forwarded-For', '192.168.1.100')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#'
        });

      sessionId = loginResponse.body.data.sessionId;
      accessToken = loginResponse.body.data.tokens.accessToken;

      // 다른 IP/User-Agent에서 같은 세션으로 접근 시도 (하이재킹 시뮬레이션)
      const hijackResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('User-Agent', 'Malicious-Browser')
        .set('X-Forwarded-For', '10.0.0.1');

      expect(hijackResponse.status).toBe(401);
      expect(hijackResponse.body.error.code).toBe('SESSION_SECURITY_VIOLATION');

      // 원래 세션이 자동으로 무효화되었는지 확인
      const invalidatedSession = await redisClient.get(`session:${sessionId}`);
      expect(invalidatedSession).toBeNull();

      // 보안 로그가 기록되었는지 확인
      const securityLogsResponse = await request(server)
        .get('/api/admin/security-logs')
        .set('Authorization', 'Bearer admin-token')
        .query({ userId: testUser.id });

      expect(securityLogsResponse.body.data.logs.length).toBeGreaterThan(0);
      expect(securityLogsResponse.body.data.logs[0].type).toBe('SESSION_HIJACK_ATTEMPT');
    });

    test('동시 로그인 제한 및 관리', async () => {
      // 사전 준비: 동시 로그인 제한이 설정된 사용자
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true,
        maxConcurrentSessions: 2 // 최대 2개 세션만 허용
      });

      // 첫 번째 세션
      const session1Response = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#',
          deviceInfo: { type: 'WEB', name: 'Chrome' }
        });

      // 두 번째 세션
      const session2Response = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#',
          deviceInfo: { type: 'MOBILE', name: 'App' }
        });

      // 세 번째 세션 시도 (제한 초과)
      const session3Response = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#',
          deviceInfo: { type: 'TABLET', name: 'iPad' }
        });

      expect(session3Response.status).toBe(400);
      expect(session3Response.body.error.code).toBe('MAX_SESSIONS_EXCEEDED');

      // 기존 세션을 강제 종료하고 새 세션 생성
      const forceLoginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#',
          deviceInfo: { type: 'TABLET', name: 'iPad' },
          forceLogin: true // 가장 오래된 세션 자동 종료
        });

      expect(forceLoginResponse.status).toBe(200);

      // 가장 오래된 세션(첫 번째)이 종료되었는지 확인
      const oldSessionCheck = await redisClient.get(`session:${session1Response.body.data.sessionId}`);
      expect(oldSessionCheck).toBeNull();
    });
  });

  describe('Session Performance and Monitoring', () => {
    test('세션 성능 모니터링 및 메트릭 수집', async () => {
      // 사전 준비: 여러 사용자의 세션 생성
      const users = [];
      const sessions = [];

      for (let i = 0; i < 5; i++) {
        const user = await User.create({
          email: `user${i}@example.com`,
          password: '$2b$10$hashedPassword',
          firstName: '사용자',
          lastName: `${i}`,
          phoneNumber: `010-1234-567${i}`,
          role: 'SEEKER',
          isVerified: true
        });

        const loginResponse = await request(server)
          .post('/api/auth/login')
          .send({
            email: `user${i}@example.com`,
            password: 'Test123!@#'
          });

        users.push(user);
        sessions.push(loginResponse.body.data.sessionId);
      }

      // 세션 메트릭 수집 API 호출
      const metricsResponse = await request(server)
        .get('/api/admin/session-metrics')
        .set('Authorization', 'Bearer admin-token');

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.data.metrics.totalActiveSessions).toBe(5);
      expect(metricsResponse.body.data.metrics.averageSessionDuration).toBeTruthy();
      expect(metricsResponse.body.data.metrics.sessionsPerRole.SEEKER).toBe(5);

      // Redis 메모리 사용량 확인
      const redisInfo = await redisClient.info('memory');
      expect(redisInfo).toContain('used_memory');

      // 세션 정리 작업 실행
      const cleanupResponse = await request(server)
        .post('/api/admin/session-cleanup')
        .set('Authorization', 'Bearer admin-token')
        .send({
          olderThan: '1h', // 1시간 이상 비활성 세션 정리
          maxSessions: 1000 // 최대 유지할 세션 수
        });

      expect(cleanupResponse.status).toBe(200);
      expect(cleanupResponse.body.data.cleanedSessions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Session Error Handling', () => {
    test('Redis 연결 실패 시 fallback 메커니즘', async () => {
      // Redis 연결 임시 차단 시뮬레이션
      await redisClient.disconnect();

      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // Redis 없이 로그인 시도 (PostgreSQL 세션만 사용)
      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);

      // PostgreSQL에만 세션이 저장되었는지 확인
      const sessionRecord = await Session.findOne({
        where: { userId: testUser.id, isActive: true }
      });
      expect(sessionRecord).toBeTruthy();

      // Redis 연결 복구
      await redisClient.connect();
    });
  });
});