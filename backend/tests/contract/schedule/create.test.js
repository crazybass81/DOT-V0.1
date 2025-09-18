/**
 * T266: 스케줄 생성 API 계약 테스트 (RED 단계)
 * POST /api/v1/schedules 엔드포인트 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');
const { generateToken } = require('../../../src/lib/auth-lib/token');

describe('POST /api/v1/schedules - 스케줄 생성', () => {
  let managerToken;
  let workerToken;
  let businessId;
  let managerId;
  let workerId;

  beforeAll(async () => {
    // 테스트 사업장 생성
    const businessResult = await pool.query(`
      INSERT INTO businesses (name, registration_number, owner_id, address)
      VALUES ('테스트 사업장', '123-45-67890', 1, '서울시 강남구')
      RETURNING id
    `);
    businessId = businessResult.rows[0].id;

    // 테스트 사용자 생성
    const managerResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('manager@test.com', 'hashed', '김관리자', '010-1234-5678')
      RETURNING id
    `);
    managerId = managerResult.rows[0].id;

    const workerResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('worker@test.com', 'hashed', '박직원', '010-9876-5432')
      RETURNING id
    `);
    workerId = workerResult.rows[0].id;

    // 역할 할당
    await pool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type)
      VALUES 
        ($1, $3, 'manager'),
        ($2, $3, 'worker')
    `, [managerId, workerId, businessId]);

    // 테스트 토큰 생성
    managerToken = generateToken({ userId: managerId, role: 'manager' });
    workerToken = generateToken({ userId: workerId, role: 'worker' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM schedules WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [businessId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [managerId, workerId]);
  });

  describe('성공 케이스', () => {
    it('관리자가 스케줄을 생성할 수 있어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          schedule_type: 'regular',
          start_time: '2024-12-20T09:00:00.000Z',
          end_time: '2024-12-20T18:00:00.000Z',
          required_workers: 3,
          notes: '오전 근무'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('schedule_id');
      expect(response.body.data.schedule_type).toBe('regular');
      expect(response.body.data.required_workers).toBe(3);
      expect(response.body.data.status).toBe('draft');
    });

    it('소유자가 스케줄을 생성할 수 있어야 함', async () => {
      const ownerToken = generateToken({ userId: 1, role: 'owner' });

      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          business_id: businessId,
          schedule_type: 'holiday',
          start_time: '2024-12-25T10:00:00.000Z',
          end_time: '2024-12-25T20:00:00.000Z',
          required_workers: 2,
          notes: '크리스마스 특별 근무'
        });

      expect(response.status).toBe(201);
      expect(response.body.data.schedule_type).toBe('holiday');
    });

    it('템플릿으로부터 스케줄을 생성할 수 있어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          template_id: 'template_001',
          start_date: '2024-12-01',
          end_date: '2024-12-07',
          auto_assign: true
        });

      expect(response.status).toBe(201);
      expect(response.body.data.created_from_template).toBe(true);
      expect(response.body.data.schedules).toBeInstanceOf(Array);
    });
  });

  describe('실패 케이스', () => {
    it('일반 직원은 스케줄을 생성할 수 없어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          business_id: businessId,
          schedule_type: 'regular',
          start_time: '2024-12-20T09:00:00.000Z',
          end_time: '2024-12-20T18:00:00.000Z',
          required_workers: 3
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('권한');
    });

    it('필수 필드 누락 시 오류가 발생해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          // start_time 누락
          end_time: '2024-12-20T18:00:00.000Z'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          field: 'start_time',
          message: expect.stringContaining('필수')
        })
      );
    });

    it('유효하지 않은 시간 범위 시 오류가 발생해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: '2024-12-20T18:00:00.000Z',
          end_time: '2024-12-20T09:00:00.000Z', // 종료가 시작보다 빠름
          required_workers: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          field: 'time_range',
          message: expect.stringContaining('시작 시간')
        })
      );
    });

    it('3시간 미만 근무는 생성할 수 없어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: '2024-12-20T09:00:00.000Z',
          end_time: '2024-12-20T11:00:00.000Z', // 2시간만
          required_workers: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          field: 'duration',
          message: expect.stringContaining('최소 3시간')
        })
      );
    });

    it('12시간 초과 근무는 생성할 수 없어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: '2024-12-20T09:00:00.000Z',
          end_time: '2024-12-20T22:00:00.000Z', // 13시간
          required_workers: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          field: 'duration',
          message: expect.stringContaining('최대 12시간')
        })
      );
    });

    it('충돌하는 스케줄은 생성할 수 없어야 함', async () => {
      // 기존 스케줄 생성
      await pool.query(`
        INSERT INTO schedules (business_id, user_id, start_time, end_time, status)
        VALUES ($1, $2, '2024-12-20T14:00:00.000Z', '2024-12-20T20:00:00.000Z', 'confirmed')
      `, [businessId, workerId]);

      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          user_id: workerId,
          start_time: '2024-12-20T15:00:00.000Z', // 겹치는 시간
          end_time: '2024-12-20T21:00:00.000Z',
          required_workers: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('CONFLICT');
    });
  });

  describe('유효성 검증', () => {
    it('필요 인원은 1명 이상이어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: '2024-12-20T09:00:00.000Z',
          end_time: '2024-12-20T18:00:00.000Z',
          required_workers: 0 // 잘못된 값
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          field: 'required_workers',
          message: expect.stringContaining('최소 1명')
        })
      );
    });

    it('3개월 이후 스케줄은 생성할 수 없어야 함', async () => {
      const fourMonthsLater = new Date();
      fourMonthsLater.setMonth(fourMonthsLater.getMonth() + 4);

      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: fourMonthsLater.toISOString(),
          end_time: new Date(fourMonthsLater.getTime() + 8 * 60 * 60 * 1000).toISOString(),
          required_workers: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          field: 'start_time',
          message: expect.stringContaining('3개월')
        })
      );
    });
  });
});

module.exports = {
  businessId,
  managerId,
  workerId
};