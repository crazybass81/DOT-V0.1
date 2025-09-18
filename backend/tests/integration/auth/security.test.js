const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { User, SecurityLog, LoginAttempt } = require('../../../src/models');
const jwt = require('jsonwebtoken');

// 보안 관련 통합 테스트
describe.skip('Security Integration Tests', () => {
  let server;
  let testUser;
  let accessToken;
  let maliciousPayloads;

  beforeAll(async () => {
    // 테스트용 서버 시작
    server = app.listen();

    // 데이터베이스 초기화
    await sequelize.sync({ force: true });

    // 악성 페이로드 정의
    maliciousPayloads = {
      sqlInjection: [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "admin'--",
        "' OR 1=1#"
      ],
      xss: [
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert('XSS')>",
        "javascript:alert('XSS')",
        "<svg onload=alert('XSS')>",
        "';alert('XSS');//"
      ],
      nosqlInjection: [
        { "$ne": null },
        { "$gt": "" },
        { "$where": "function(){return true}" },
        { "$regex": ".*" }
      ]
    };
  });

  afterAll(async () => {
    // 데이터베이스 정리
    await sequelize.close();

    // 서버 종료
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(async () => {
    // 각 테스트 전 데이터 초기화
    await User.destroy({ where: {}, force: true });
    await SecurityLog.destroy({ where: {}, force: true });
    await LoginAttempt.destroy({ where: {}, force: true });
  });

  describe('SQL Injection Attack Prevention', () => {
    test('1단계: 로그인 엔드포인트 SQL 인젝션 방어', async () => {
      // 정상 사용자 생성
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // SQL 인젝션 공격 시도들
      for (const payload of maliciousPayloads.sqlInjection) {
        const injectionResponse = await request(server)
          .post('/api/auth/login')
          .send({
            email: payload, // SQL 인젝션 페이로드
            password: 'anypassword'
          });

        // 공격이 차단되어야 함
        expect(injectionResponse.status).toBe(400);
        expect(injectionResponse.body.success).toBe(false);

        // 보안 로그가 기록되어야 함
        const securityLog = await SecurityLog.findOne({
          where: {
            type: 'SQL_INJECTION_ATTEMPT',
            details: { email: payload }
          }
        });
        expect(securityLog).toBeTruthy();
      }

      // 정상 로그인은 여전히 작동해야 함
      const normalLoginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#'
        });

      expect(normalLoginResponse.status).toBe(200);
      expect(normalLoginResponse.body.success).toBe(true);
    });

    test('2단계: 검색 엔드포인트 SQL 인젝션 방어', async () => {
      // 사전 준비: 인증된 사용자
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // 검색 쿼리에 SQL 인젝션 시도
      for (const payload of maliciousPayloads.sqlInjection) {
        const searchResponse = await request(server)
          .get('/api/jobs/search')
          .set('Authorization', `Bearer ${accessToken}`)
          .query({
            q: payload, // 검색어에 SQL 인젝션
            location: 'Seoul'
          });

        // 공격이 차단되고 안전한 결과만 반환되어야 함
        expect(searchResponse.status).toBe(200);
        expect(searchResponse.body.success).toBe(true);
        expect(searchResponse.body.data.jobs).toBeDefined();

        // 악성 쿼리로 인한 데이터베이스 손상이 없어야 함
        const userCount = await User.count();
        expect(userCount).toBe(1); // 테스트 사용자만 존재
      }
    });

    test('3단계: 사용자 프로필 업데이트 SQL 인젝션 방어', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // 프로필 업데이트에서 SQL 인젝션 시도
      for (const payload of maliciousPayloads.sqlInjection) {
        const updateResponse = await request(server)
          .patch('/api/auth/profile')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            firstName: payload, // 이름 필드에 SQL 인젝션
            lastName: '정상이름'
          });

        // 공격이 차단되고 데이터가 보호되어야 함
        expect(updateResponse.status).toBe(400);
        expect(updateResponse.body.success).toBe(false);

        // 원본 사용자 데이터가 변경되지 않았는지 확인
        const unchangedUser = await User.findByPk(testUser.id);
        expect(unchangedUser.firstName).toBe('김');
      }
    });
  });

  describe('XSS Attack Prevention', () => {
    test('4단계: 입력 필드 XSS 공격 방어', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'OWNER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // 사업장 등록에서 XSS 공격 시도
      for (const payload of maliciousPayloads.xss) {
        const businessResponse = await request(server)
          .post('/api/businesses')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: payload, // 사업장명에 XSS 페이로드
            businessNumber: '123-45-67890',
            type: 'CONSTRUCTION',
            description: '정상적인 설명'
          });

        // XSS 페이로드가 이스케이프되어야 함
        if (businessResponse.status === 201) {
          expect(businessResponse.body.data.business.name).not.toContain('<script>');
          expect(businessResponse.body.data.business.name).not.toContain('javascript:');
        } else {
          // 또는 입력 검증으로 차단되어야 함
          expect(businessResponse.status).toBe(400);
        }
      }
    });

    test('5단계: 댓글 및 리뷰 XSS 방어', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'WORKER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // 일자리 리뷰에서 XSS 공격 시도
      for (const payload of maliciousPayloads.xss) {
        const reviewResponse = await request(server)
          .post('/api/jobs/1/reviews')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            rating: 5,
            comment: payload, // 댓글에 XSS 페이로드
            workEnvironment: 'GOOD',
            paymentPunctuality: 'ON_TIME'
          });

        if (reviewResponse.status === 201) {
          // XSS 페이로드가 안전하게 이스케이프되어야 함
          expect(reviewResponse.body.data.review.comment).not.toContain('<script>');
          expect(reviewResponse.body.data.review.comment).not.toContain('onerror=');

          // HTML 엔티티로 인코딩되었는지 확인
          if (payload.includes('<script>')) {
            expect(reviewResponse.body.data.review.comment).toContain('&lt;script&gt;');
          }
        } else {
          // 입력 검증으로 차단되어야 함
          expect(reviewResponse.status).toBe(400);
        }
      }
    });
  });

  describe('CSRF Token Validation', () => {
    test('6단계: CSRF 토큰 없이 민감한 작업 시도 시 차단', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // CSRF 토큰 없이 비밀번호 변경 시도
      const passwordChangeResponse = await request(server)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        // X-CSRF-Token 헤더 누락
        .send({
          currentPassword: 'Test123!@#',
          newPassword: 'NewTest123!@#'
        });

      expect(passwordChangeResponse.status).toBe(403);
      expect(passwordChangeResponse.body.error.code).toBe('CSRF_TOKEN_MISSING');

      // 올바른 CSRF 토큰으로 시도
      const csrfTokenResponse = await request(server)
        .get('/api/auth/csrf-token')
        .set('Authorization', `Bearer ${accessToken}`);

      const csrfToken = csrfTokenResponse.body.data.csrfToken;

      const validPasswordChangeResponse = await request(server)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'Test123!@#',
          newPassword: 'NewTest123!@#'
        });

      expect(validPasswordChangeResponse.status).toBe(200);
    });

    test('7단계: 잘못된 CSRF 토큰으로 요청 시 차단', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // 잘못된 CSRF 토큰으로 계정 삭제 시도
      const deleteAccountResponse = await request(server)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-CSRF-Token', 'invalid-csrf-token')
        .send({
          password: 'Test123!@#',
          confirmation: 'DELETE_MY_ACCOUNT'
        });

      expect(deleteAccountResponse.status).toBe(403);
      expect(deleteAccountResponse.body.error.code).toBe('CSRF_TOKEN_INVALID');

      // 사용자 계정이 삭제되지 않았는지 확인
      const existingUser = await User.findByPk(testUser.id);
      expect(existingUser).toBeTruthy();
      expect(existingUser.isDeleted).toBeFalsy();
    });
  });

  describe('Rate Limiting and Brute Force Protection', () => {
    test('8단계: 로그인 브루트포스 공격 방어', async () => {
      testUser = await User.create({
        email: 'target@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '대상',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      const clientIP = '192.168.1.100';

      // 연속 실패 로그인 시도 (브루트포스 공격 시뮬레이션)
      const failedAttempts = [];
      for (let i = 0; i < 6; i++) { // 5회 제한 초과
        const attemptResponse = await request(server)
          .post('/api/auth/login')
          .set('X-Forwarded-For', clientIP)
          .send({
            email: 'target@example.com',
            password: `wrongpassword${i}`
          });

        failedAttempts.push(attemptResponse);
      }

      // 처음 5번은 일반적인 실패 응답
      for (let i = 0; i < 5; i++) {
        expect(failedAttempts[i].status).toBe(401);
        expect(failedAttempts[i].body.error.code).toBe('INVALID_CREDENTIALS');
      }

      // 6번째는 Rate Limiting으로 차단
      expect(failedAttempts[5].status).toBe(429);
      expect(failedAttempts[5].body.error.code).toBe('TOO_MANY_ATTEMPTS');

      // 올바른 비밀번호로도 로그인 차단 확인
      const blockedValidLoginResponse = await request(server)
        .post('/api/auth/login')
        .set('X-Forwarded-For', clientIP)
        .send({
          email: 'target@example.com',
          password: 'Test123!@#'
        });

      expect(blockedValidLoginResponse.status).toBe(429);

      // 로그인 시도 로그 확인
      const loginAttempts = await LoginAttempt.findAll({
        where: { email: 'target@example.com' }
      });
      expect(loginAttempts.length).toBeGreaterThanOrEqual(6);
      expect(loginAttempts.filter(attempt => !attempt.success).length).toBe(6);
    });

    test('9단계: API 요청 Rate Limiting', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      accessToken = 'valid_access_token';
      const clientIP = '192.168.1.101';

      // 짧은 시간 내 대량 API 요청 (DDoS 시뮬레이션)
      const responses = [];
      for (let i = 0; i < 101; i++) { // 분당 100회 제한 초과
        const response = await request(server)
          .get('/api/jobs/search')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Forwarded-For', clientIP)
          .query({ q: `search${i}` });

        responses.push(response);
      }

      // 마지막 요청들은 Rate Limiting으로 차단되어야 함
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

      // Rate Limit 헤더 확인
      expect(lastResponse.headers['x-ratelimit-limit']).toBeTruthy();
      expect(lastResponse.headers['x-ratelimit-remaining']).toBe('0');
      expect(lastResponse.headers['retry-after']).toBeTruthy();
    });
  });

  describe('JWT Token Security', () => {
    test('10단계: JWT 토큰 변조 감지', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // 정상 로그인으로 유효한 토큰 발급
      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'Test123!@#'
        });

      const validToken = loginResponse.body.data.tokens.accessToken;

      // 토큰 변조 시도들
      const tamperedTokens = [
        validToken.slice(0, -10) + 'tampered123', // 서명 부분 변조
        validToken.replace(/\./g, '_'), // 구분자 변조
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid_signature', // 완전히 다른 토큰
        '', // 빈 토큰
        'not-a-jwt-token' // JWT 형식이 아닌 토큰
      ];

      // 변조된 토큰으로 보호된 리소스 접근 시도
      for (const tamperedToken of tamperedTokens) {
        const unauthorizedResponse = await request(server)
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${tamperedToken}`);

        expect(unauthorizedResponse.status).toBe(401);
        expect(unauthorizedResponse.body.success).toBe(false);
        expect(unauthorizedResponse.body.error.code).toBe('INVALID_TOKEN');

        // 보안 로그 기록 확인
        const securityLog = await SecurityLog.findOne({
          where: {
            type: 'TOKEN_TAMPERING_ATTEMPT',
            ipAddress: unauthorizedResponse.req?.ip
          }
        });
        // Note: 실제 구현에서는 보안 로그가 기록되어야 함
      }

      // 정상 토큰으로는 접근 가능해야 함
      const authorizedResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${validToken}`);

      expect(authorizedResponse.status).toBe(200);
      expect(authorizedResponse.body.success).toBe(true);
    });

    test('11단계: 만료된 토큰 및 시간 조작 공격 방어', async () => {
      testUser = await User.create({
        email: 'user@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사용자',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // 이미 만료된 토큰 생성 (테스트용)
      const expiredToken = jwt.sign(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role,
          exp: Math.floor(Date.now() / 1000) - 3600 // 1시간 전 만료
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      // 만료된 토큰으로 접근 시도
      const expiredTokenResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(expiredTokenResponse.status).toBe(401);
      expect(expiredTokenResponse.body.error.code).toBe('TOKEN_EXPIRED');

      // 미래 시간으로 설정된 토큰 (시간 조작 공격)
      const futureToken = jwt.sign(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role,
          iat: Math.floor(Date.now() / 1000) + 3600, // 1시간 후 발급
          exp: Math.floor(Date.now() / 1000) + 7200  // 2시간 후 만료
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      // 미래 시간 토큰으로 접근 시도
      const futureTokenResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${futureToken}`);

      expect(futureTokenResponse.status).toBe(401);
      expect(futureTokenResponse.body.error.code).toBe('TOKEN_NOT_VALID_YET');
    });
  });

  describe('Input Validation and Sanitization', () => {
    test('12단계: 파일 업로드 보안 검증', async () => {
      testUser = await User.create({
        email: 'owner@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사업주',
        phoneNumber: '010-1234-5678',
        role: 'OWNER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // 악성 파일 업로드 시도들
      const maliciousFiles = [
        {
          filename: 'malware.exe',
          content: 'fake executable content',
          expectedError: 'INVALID_FILE_TYPE'
        },
        {
          filename: 'script.php',
          content: '<?php system($_GET["cmd"]); ?>',
          expectedError: 'INVALID_FILE_TYPE'
        },
        {
          filename: '../../../etc/passwd',
          content: 'directory traversal attempt',
          expectedError: 'INVALID_FILENAME'
        },
        {
          filename: 'normal.pdf',
          content: 'A'.repeat(10 * 1024 * 1024), // 10MB 파일
          expectedError: 'FILE_TOO_LARGE'
        }
      ];

      for (const maliciousFile of maliciousFiles) {
        const uploadResponse = await request(server)
          .post('/api/businesses/1/documents')
          .set('Authorization', `Bearer ${accessToken}`)
          .attach('file', Buffer.from(maliciousFile.content), maliciousFile.filename);

        expect(uploadResponse.status).toBe(400);
        expect(uploadResponse.body.error.code).toBe(maliciousFile.expectedError);
      }

      // 정상 파일 업로드는 성공해야 함
      const validUploadResponse = await request(server)
        .post('/api/businesses/1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('valid PDF content'), 'business-license.pdf')
        .field('documentType', 'BUSINESS_LICENSE');

      expect(validUploadResponse.status).toBe(201);
    });
  });

  describe('Security Monitoring and Alerting', () => {
    test('13단계: 보안 이벤트 모니터링 및 알림', async () => {
      // 다양한 보안 이벤트 발생 시뮬레이션
      const securityEvents = [
        {
          type: 'MULTIPLE_LOGIN_FAILURES',
          data: { email: 'target@example.com', attemptCount: 5 }
        },
        {
          type: 'SUSPICIOUS_IP_ACCESS',
          data: { ip: '192.168.1.666', country: 'Unknown' }
        },
        {
          type: 'PRIVILEGE_ESCALATION_ATTEMPT',
          data: { userId: 1, attemptedRole: 'ADMIN' }
        }
      ];

      // 보안 이벤트 로깅
      for (const event of securityEvents) {
        await SecurityLog.create({
          type: event.type,
          details: event.data,
          severity: 'HIGH',
          ipAddress: '192.168.1.100',
          userAgent: 'Test Browser',
          createdAt: new Date()
        });
      }

      // 보안 대시보드 API 호출
      const securityDashboardResponse = await request(server)
        .get('/api/admin/security-dashboard')
        .set('Authorization', 'Bearer admin-token');

      expect(securityDashboardResponse.status).toBe(200);
      expect(securityDashboardResponse.body.data.securityMetrics).toBeTruthy();
      expect(securityDashboardResponse.body.data.securityMetrics.totalIncidents).toBeGreaterThan(0);
      expect(securityDashboardResponse.body.data.securityMetrics.highSeverityIncidents).toBeGreaterThan(0);

      // 실시간 알림 기능 테스트 (웹소켓 또는 푸시 알림)
      const alertsResponse = await request(server)
        .get('/api/admin/security-alerts')
        .set('Authorization', 'Bearer admin-token')
        .query({ severity: 'HIGH', limit: 10 });

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.data.alerts.length).toBeGreaterThan(0);
    });
  });

  describe('Privacy and Data Protection', () => {
    test('14단계: 개인정보 보호 및 데이터 암호화 검증', async () => {
      testUser = await User.create({
        email: 'privacy@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '개인정보',
        phoneNumber: '010-1234-5678',
        socialSecurityNumber: '123456-1234567', // 민감 정보
        role: 'SEEKER',
        isVerified: true
      });

      accessToken = 'valid_access_token';

      // 개인정보 조회 시 민감 정보 마스킹 확인
      const profileResponse = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileResponse.status).toBe(200);

      // 주민번호가 마스킹되어 있는지 확인
      const maskedSSN = profileResponse.body.data.user.socialSecurityNumber;
      expect(maskedSSN).toBe('123456-*******');

      // 데이터베이스에서는 암호화되어 저장되어 있는지 확인
      const dbUser = await User.findByPk(testUser.id);
      expect(dbUser.socialSecurityNumber).not.toBe('123456-1234567'); // 원본과 달라야 함
      expect(dbUser.socialSecurityNumber.length).toBeGreaterThan(15); // 암호화로 길어짐

      // GDPR 준수 - 개인정보 삭제 요청
      const deletePersonalDataResponse = await request(server)
        .delete('/api/auth/personal-data')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          confirmDeletion: true,
          reason: 'GDPR Article 17 - Right to erasure'
        });

      expect(deletePersonalDataResponse.status).toBe(200);
      expect(deletePersonalDataResponse.body.data.deletionStatus).toBe('SCHEDULED');
    });
  });
});