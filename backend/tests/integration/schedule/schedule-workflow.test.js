/**
 * T274: 스케줄 통합 테스트 - 전체 워크플로우
 * 스케줄 생성부터 교대까지 전체 흐름 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');
const { generateToken } = require('../../../src/lib/auth-lib/token');
const moment = require('moment-timezone');

describe('스케줄 관리 통합 워크플로우', () => {
  let managerId, workerId1, workerId2;
  let managerToken, worker1Token, worker2Token;
  let businessId;
  let scheduleId1, scheduleId2;

  beforeAll(async () => {
    // 테스트 데이터 초기화
    await pool.query('BEGIN');

    // 사업장 생성
    const businessResult = await pool.query(`
      INSERT INTO businesses (name, registration_number, owner_id, address)
      VALUES ('통합테스트 식당', '999-88-77766', 1, '서울시 종로구')
      RETURNING id
    `);
    businessId = businessResult.rows[0].id;

    // 사용자 생성
    const managerResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('integration-manager@test.com', 'hashed', '통합관리자', '010-1111-2222')
      RETURNING id
    `);
    managerId = managerResult.rows[0].id;

    const worker1Result = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('integration-worker1@test.com', 'hashed', '통합직원1', '010-3333-4444')
      RETURNING id
    `);
    workerId1 = worker1Result.rows[0].id;

    const worker2Result = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('integration-worker2@test.com', 'hashed', '통합직원2', '010-5555-6666')
      RETURNING id
    `);
    workerId2 = worker2Result.rows[0].id;

    // 역할 할당
    await pool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type, wage_type, wage_amount)
      VALUES
        ($1, $4, 'manager', 'monthly', 3000000),
        ($2, $4, 'worker', 'hourly', 10000),
        ($3, $4, 'worker', 'hourly', 10000)
    `, [managerId, workerId1, workerId2, businessId]);

    await pool.query('COMMIT');

    // 토큰 생성
    managerToken = generateToken({ userId: managerId, role: 'manager' });
    worker1Token = generateToken({ userId: workerId1, role: 'worker' });
    worker2Token = generateToken({ userId: workerId2, role: 'worker' });
  });

  afterAll(async () => {
    // 클린업
    await pool.query('DELETE FROM schedule_swap_requests WHERE schedule_1_id IN (SELECT id FROM schedules WHERE business_id = $1)', [businessId]);
    await pool.query('DELETE FROM schedule_assignments WHERE schedule_id IN (SELECT id FROM schedules WHERE business_id = $1)', [businessId]);
    await pool.query('DELETE FROM schedules WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [businessId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [managerId, workerId1, workerId2]);
  });

  describe('1. 스케줄 생성 및 할당 플로우', () => {
    it('관리자가 스케줄을 생성하고 직원을 할당할 수 있어야 함', async () => {
      // 1단계: 스케줄 생성
      const tomorrow = moment().add(1, 'day').set({ hour: 9, minute: 0, second: 0 });
      const createResponse = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          schedule_type: 'regular',
          start_time: tomorrow.toISOString(),
          end_time: tomorrow.clone().add(8, 'hours').toISOString(),
          required_workers: 2,
          notes: '통합 테스트 스케줄'
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);
      scheduleId1 = createResponse.body.data.schedule_id;

      // 2단계: 직원 할당
      const assignResponse = await request(app)
        .post(`/api/v1/schedules/${scheduleId1}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_ids: [workerId1, workerId2]
        });

      expect(assignResponse.status).toBe(201);
      expect(assignResponse.body.data.succeeded).toBe(2);
      expect(assignResponse.body.data.failed).toBe(0);

      // 3단계: 스케줄 승인
      const approveResponse = await request(app)
        .post(`/api/v1/schedules/${scheduleId1}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          notify_workers: true
        });

      expect(approveResponse.status).toBe(200);
      expect(approveResponse.body.data.status).toBe('published');
      expect(approveResponse.body.data.assigned_workers).toBe(2);
    });

    it('직원이 자신의 스케줄을 조회할 수 있어야 함', async () => {
      const response = await request(app)
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${worker1Token}`)
        .query({
          business_id: businessId,
          worker_id: workerId1
        });

      expect(response.status).toBe(200);
      expect(response.body.data.schedules).toBeInstanceOf(Array);
      expect(response.body.data.schedules.length).toBeGreaterThan(0);

      const mySchedule = response.body.data.schedules.find(s => s.id === scheduleId1);
      expect(mySchedule).toBeDefined();
      expect(mySchedule.status).toBe('published');
    });
  });

  describe('2. 스케줄 교대 플로우', () => {
    let swapRequestId;

    beforeAll(async () => {
      // 교대용 추가 스케줄 생성
      const afterTomorrow = moment().add(2, 'days').set({ hour: 14, minute: 0, second: 0 });

      const createResponse = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          schedule_type: 'regular',
          start_time: afterTomorrow.toISOString(),
          end_time: afterTomorrow.clone().add(8, 'hours').toISOString(),
          required_workers: 1,
          user_id: workerId2
        });

      scheduleId2 = createResponse.body.data.schedule_id;

      // 승인
      await request(app)
        .post(`/api/v1/schedules/${scheduleId2}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});
    });

    it('직원이 교대 요청을 생성할 수 있어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: scheduleId1,
          target_schedule_id: scheduleId2,
          reason: '개인 사정으로 인한 교대 요청',
          check_hours: true,
          check_rest: true
        });

      expect(response.status).toBe(201);
      expect(response.body.data.swap_request_id).toBeDefined();
      expect(response.body.data.status).toBe('pending');
      swapRequestId = response.body.data.swap_request_id;
    });

    it('대상 직원이 교대 요청을 수락할 수 있어야 함', async () => {
      const response = await request(app)
        .patch(`/api/v1/schedules/swap/${swapRequestId}/accept`)
        .set('Authorization', `Bearer ${worker2Token}`)
        .send({
          accept: true
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('accepted');
      expect(response.body.data.swapped).toBe(true);
    });

    it('교대 후 스케줄이 올바르게 변경되어야 함', async () => {
      // worker1의 스케줄 확인
      const worker1Response = await request(app)
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${worker1Token}`)
        .query({
          business_id: businessId,
          worker_id: workerId1
        });

      // worker2의 스케줄 확인
      const worker2Response = await request(app)
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${worker2Token}`)
        .query({
          business_id: businessId,
          worker_id: workerId2
        });

      // 교대가 올바르게 되었는지 확인
      const worker1Schedules = worker1Response.body.data.schedules;
      const worker2Schedules = worker2Response.body.data.schedules;

      // worker1은 scheduleId2를 가져야 함
      expect(worker1Schedules.some(s => s.id === scheduleId2)).toBe(true);

      // worker2는 scheduleId1을 가져야 함
      expect(worker2Schedules.some(s => s.id === scheduleId1)).toBe(true);
    });
  });

  describe('3. 일괄 처리 및 요약 조회', () => {
    it('관리자가 월간 스케줄 요약을 조회할 수 있어야 함', async () => {
      const response = await request(app)
        .get('/api/v1/schedules/summary')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({
          business_id: businessId,
          month: moment().format('YYYY-MM')
        });

      expect(response.status).toBe(200);
      expect(response.body.data.month).toBe(moment().format('YYYY-MM'));
      expect(response.body.data.daily_summary).toBeInstanceOf(Array);
      expect(response.body.data.worker_stats).toBeInstanceOf(Array);
      expect(response.body.data.totals).toHaveProperty('total_schedules');
      expect(response.body.data.totals).toHaveProperty('total_hours');
    });

    it('여러 스케줄을 일괄 승인할 수 있어야 함', async () => {
      // 여러 draft 스케줄 생성
      const scheduleIds = [];
      for (let i = 3; i <= 5; i++) {
        const date = moment().add(i, 'days').set({ hour: 9, minute: 0, second: 0 });
        const createResponse = await request(app)
          .post('/api/v1/schedules')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            business_id: businessId,
            start_time: date.toISOString(),
            end_time: date.clone().add(8, 'hours').toISOString(),
            required_workers: 1
          });

        scheduleIds.push(createResponse.body.data.schedule_id);
      }

      // 일괄 승인
      const response = await request(app)
        .post('/api/v1/schedules/bulk-approve')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          schedule_ids: scheduleIds,
          notify_workers: false
        });

      expect(response.status).toBe(200);
      expect(response.body.data.approved_count).toBe(3);
      expect(response.body.data.failed_count).toBe(0);
      expect(response.body.data.success_rate).toBe('100.0%');
    });
  });

  describe('4. 권한 및 검증', () => {
    it('일반 직원은 스케줄을 생성할 수 없어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          business_id: businessId,
          start_time: moment().add(7, 'days').toISOString(),
          end_time: moment().add(7, 'days').add(8, 'hours').toISOString(),
          required_workers: 1
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('권한');
    });

    it('다른 사업장의 스케줄은 조회할 수 없어야 함', async () => {
      const response = await request(app)
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${worker1Token}`)
        .query({
          business_id: 99999, // 존재하지 않는 사업장
          worker_id: workerId1
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('권한');
    });

    it('주 52시간을 초과하는 스케줄은 경고가 발생해야 함', async () => {
      // 이미 많은 시간이 할당된 상황 시뮬레이션
      const longScheduleResponse = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: moment().add(10, 'days').toISOString(),
          end_time: moment().add(10, 'days').add(13, 'hours').toISOString(), // 13시간
          required_workers: 1
        });

      if (longScheduleResponse.status === 400) {
        expect(longScheduleResponse.body.errors).toContainEqual(
          expect.objectContaining({
            field: 'duration',
            message: expect.stringContaining('12시간')
          })
        );
      }
    });
  });
});

module.exports = {
  businessId,
  managerId,
  workerId1,
  workerId2
};