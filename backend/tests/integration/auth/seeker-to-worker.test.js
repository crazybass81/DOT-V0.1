const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { User, WorkerApplication } = require('../../../src/models');

// Seeker에서 Worker로 역할 전환 통합 테스트
describe.skip('Seeker to Worker Role Transition Integration', () => {
  let server;
  let testUser;
  let accessToken;
  let refreshToken;

  beforeAll(async () => {
    // 테스트용 서버 시작
    server = app.listen();

    // 데이터베이스 초기화
    await sequelize.sync({ force: true });
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
    await WorkerApplication.destroy({ where: {}, force: true });
  });

  describe('Complete Seeker to Worker Transition Flow', () => {
    test('1단계: 회원가입 시 Seeker 역할 자동 부여', async () => {
      // 회원가입 요청
      const registerResponse = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#',
          firstName: '김',
          lastName: '테스터',
          phoneNumber: '010-1234-5678'
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.data.user.role).toBe('SEEKER');

      // 데이터베이스에서 사용자 확인
      testUser = await User.findOne({ where: { email: 'test@example.com' } });
      expect(testUser).toBeTruthy();
      expect(testUser.role).toBe('SEEKER');
    });

    test('2단계: 로그인 성공 및 토큰 발급', async () => {
      // 사전 준비: 사용자 생성
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword', // 실제로는 bcrypt로 해시된 비밀번호
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // 로그인 요청
      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data.tokens.accessToken).toBeTruthy();
      expect(loginResponse.body.data.tokens.refreshToken).toBeTruthy();
      expect(loginResponse.body.data.user.role).toBe('SEEKER');

      // 토큰 저장
      accessToken = loginResponse.body.data.tokens.accessToken;
      refreshToken = loginResponse.body.data.tokens.refreshToken;
    });

    test('3단계: Worker 역할 신청', async () => {
      // 사전 준비: 로그인된 사용자
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      // 임시 토큰 생성 (실제로는 JWT 라이브러리 사용)
      accessToken = 'valid_access_token';

      // Worker 역할 신청 요청
      const applicationResponse = await request(server)
        .post('/api/auth/apply-worker')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          motivation: '안정적인 일자리를 찾고 있습니다.',
          experience: '3년간 건설 현장 경험이 있습니다.',
          skills: ['건설', '용접', '안전관리'],
          certificates: ['건설기능사', '용접기능사']
        });

      expect(applicationResponse.status).toBe(201);
      expect(applicationResponse.body.success).toBe(true);
      expect(applicationResponse.body.data.application.status).toBe('PENDING');

      // 데이터베이스에서 신청 내역 확인
      const application = await WorkerApplication.findOne({
        where: { userId: testUser.id }
      });
      expect(application).toBeTruthy();
      expect(application.status).toBe('PENDING');
    });

    test('4단계: 관리자 승인 대기 상태 확인', async () => {
      // 사전 준비: 사용자 및 신청 내역 생성
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      const application = await WorkerApplication.create({
        userId: testUser.id,
        motivation: '안정적인 일자리를 찾고 있습니다.',
        experience: '3년간 건설 현장 경험이 있습니다.',
        skills: ['건설', '용접', '안전관리'],
        certificates: ['건설기능사', '용접기능사'],
        status: 'PENDING'
      });

      accessToken = 'valid_access_token';

      // 신청 상태 조회
      const statusResponse = await request(server)
        .get('/api/auth/worker-application-status')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.application.status).toBe('PENDING');
      expect(statusResponse.body.data.user.role).toBe('SEEKER'); // 아직 Seeker 상태
    });

    test('5단계: 관리자 승인 처리', async () => {
      // 사전 준비: 사용자, 신청 내역, 관리자 계정 생성
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      const adminUser = await User.create({
        email: 'admin@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '관리자',
        lastName: '김',
        phoneNumber: '010-9999-9999',
        role: 'ADMIN',
        isVerified: true
      });

      const application = await WorkerApplication.create({
        userId: testUser.id,
        motivation: '안정적인 일자리를 찾고 있습니다.',
        experience: '3년간 건설 현장 경험이 있습니다.',
        skills: ['건설', '용접', '안전관리'],
        certificates: ['건설기능사', '용접기능사'],
        status: 'PENDING'
      });

      const adminToken = 'valid_admin_token';

      // 관리자가 신청 승인
      const approvalResponse = await request(server)
        .patch(`/api/admin/worker-applications/${application.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reviewComment: '경력과 자격증이 충분하여 승인합니다.'
        });

      expect(approvalResponse.status).toBe(200);
      expect(approvalResponse.body.success).toBe(true);
      expect(approvalResponse.body.data.application.status).toBe('APPROVED');

      // 데이터베이스에서 승인 확인
      const updatedApplication = await WorkerApplication.findByPk(application.id);
      expect(updatedApplication.status).toBe('APPROVED');
      expect(updatedApplication.reviewComment).toBe('경력과 자격증이 충분하여 승인합니다.');
    });

    test('6단계: 승인 후 사용자 역할 자동 전환', async () => {
      // 사전 준비: 승인된 신청 내역이 있는 사용자
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      const application = await WorkerApplication.create({
        userId: testUser.id,
        motivation: '안정적인 일자리를 찾고 있습니다.',
        experience: '3년간 건설 현장 경험이 있습니다.',
        skills: ['건설', '용접', '안전관리'],
        certificates: ['건설기능사', '용접기능사'],
        status: 'APPROVED',
        reviewComment: '경력과 자격증이 충분하여 승인합니다.',
        approvedAt: new Date()
      });

      // 역할 전환 API 호출 (승인 후 사용자가 직접 전환)
      accessToken = 'valid_access_token';

      const transitionResponse = await request(server)
        .patch('/api/auth/transition-to-worker')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(transitionResponse.status).toBe(200);
      expect(transitionResponse.body.success).toBe(true);
      expect(transitionResponse.body.data.user.role).toBe('WORKER');

      // 데이터베이스에서 역할 전환 확인
      const updatedUser = await User.findByPk(testUser.id);
      expect(updatedUser.role).toBe('WORKER');
    });

    test('7단계: Worker 권한으로 기능 접근 확인', async () => {
      // 사전 준비: Worker 역할의 사용자
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'WORKER',
        isVerified: true
      });

      accessToken = 'valid_worker_token';

      // Worker 전용 기능 접근 테스트 - 일자리 지원
      const jobApplicationResponse = await request(server)
        .post('/api/jobs/1/apply')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          coverLetter: '성실하게 일하겠습니다.',
          availableStartDate: '2024-01-15'
        });

      expect(jobApplicationResponse.status).toBe(201);
      expect(jobApplicationResponse.body.success).toBe(true);

      // Worker 전용 기능 접근 테스트 - 프로필 조회
      const profileResponse = await request(server)
        .get('/api/workers/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.data.user.role).toBe('WORKER');

      // Seeker 전용 기능 접근 불가 확인
      const seekerOnlyResponse = await request(server)
        .post('/api/seekers/save-job')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ jobId: 1 });

      expect(seekerOnlyResponse.status).toBe(403); // 권한 없음
    });
  });

  describe('Error Cases', () => {
    test('이미 Worker 신청이 진행 중인 경우 중복 신청 방지', async () => {
      // 사전 준비: 이미 신청한 사용자
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      await WorkerApplication.create({
        userId: testUser.id,
        motivation: '이전 신청',
        experience: '경력',
        skills: ['스킬'],
        certificates: ['자격증'],
        status: 'PENDING'
      });

      accessToken = 'valid_access_token';

      // 중복 신청 시도
      const duplicateResponse = await request(server)
        .post('/api/auth/apply-worker')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          motivation: '새로운 신청',
          experience: '새로운 경력',
          skills: ['새로운 스킬'],
          certificates: ['새로운 자격증']
        });

      expect(duplicateResponse.status).toBe(400);
      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.error.code).toBe('DUPLICATE_APPLICATION');
    });

    test('승인되지 않은 상태에서 역할 전환 시도 시 실패', async () => {
      // 사전 준비: 승인되지 않은 신청이 있는 사용자
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      await WorkerApplication.create({
        userId: testUser.id,
        motivation: '신청',
        experience: '경력',
        skills: ['스킬'],
        certificates: ['자격증'],
        status: 'PENDING' // 아직 승인되지 않음
      });

      accessToken = 'valid_access_token';

      // 승인되지 않은 상태에서 역할 전환 시도
      const transitionResponse = await request(server)
        .patch('/api/auth/transition-to-worker')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(transitionResponse.status).toBe(400);
      expect(transitionResponse.body.success).toBe(false);
      expect(transitionResponse.body.error.code).toBe('APPLICATION_NOT_APPROVED');
    });
  });

  describe('Integration with External Services', () => {
    test('역할 전환 시 알림 서비스 연동', async () => {
      // 사전 준비: 승인된 신청이 있는 사용자
      testUser = await User.create({
        email: 'test@example.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '테스터',
        phoneNumber: '010-1234-5678',
        role: 'SEEKER',
        isVerified: true
      });

      await WorkerApplication.create({
        userId: testUser.id,
        motivation: '신청',
        experience: '경력',
        skills: ['스킬'],
        certificates: ['자격증'],
        status: 'APPROVED',
        approvedAt: new Date()
      });

      accessToken = 'valid_access_token';

      // 역할 전환 시 알림 서비스 호출 확인
      const transitionResponse = await request(server)
        .patch('/api/auth/transition-to-worker')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(transitionResponse.status).toBe(200);
      expect(transitionResponse.body.success).toBe(true);

      // 알림 서비스 호출 확인 (모킹된 서비스 응답 검증)
      expect(transitionResponse.body.data.notifications).toBeTruthy();
      expect(transitionResponse.body.data.notifications.email).toBe('sent');
      expect(transitionResponse.body.data.notifications.sms).toBe('sent');
    });
  });
});