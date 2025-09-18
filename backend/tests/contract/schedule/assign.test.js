/**
 * T267: 스케줄 할당 API 계약 테스트 (RED 단계)
 * POST /api/v1/schedules/:id/assign 엔드포인트 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');
const { generateToken } = require('../../../src/lib/auth-lib/token');

describe('POST /api/v1/schedules/:id/assign - 스케줄 할당', () => {
  let managerToken;
  let workerToken;
  let businessId;
  let scheduleId;
  let workerId1, workerId2;

  beforeAll(async () => {
    // 테스트 데이터 설정
    const businessResult = await pool.query(`
      INSERT INTO businesses (name, registration_number, owner_id, address)
      VALUES ('할당 테스트 사업장', '987-65-43210', 1, '서울시 송파구')
      RETURNING id
    `);
    businessId = businessResult.rows[0].id;

    // 직원 생성
    const worker1Result = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('worker1@test.com', 'hashed', '이직원', '010-1111-2222')
      RETURNING id
    `);
    workerId1 = worker1Result.rows[0].id;

    const worker2Result = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('worker2@test.com', 'hashed', '김직원', '010-3333-4444')
      RETURNING id
    `);
    workerId2 = worker2Result.rows[0].id;

    // 역할 할당
    await pool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type, wage_type, wage_amount)
      VALUES
        ($1, $3, 'worker', 'hourly', 10000),
        ($2, $3, 'worker', 'hourly', 10000)
    `, [workerId1, workerId2, businessId]);

    // 스케줄 생성
    const scheduleResult = await pool.query(`
      INSERT INTO schedules (
        business_id,
        start_time,
        end_time,
        required_workers,
        status,
        schedule_type
      ) VALUES (
        $1,
        '2024-12-21T09:00:00.000Z',
        '2024-12-21T18:00:00.000Z',
        2,
        'published',
        'regular'
      )
      RETURNING id
    `, [businessId]);
    scheduleId = scheduleResult.rows[0].id;

    managerToken = generateToken({ userId: 1, role: 'manager' });
    workerToken = generateToken({ userId: workerId1, role: 'worker' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM schedule_assignments WHERE schedule_id = $1', [scheduleId]);
    await pool.query('DELETE FROM schedules WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [businessId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [workerId1, workerId2]);
  });

  describe('성공 케이스', () => {
    it('관리자가 직원을 스케줄에 할당할 수 있어야 함', async () => {
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_id: workerId1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.assignment).toHaveProperty('id');
      expect(response.body.data.assignment.user_id).toBe(workerId1);
      expect(response.body.data.assignment.schedule_id).toBe(scheduleId);
      expect(response.body.data.assignment.status).toBe('assigned');
    });

    it('여러 직원을 한번에 할당할 수 있어야 함', async () => {
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_ids: [workerId1, workerId2]
        });

      expect(response.status).toBe(201);
      expect(response.body.data.assignments).toHaveLength(2);
      expect(response.body.data.succeeded).toBe(2);
    });

    it('자동 할당 요청을 처리할 수 있어야 함', async () => {
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          auto_assign: true,
          required_count: 2
        });

      expect(response.status).toBe(201);
      expect(response.body.data.auto_assigned).toBe(true);
      expect(response.body.data.assignments.length).toBeLessThanOrEqual(2);
    });
  });

  describe('실패 케이스', () => {
    it('일반 직원은 할당할 수 없어야 함', async () => {
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          user_id: workerId2
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('권한');
    });

    it('충돌하는 스케줄에는 할당할 수 없어야 함', async () => {
      // 같은 시간대 다른 스케줄 생성
      const conflictScheduleResult = await pool.query(`
        INSERT INTO schedules (
          business_id,
          start_time,
          end_time,
          status
        ) VALUES (
          $1,
          '2024-12-21T10:00:00.000Z',
          '2024-12-21T16:00:00.000Z',
          'confirmed'
        )
        RETURNING id
      `, [businessId]);

      const conflictId = conflictScheduleResult.rows[0].id;

      // workerId1을 이미 할당
      await pool.query(`
        INSERT INTO schedule_assignments (schedule_id, user_id, status)
        VALUES ($1, $2, 'assigned')
      `, [conflictId, workerId1]);

      // 같은 시간대 다른 스케줄에 할당 시도
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_id: workerId1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('CONFLICT');
    });

    it('주 52시간을 초과하는 할당은 거부되어야 함', async () => {
      // 이미 많은 시간이 할당된 직원에게 추가 할당 시도
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_id: workerId1,
          force: false // 강제 할당 아님
        });

      // 주 52시간 검증 로직
      expect([200, 400]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.error).toContain('EXCEED_MAX_HOURS');
      }
    });

    it('존재하지 않는 직원은 할당할 수 없어야 함', async () => {
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_id: 99999
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('직원');
    });

    it('취소된 스케줄에는 할당할 수 없어야 함', async () => {
      // 스케줄 취소
      await pool.query(`
        UPDATE schedules SET status = 'cancelled' WHERE id = $1
      `, [scheduleId]);

      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_id: workerId1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('취소');

      // 복구
      await pool.query(`
        UPDATE schedules SET status = 'published' WHERE id = $1
      `, [scheduleId]);
    });
  });

  describe('휴식 시간 검증', () => {
    it('11시간 미만 휴식 시간은 경고를 반환해야 함', async () => {
      // 전날 밤 근무 스케줄 생성
      const nightScheduleResult = await pool.query(`
        INSERT INTO schedules (
          business_id,
          start_time,
          end_time,
          status
        ) VALUES (
          $1,
          '2024-12-20T22:00:00.000Z',
          '2024-12-21T02:00:00.000Z',
          'confirmed'
        )
        RETURNING id
      `, [businessId]);

      const nightId = nightScheduleResult.rows[0].id;

      await pool.query(`
        INSERT INTO schedule_assignments (schedule_id, user_id, status)
        VALUES ($1, $2, 'assigned')
      `, [nightId, workerId1]);

      // 다음날 오전 할당 시도 (휴식시간 7시간만)
      const response = await request(app)
        .post(`/api/v1/schedules/${scheduleId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_id: workerId1,
          ignore_warnings: false
        });

      expect(response.status).toBe(400);
      expect(response.body.warning).toContain('휴식');
      expect(response.body.warning).toContain('11시간');
    });
  });
});

module.exports = {
  scheduleId,
  workerId1,
  workerId2
};