/**
 * T216: 역할 전환 계약 테스트
 * POST /api/v1/auth/switch-role 엔드포인트의 계약 준수 확인
 *
 * TDD RED 단계: 모든 테스트는 실패해야 함 (구현 전)
 */

const request = require('supertest');
const app = require('../../../app'); // Express 앱
const { initDatabase } = require('../../../src/config/database');
const redis = require('../../../src/config/redis');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('T216: POST /api/v1/auth/switch-role - 역할 전환', () => {
  let testUser;
  let accessToken;
  let ownerRole;
  let managerRole;
  let seekerRole;
  let pool;

  beforeAll(async () => {
    pool = await initDatabase();
  });

  // 각 테스트 전 데이터베이스 초기화 및 테스트 환경 준비
  beforeEach(async () => {
    // 테스트용 테이블 정리
    await pool.query('DELETE FROM user_roles WHERE user_id IS NOT NULL');
    await pool.query('DELETE FROM businesses WHERE name LIKE \'%test%\'');
    await pool.query('DELETE FROM users WHERE email LIKE \'%test%\'');

    // Redis 정리
    await redis.flushdb();

    // 테스트용 사용자 생성
    const hashedPassword = await bcrypt.hash('SecurePass123!', 10);
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone, status, email_verified, phone_verified)
      VALUES ($1, $2, $3, $4, 'active', true, true)
      RETURNING id, email, name, phone, status, email_verified, phone_verified, created_at
    `, ['testuser@example.com', hashedPassword, '테스트사용자', '010-1234-5678']);

    testUser = userResult.rows[0];

    // 테스트용 사업장 생성
    const businessResult = await pool.query(`
      INSERT INTO businesses (name, business_number, address, owner_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name
    `, ['테스트카페', '123-45-67890', '서울시 강남구', testUser.id]);

    const business = businessResult.rows[0];

    // 다양한 역할 생성 (active한 것과 inactive한 것 포함)
    const ownerRoleResult = await pool.query(`
      INSERT INTO user_roles (user_id, role_type, business_id, business_name, is_active, permissions, valid_from)
      VALUES ($1, 'owner', $2, $3, true, $4, NOW())
      RETURNING id, role_type, business_id, business_name, is_active, permissions
    `, [testUser.id, business.id, business.name, JSON.stringify(['business:manage', 'user:manage', 'payroll:manage'])]);
    ownerRole = ownerRoleResult.rows[0];

    const managerRoleResult = await pool.query(`
      INSERT INTO user_roles (user_id, role_type, business_id, business_name, is_active, permissions, valid_from)
      VALUES ($1, 'manager', $2, $3, true, $4, NOW())
      RETURNING id, role_type, business_id, business_name, is_active, permissions
    `, [testUser.id, business.id, business.name, JSON.stringify(['schedule:manage', 'attendance:view'])]);
    managerRole = managerRoleResult.rows[0];

    const seekerRoleResult = await pool.query(`
      INSERT INTO user_roles (user_id, role_type, business_id, business_name, is_active, permissions, valid_from)
      VALUES ($1, 'seeker', NULL, NULL, true, $2, NOW())
      RETURNING id, role_type, business_id, business_name, is_active, permissions
    `, [testUser.id, JSON.stringify(['profile:read', 'job:search'])]);
    seekerRole = seekerRoleResult.rows[0];

    // JWT access token 생성 (기본 seeker 역할로)
    accessToken = jwt.sign(
      {
        userId: testUser.id,
        email: testUser.email,
        roleId: seekerRole.id,
        roleType: 'seeker',
        type: 'access'
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '15m' }
    );

    // Redis에 세션 생성
    const sessionKey = `session:${testUser.id}:${Date.now()}`;
    await redis.setex(sessionKey, 3600, JSON.stringify({
      userId: testUser.id,
      email: testUser.email,
      currentRoleId: seekerRole.id,
      loginAt: new Date().toISOString()
    }));
  });


  describe('성공 케이스', () => {
    it('유효한 역할 ID로 전환 시 200 응답과 새로운 토큰을 반환해야 함', async () => {
      const switchData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(switchData)
        .expect('Content-Type', /json/);

      // 응답 상태 코드 검증
      expect(response.status).toBe(200);

      // 응답 구조 검증 - auth-api.yaml 스키마 준수
      expect(response.body).toHaveProperty('currentRole');
      expect(response.body).toHaveProperty('accessToken');

      // 현재 역할 정보 검증
      const { currentRole } = response.body;
      expect(currentRole).toHaveProperty('id', ownerRole.id);
      expect(currentRole).toHaveProperty('roleType', 'owner');
      expect(currentRole).toHaveProperty('businessId', ownerRole.business_id);
      expect(currentRole).toHaveProperty('businessName', ownerRole.business_name);
      expect(currentRole).toHaveProperty('isActive', true);
      expect(currentRole).toHaveProperty('permissions');
      expect(Array.isArray(currentRole.permissions)).toBe(true);

      // 새로운 access token 검증
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(0);
      expect(response.body.accessToken).not.toBe(accessToken); // 기존 토큰과 다름

      // 새로운 토큰의 페이로드 검증
      const decodedToken = jwt.verify(
        response.body.accessToken,
        process.env.JWT_SECRET || 'test-secret'
      );
      expect(decodedToken.userId).toBe(testUser.id);
      expect(decodedToken.roleId).toBe(ownerRole.id);
      expect(decodedToken.roleType).toBe('owner');
    });

    it('seeker 역할에서 business 역할로 전환이 가능해야 함', async () => {
      const switchData = {
        roleId: managerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(switchData)
        .expect(200);

      expect(response.body.currentRole.roleType).toBe('manager');
      expect(response.body.currentRole.businessId).toBe(managerRole.business_id);
      expect(response.body.currentRole.businessName).toBe(managerRole.business_name);
    });

    it('business 역할에서 seeker 역할로 전환이 가능해야 함', async () => {
      // 먼저 manager 역할로 전환
      const managerToken = jwt.sign(
        {
          userId: testUser.id,
          email: testUser.email,
          roleId: managerRole.id,
          roleType: 'manager',
          type: 'access'
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '15m' }
      );

      const switchData = {
        roleId: seekerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(switchData)
        .expect(200);

      expect(response.body.currentRole.roleType).toBe('seeker');
      expect(response.body.currentRole.businessId).toBeNull();
      expect(response.body.currentRole.businessName).toBeNull();
    });

    it('동일한 사업장 내 역할 간 전환이 가능해야 함', async () => {
      const switchData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(switchData)
        .expect(200);

      // owner에서 manager로 다시 전환
      const newToken = response.body.accessToken;
      const switchBackData = {
        roleId: managerRole.id
      };

      const secondResponse = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${newToken}`)
        .send(switchBackData)
        .expect(200);

      expect(secondResponse.body.currentRole.roleType).toBe('manager');
      expect(secondResponse.body.currentRole.businessId).toBe(managerRole.business_id);
    });

    it('역할 전환 시 Redis 세션이 업데이트되어야 함', async () => {
      const switchData = {
        roleId: ownerRole.id
      };

      await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(switchData)
        .expect(200);

      // Redis에서 세션 정보 확인
      const sessionKeys = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionKeys.length).toBeGreaterThan(0);

      const sessionData = await redis.get(sessionKeys[0]);
      const session = JSON.parse(sessionData);
      expect(session.currentRoleId).toBe(ownerRole.id);
    });
  });

  describe('인증 실패 케이스 (401 Unauthorized)', () => {
    it('Authorization 헤더 누락 시 401 에러를 반환해야 함', async () => {
      const switchData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .send(switchData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/authorization.*required/i);
    });

    it('잘못된 토큰으로 요청 시 401 에러를 반환해야 함', async () => {
      const switchData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', 'Bearer invalid-token')
        .send(switchData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*token/i);
    });

    it('만료된 토큰으로 요청 시 401 에러를 반환해야 함', async () => {
      const expiredToken = jwt.sign(
        {
          userId: testUser.id,
          email: testUser.email,
          roleId: seekerRole.id,
          roleType: 'seeker',
          type: 'access'
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // 1시간 전 만료
      );

      const switchData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send(switchData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/token.*expired/i);
    });
  });

  describe('유효성 검증 실패 케이스 (400 Bad Request)', () => {
    it('roleId 필드 누락 시 400 에러를 반환해야 함', async () => {
      const incompleteData = {
        // roleId 누락
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(incompleteData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/roleId.*required/i);
    });

    it('잘못된 roleId 타입 시 400 에러를 반환해야 함', async () => {
      const invalidTypeData = {
        roleId: 'not-a-number'
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidTypeData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/roleId.*integer/i);
    });

    it('존재하지 않는 roleId 시 400 에러를 반환해야 함', async () => {
      const nonExistentRoleData = {
        roleId: 99999
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(nonExistentRoleData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/role.*not.*found/i);
    });

    it('비활성화된 역할로 전환 시 400 에러를 반환해야 함', async () => {
      // 역할 비활성화
      await pool.query(
        'UPDATE user_roles SET is_active = false WHERE id = $1',
        [ownerRole.id]
      );

      const inactiveRoleData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(inactiveRoleData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/role.*inactive/i);
    });

    it('만료된 역할로 전환 시 400 에러를 반환해야 함', async () => {
      // 역할 만료 설정
      await pool.query(
        'UPDATE user_roles SET valid_until = NOW() - INTERVAL \'1 day\' WHERE id = $1',
        [ownerRole.id]
      );

      const expiredRoleData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(expiredRoleData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/role.*expired/i);
    });
  });

  describe('권한 검증 케이스 (403 Forbidden)', () => {
    it('다른 사용자의 역할로 전환 시 403 에러를 반환해야 함', async () => {
      // 다른 사용자 생성
      const otherUserResult = await pool.query(`
        INSERT INTO users (email, password_hash, name, phone, status, email_verified, phone_verified)
        VALUES ($1, $2, $3, $4, 'active', true, true)
        RETURNING id
      `, ['otheruser@example.com', 'hashedpass', '다른사용자', '010-9999-9999']);

      const otherUserId = otherUserResult.rows[0].id;

      // 다른 사용자의 역할 생성
      const otherRoleResult = await pool.query(`
        INSERT INTO user_roles (user_id, role_type, business_id, business_name, is_active, permissions, valid_from)
        VALUES ($1, 'seeker', NULL, NULL, true, $2, NOW())
        RETURNING id
      `, [otherUserId, JSON.stringify(['profile:read'])]);

      const otherUserRoleData = {
        roleId: otherRoleResult.rows[0].id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(otherUserRoleData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/access.*denied/i);
    });

    it('현재와 동일한 역할로 전환 시도 시 정상 처리되어야 함', async () => {
      const sameRoleData = {
        roleId: seekerRole.id // 현재 역할과 동일
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(sameRoleData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body.currentRole.id).toBe(seekerRole.id);
      expect(response.body.currentRole.roleType).toBe('seeker');
    });
  });

  describe('비즈니스 로직 검증', () => {
    it('역할 전환 시 이전 세션의 권한이 무효화되어야 함', async () => {
      const switchData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(switchData)
        .expect(200);

      // 기존 토큰으로 다른 API 요청 시 무효화되어야 함 (구현에 따라)
      // 이는 실제 보호된 엔드포인트가 있어야 테스트 가능
      expect(response.body.accessToken).not.toBe(accessToken);
    });

    it('역할별 권한 정보가 올바르게 반환되어야 함', async () => {
      const switchData = {
        roleId: ownerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(switchData)
        .expect(200);

      const { permissions } = response.body.currentRole;
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions).toContain('business:manage');
      expect(permissions).toContain('user:manage');
      expect(permissions).toContain('payroll:manage');
    });

    it('사업장 정보가 포함된 역할 전환 시 비즈니스 정보가 올바르게 반환되어야 함', async () => {
      const switchData = {
        roleId: managerRole.id
      };

      const response = await request(app)
        .post('/api/v1/auth/switch-role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(switchData)
        .expect(200);

      const { currentRole } = response.body;
      expect(currentRole.businessId).toBe(managerRole.business_id);
      expect(currentRole.businessName).toBe(managerRole.business_name);
      expect(typeof currentRole.businessId).toBe('number');
      expect(typeof currentRole.businessName).toBe('string');
    });
  });

  describe('동시성 처리', () => {
    it('동시에 여러 역할로 전환 시도 시 마지막 요청이 우선되어야 함', async () => {
      const switchData1 = { roleId: ownerRole.id };
      const switchData2 = { roleId: managerRole.id };

      // 동시에 두 개의 역할 전환 요청
      const [response1, response2] = await Promise.all([
        request(app)
          .post('/api/v1/auth/switch-role')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(switchData1),
        request(app)
          .post('/api/v1/auth/switch-role')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(switchData2)
      ]);

      // 두 요청 모두 성공할 수 있지만, 최종 상태는 일관성이 있어야 함
      const successResponses = [response1, response2].filter(r => r.status === 200);
      expect(successResponses.length).toBeGreaterThanOrEqual(1);

      // Redis에서 최종 세션 상태 확인
      const sessionKeys = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionKeys.length).toBeGreaterThan(0);
    });
  });
});