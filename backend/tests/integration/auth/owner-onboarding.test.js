const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { User, Business, BusinessVerification, Invitation } = require('../../../src/models');
const path = require('path');
const fs = require('fs');

// 사업장 Owner 온보딩 통합 테스트
describe.skip('Business Owner Onboarding Integration', () => {
  let server;
  let testOwner;
  let testManager;
  let accessToken;
  let refreshToken;
  let businessId;

  beforeAll(async () => {
    // 테스트용 서버 시작
    server = app.listen();

    // 데이터베이스 초기화
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    // 테스트 파일 정리
    const uploadDir = path.join(__dirname, '../../../uploads/test');
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }

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
    await Business.destroy({ where: {}, force: true });
    await BusinessVerification.destroy({ where: {}, force: true });
    await Invitation.destroy({ where: {}, force: true });
  });

  describe('Complete Owner Onboarding Flow', () => {
    test('1단계: 사업주 회원가입', async () => {
      // 사업주로 회원가입
      const registerResponse = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'owner@business.com',
          password: 'Owner123!@#',
          firstName: '김',
          lastName: '사장',
          phoneNumber: '010-1111-2222',
          businessName: '김사장 건설업체', // 사업체명 포함
          businessType: 'CONSTRUCTION'
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.data.user.role).toBe('OWNER'); // 사업체명 포함 시 자동으로 Owner 역할

      // 데이터베이스에서 사용자 확인
      testOwner = await User.findOne({ where: { email: 'owner@business.com' } });
      expect(testOwner).toBeTruthy();
      expect(testOwner.role).toBe('OWNER');

      // 로그인 토큰 발급
      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'owner@business.com',
          password: 'Owner123!@#'
        });

      accessToken = loginResponse.body.data.tokens.accessToken;
      refreshToken = loginResponse.body.data.tokens.refreshToken;
    });

    test('2단계: 사업장 정보 등록', async () => {
      // 사전 준비: 로그인된 Owner
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      accessToken = 'valid_owner_token';

      // 사업장 등록 요청
      const businessResponse = await request(server)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '김사장 건설업체',
          businessNumber: '123-45-67890',
          type: 'CONSTRUCTION',
          description: '소규모 건설공사 전문업체',
          address: {
            street: '서울시 강남구 테헤란로 123',
            city: '서울시',
            state: '강남구',
            zipCode: '06142',
            country: 'KR'
          },
          contact: {
            phone: '02-1234-5678',
            email: 'contact@business.com',
            website: 'https://business.com'
          },
          operatingHours: {
            monday: { open: '09:00', close: '18:00' },
            tuesday: { open: '09:00', close: '18:00' },
            wednesday: { open: '09:00', close: '18:00' },
            thursday: { open: '09:00', close: '18:00' },
            friday: { open: '09:00', close: '18:00' },
            saturday: { open: '09:00', close: '15:00' },
            sunday: { closed: true }
          }
        });

      expect(businessResponse.status).toBe(201);
      expect(businessResponse.body.success).toBe(true);
      expect(businessResponse.body.data.business.name).toBe('김사장 건설업체');
      expect(businessResponse.body.data.business.ownerId).toBe(testOwner.id);

      businessId = businessResponse.body.data.business.id;

      // 데이터베이스에서 사업장 확인
      const business = await Business.findByPk(businessId);
      expect(business).toBeTruthy();
      expect(business.status).toBe('PENDING_VERIFICATION'); // 검증 대기 상태
    });

    test('3단계: 사업자 등록증 업로드', async () => {
      // 사전 준비: 사업장이 등록된 Owner
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      const business = await Business.create({
        name: '김사장 건설업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: testOwner.id,
        status: 'PENDING_VERIFICATION'
      });

      businessId = business.id;
      accessToken = 'valid_owner_token';

      // 테스트용 파일 생성
      const testFilePath = path.join(__dirname, '../../../uploads/test');
      if (!fs.existsSync(testFilePath)) {
        fs.mkdirSync(testFilePath, { recursive: true });
      }

      const dummyFileContent = 'dummy business license content';
      const dummyFilePath = path.join(testFilePath, 'business-license.pdf');
      fs.writeFileSync(dummyFilePath, dummyFileContent);

      // 사업자 등록증 업로드
      const uploadResponse = await request(server)
        .post(`/api/businesses/${businessId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('businessLicense', dummyFilePath)
        .field('documentType', 'BUSINESS_LICENSE')
        .field('description', '사업자 등록증');

      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data.document.type).toBe('BUSINESS_LICENSE');
      expect(uploadResponse.body.data.document.status).toBe('PENDING_REVIEW');

      // 데이터베이스에서 검증 요청 확인
      const verification = await BusinessVerification.findOne({
        where: { businessId: businessId }
      });
      expect(verification).toBeTruthy();
      expect(verification.status).toBe('PENDING');
    });

    test('4단계: GPS 위치 설정 및 주변 정보 등록', async () => {
      // 사전 준비: 문서가 업로드된 사업장
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      const business = await Business.create({
        name: '김사장 건설업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: testOwner.id,
        status: 'PENDING_VERIFICATION'
      });

      businessId = business.id;
      accessToken = 'valid_owner_token';

      // GPS 위치 설정
      const locationResponse = await request(server)
        .patch(`/api/businesses/${businessId}/location`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          coordinates: {
            latitude: 37.5665,
            longitude: 126.9780
          },
          address: {
            street: '서울시 중구 명동길 123',
            city: '서울시',
            state: '중구',
            zipCode: '04536',
            country: 'KR'
          },
          locationVerification: {
            method: 'GPS',
            accuracy: 10, // 미터 단위
            timestamp: new Date().toISOString()
          },
          nearbyLandmarks: [
            '명동역 1번 출구 도보 5분',
            '명동성당 인근',
            '롯데백화점 본점 맞은편'
          ],
          accessibilityInfo: {
            parking: true,
            publicTransport: true,
            wheelchair: false
          }
        });

      expect(locationResponse.status).toBe(200);
      expect(locationResponse.body.success).toBe(true);
      expect(locationResponse.body.data.business.location.coordinates.latitude).toBe(37.5665);
      expect(locationResponse.body.data.business.location.coordinates.longitude).toBe(126.9780);

      // 데이터베이스에서 위치 정보 확인
      const updatedBusiness = await Business.findByPk(businessId);
      expect(updatedBusiness.location).toBeTruthy();
      expect(updatedBusiness.location.coordinates.latitude).toBe(37.5665);
    });

    test('5단계: Manager 초대 및 권한 부여', async () => {
      // 사전 준비: 위치가 설정된 사업장
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      const business = await Business.create({
        name: '김사장 건설업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: testOwner.id,
        status: 'VERIFIED',
        location: {
          coordinates: { latitude: 37.5665, longitude: 126.9780 }
        }
      });

      businessId = business.id;
      accessToken = 'valid_owner_token';

      // Manager 초대
      const inviteResponse = await request(server)
        .post(`/api/businesses/${businessId}/invite-manager`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'manager@business.com',
          firstName: '이',
          lastName: '매니저',
          phoneNumber: '010-2222-3333',
          role: 'MANAGER',
          permissions: [
            'MANAGE_WORKERS',
            'POST_JOBS',
            'REVIEW_APPLICATIONS',
            'MANAGE_SCHEDULES'
          ],
          message: '저희 업체의 현장 관리자로 초대드립니다.'
        });

      expect(inviteResponse.status).toBe(201);
      expect(inviteResponse.body.success).toBe(true);
      expect(inviteResponse.body.data.invitation.email).toBe('manager@business.com');
      expect(inviteResponse.body.data.invitation.role).toBe('MANAGER');

      // 데이터베이스에서 초대 확인
      const invitation = await Invitation.findOne({
        where: {
          email: 'manager@business.com',
          businessId: businessId
        }
      });
      expect(invitation).toBeTruthy();
      expect(invitation.status).toBe('PENDING');

      // 초대받은 Manager의 계정 생성 및 초대 수락
      const managerRegisterResponse = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'manager@business.com',
          password: 'Manager123!@#',
          firstName: '이',
          lastName: '매니저',
          phoneNumber: '010-2222-3333',
          invitationToken: invitation.token
        });

      expect(managerRegisterResponse.status).toBe(201);
      expect(managerRegisterResponse.body.data.user.role).toBe('MANAGER');

      // 초대 수락 확인
      const updatedInvitation = await Invitation.findByPk(invitation.id);
      expect(updatedInvitation.status).toBe('ACCEPTED');
    });

    test('6단계: Worker 모집 공고 등록', async () => {
      // 사전 준비: Manager가 있는 검증된 사업장
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      testManager = await User.create({
        email: 'manager@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '이',
        lastName: '매니저',
        phoneNumber: '010-2222-3333',
        role: 'MANAGER',
        isVerified: true
      });

      const business = await Business.create({
        name: '김사장 건설업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: testOwner.id,
        status: 'VERIFIED',
        location: {
          coordinates: { latitude: 37.5665, longitude: 126.9780 }
        }
      });

      businessId = business.id;
      accessToken = 'valid_owner_token';

      // Worker 모집 공고 등록
      const jobPostResponse = await request(server)
        .post(`/api/businesses/${businessId}/jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: '건설 현장 작업자 모집',
          description: '아파트 신축 공사 현장에서 함께 일할 성실한 작업자를 모집합니다.',
          requirements: [
            '건설 현장 경험 1년 이상',
            '안전교육 이수 필수',
            '성실하고 책임감 있는 분'
          ],
          skills: ['건설', '안전관리', '중장비 운전'],
          workType: 'FULL_TIME',
          workSchedule: {
            startTime: '07:00',
            endTime: '17:00',
            breakTime: '12:00-13:00',
            workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
          },
          compensation: {
            type: 'DAILY',
            amount: 120000,
            currency: 'KRW',
            benefits: ['4대보험', '안전장비 제공', '중식 제공']
          },
          location: {
            address: '서울시 강서구 공항대로 456',
            coordinates: { latitude: 37.5511, longitude: 126.8495 }
          },
          applicationDeadline: '2024-02-15',
          startDate: '2024-02-20',
          duration: '6개월',
          positions: 5
        });

      expect(jobPostResponse.status).toBe(201);
      expect(jobPostResponse.body.success).toBe(true);
      expect(jobPostResponse.body.data.job.title).toBe('건설 현장 작업자 모집');
      expect(jobPostResponse.body.data.job.businessId).toBe(businessId);
      expect(jobPostResponse.body.data.job.status).toBe('ACTIVE');

      // 공고가 정상적으로 게시되었는지 확인
      const jobListResponse = await request(server)
        .get('/api/jobs')
        .query({
          location: '서울시',
          type: 'CONSTRUCTION'
        });

      expect(jobListResponse.status).toBe(200);
      expect(jobListResponse.body.data.jobs.length).toBeGreaterThan(0);
      expect(jobListResponse.body.data.jobs[0].title).toBe('건설 현장 작업자 모집');
    });
  });

  describe('Verification Process', () => {
    test('관리자의 사업장 검증 승인 프로세스', async () => {
      // 사전 준비: 검증 대기 중인 사업장
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      const adminUser = await User.create({
        email: 'admin@platform.com',
        password: '$2b$10$hashedPassword',
        firstName: '관리자',
        lastName: '김',
        phoneNumber: '010-9999-9999',
        role: 'ADMIN',
        isVerified: true
      });

      const business = await Business.create({
        name: '김사장 건설업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: testOwner.id,
        status: 'PENDING_VERIFICATION'
      });

      const verification = await BusinessVerification.create({
        businessId: business.id,
        documentType: 'BUSINESS_LICENSE',
        documentPath: '/uploads/test/business-license.pdf',
        status: 'PENDING'
      });

      const adminToken = 'valid_admin_token';

      // 관리자가 사업장 검증 승인
      const approvalResponse = await request(server)
        .patch(`/api/admin/business-verifications/${verification.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reviewComment: '사업자 등록증이 정상적으로 확인되었습니다.',
          verifiedFields: ['businessNumber', 'businessName', 'ownerName']
        });

      expect(approvalResponse.status).toBe(200);
      expect(approvalResponse.body.success).toBe(true);
      expect(approvalResponse.body.data.verification.status).toBe('APPROVED');

      // 사업장 상태가 검증완료로 변경되었는지 확인
      const updatedBusiness = await Business.findByPk(business.id);
      expect(updatedBusiness.status).toBe('VERIFIED');
    });
  });

  describe('Error Cases', () => {
    test('중복된 사업자 등록번호로 사업장 등록 시 실패', async () => {
      // 사전 준비: 이미 등록된 사업자 번호
      const existingOwner = await User.create({
        email: 'existing@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '기존',
        lastName: '사장',
        phoneNumber: '010-0000-1111',
        role: 'OWNER',
        isVerified: true
      });

      await Business.create({
        name: '기존 업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: existingOwner.id,
        status: 'VERIFIED'
      });

      testOwner = await User.create({
        email: 'new@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '신규',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      accessToken = 'valid_new_owner_token';

      // 중복된 사업자 번호로 등록 시도
      const duplicateResponse = await request(server)
        .post('/api/businesses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '신규 업체',
          businessNumber: '123-45-67890', // 중복된 사업자 번호
          type: 'CONSTRUCTION'
        });

      expect(duplicateResponse.status).toBe(400);
      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.error.code).toBe('DUPLICATE_BUSINESS_NUMBER');
    });

    test('검증되지 않은 사업장에서 Worker 모집 시 실패', async () => {
      // 사전 준비: 검증되지 않은 사업장
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      const business = await Business.create({
        name: '김사장 건설업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: testOwner.id,
        status: 'PENDING_VERIFICATION' // 아직 검증되지 않음
      });

      accessToken = 'valid_owner_token';

      // 검증되지 않은 상태에서 Worker 모집 시도
      const jobPostResponse = await request(server)
        .post(`/api/businesses/${business.id}/jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: '현장 작업자 모집',
          description: '작업자를 모집합니다.'
        });

      expect(jobPostResponse.status).toBe(403);
      expect(jobPostResponse.body.success).toBe(false);
      expect(jobPostResponse.body.error.code).toBe('BUSINESS_NOT_VERIFIED');
    });
  });

  describe('Integration with External Services', () => {
    test('온보딩 완료 시 외부 서비스 연동', async () => {
      // 사전 준비: 완전히 온보딩된 사업장
      testOwner = await User.create({
        email: 'owner@business.com',
        password: '$2b$10$hashedPassword',
        firstName: '김',
        lastName: '사장',
        phoneNumber: '010-1111-2222',
        role: 'OWNER',
        isVerified: true
      });

      const business = await Business.create({
        name: '김사장 건설업체',
        businessNumber: '123-45-67890',
        type: 'CONSTRUCTION',
        ownerId: testOwner.id,
        status: 'VERIFIED'
      });

      accessToken = 'valid_owner_token';

      // 온보딩 완료 API 호출
      const completeResponse = await request(server)
        .patch(`/api/businesses/${business.id}/complete-onboarding`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(completeResponse.status).toBe(200);
      expect(completeResponse.body.success).toBe(true);

      // 외부 서비스 연동 확인
      expect(completeResponse.body.data.integrations).toBeTruthy();
      expect(completeResponse.body.data.integrations.paymentService).toBe('connected');
      expect(completeResponse.body.data.integrations.notificationService).toBe('connected');
      expect(completeResponse.body.data.integrations.analyticsService).toBe('connected');

      // 온보딩 완료 상태 확인
      const updatedBusiness = await Business.findByPk(business.id);
      expect(updatedBusiness.onboardingCompleted).toBe(true);
      expect(updatedBusiness.onboardingCompletedAt).toBeTruthy();
    });
  });
});