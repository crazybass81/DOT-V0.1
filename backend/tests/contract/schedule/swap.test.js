/**
 * T268: 스케줄 교대 API 계약 테스트 (RED 단계)
 * POST /api/v1/schedules/swap 엔드포인트 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');
const { generateToken } = require('../../../src/lib/auth-lib/token');
const moment = require('moment-timezone');

describe('POST /api/v1/schedules/swap - 스케줄 교대', () => {
  let worker1Token, worker2Token, managerToken;
  let businessId;
  let schedule1Id, schedule2Id;
  let workerId1, workerId2;

  beforeAll(async () => {
    // 테스트 사업장 생성
    const businessResult = await pool.query(`
      INSERT INTO businesses (name, registration_number, owner_id, address)
      VALUES ('교대 테스트 사업장', '555-44-33333', 1, '서울시 마포구')
      RETURNING id
    `);
    businessId = businessResult.rows[0].id;

    // 테스트 직원 생성
    const worker1Result = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('swap1@test.com', 'hashed', '최교대', '010-5555-6666')
      RETURNING id
    `);
    workerId1 = worker1Result.rows[0].id;

    const worker2Result = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('swap2@test.com', 'hashed', '정교대', '010-7777-8888')
      RETURNING id
    `);
    workerId2 = worker2Result.rows[0].id;

    // 역할 할당
    await pool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type)
      VALUES
        ($1, $3, 'worker'),
        ($2, $3, 'worker')
    `, [workerId1, workerId2, businessId]);

    // 2일 후 스케줄 생성
    const twoDaysLater = moment().add(2, 'days').set({ hour: 9, minute: 0, second: 0 });
    const schedule1Result = await pool.query(`
      INSERT INTO schedules (
        business_id,
        user_id,
        start_time,
        end_time,
        status,
        schedule_type
      ) VALUES (
        $1, $2,
        $3,
        $4,
        'confirmed',
        'regular'
      )
      RETURNING id
    `, [
      businessId,
      workerId1,
      twoDaysLater.toDate(),
      twoDaysLater.clone().add(8, 'hours').toDate()
    ]);
    schedule1Id = schedule1Result.rows[0].id;

    // 3일 후 스케줄 생성
    const threeDaysLater = moment().add(3, 'days').set({ hour: 14, minute: 0, second: 0 });
    const schedule2Result = await pool.query(`
      INSERT INTO schedules (
        business_id,
        user_id,
        start_time,
        end_time,
        status,
        schedule_type
      ) VALUES (
        $1, $2,
        $3,
        $4,
        'confirmed',
        'regular'
      )
      RETURNING id
    `, [
      businessId,
      workerId2,
      threeDaysLater.toDate(),
      threeDaysLater.clone().add(8, 'hours').toDate()
    ]);
    schedule2Id = schedule2Result.rows[0].id;

    // 토큰 생성
    worker1Token = generateToken({ userId: workerId1, role: 'worker' });
    worker2Token = generateToken({ userId: workerId2, role: 'worker' });
    managerToken = generateToken({ userId: 1, role: 'manager' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM schedule_swap_requests WHERE schedule_1_id IN ($1, $2)', [schedule1Id, schedule2Id]);
    await pool.query('DELETE FROM schedules WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [businessId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [workerId1, workerId2]);
  });

  describe('성공 케이스', () => {
    it('직원이 교대 요청을 생성할 수 있어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '개인 사정으로 인한 교대 요청'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('swap_request_id');
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.requester_id).toBe(workerId1);
      expect(response.body.data.target_user_id).toBe(workerId2);
    });

    it('상대방이 교대 요청을 수락할 수 있어야 함', async () => {
      // 먼저 교대 요청 생성
      const requestResponse = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '교대 요청'
        });

      const swapRequestId = requestResponse.body.data.swap_request_id;

      // 상대방이 수락
      const response = await request(app)
        .patch(`/api/v1/schedules/swap/${swapRequestId}/accept`)
        .set('Authorization', `Bearer ${worker2Token}`)
        .send({
          accept: true
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('accepted');
      expect(response.body.message).toContain('교대가 완료');
    });

    it('상대방이 교대 요청을 거절할 수 있어야 함', async () => {
      const requestResponse = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '교대 요청'
        });

      const swapRequestId = requestResponse.body.data.swap_request_id;

      const response = await request(app)
        .patch(`/api/v1/schedules/swap/${swapRequestId}/reject`)
        .set('Authorization', `Bearer ${worker2Token}`)
        .send({
          reject_reason: '개인 일정이 있습니다'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('rejected');
    });

    it('관리자가 교대를 직접 실행할 수 있어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          schedule_1_id: schedule1Id,
          schedule_2_id: schedule2Id,
          force: true,
          admin_note: '업무상 필요에 의한 교대'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.swapped).toBe(true);
      expect(response.body.data.admin_executed).toBe(true);
    });
  });

  describe('실패 케이스', () => {
    it('24시간 이내 스케줄은 교대할 수 없어야 함', async () => {
      // 오늘 스케줄 생성
      const todaySchedule = await pool.query(`
        INSERT INTO schedules (
          business_id,
          user_id,
          start_time,
          end_time,
          status
        ) VALUES (
          $1, $2,
          NOW() + INTERVAL '6 hours',
          NOW() + INTERVAL '14 hours',
          'confirmed'
        )
        RETURNING id
      `, [businessId, workerId1]);

      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: todaySchedule.rows[0].id,
          target_schedule_id: schedule2Id,
          reason: '긴급 교대'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('24시간');
    });

    it('다른 사업장 스케줄과는 교대할 수 없어야 함', async () => {
      // 다른 사업장 스케줄 생성
      const otherBusinessResult = await pool.query(`
        INSERT INTO businesses (name, registration_number, owner_id, address)
        VALUES ('다른 사업장', '999-88-77777', 1, '서울시 강북구')
        RETURNING id
      `);

      const otherScheduleResult = await pool.query(`
        INSERT INTO schedules (
          business_id,
          user_id,
          start_time,
          end_time,
          status
        ) VALUES (
          $1, $2,
          '2024-12-25T09:00:00.000Z',
          '2024-12-25T18:00:00.000Z',
          'confirmed'
        )
        RETURNING id
      `, [otherBusinessResult.rows[0].id, workerId2]);

      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: otherScheduleResult.rows[0].id,
          reason: '교대 요청'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('다른 사업장');
    });

    it('교대 후 충돌이 발생하면 거부되어야 함', async () => {
      // worker2에게 schedule1과 같은 시간대 다른 스케줄 추가
      const conflictSchedule = await pool.query(`
        INSERT INTO schedules (
          business_id,
          user_id,
          start_time,
          end_time,
          status
        ) VALUES (
          $1, $2,
          (SELECT start_time FROM schedules WHERE id = $3),
          (SELECT end_time FROM schedules WHERE id = $3),
          'confirmed'
        )
        RETURNING id
      `, [businessId, workerId2, schedule1Id]);

      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '교대 요청'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('충돌');
    });

    it('본인의 스케줄이 아니면 교대 요청할 수 없어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule2Id, // worker2의 스케줄
          target_schedule_id: schedule1Id,
          reason: '교대 요청'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('권한');
    });

    it('취소된 스케줄은 교대할 수 없어야 함', async () => {
      // 스케줄 취소
      await pool.query(`
        UPDATE schedules SET status = 'cancelled' WHERE id = $1
      `, [schedule1Id]);

      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '교대 요청'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('취소');

      // 복구
      await pool.query(`
        UPDATE schedules SET status = 'confirmed' WHERE id = $1
      `, [schedule1Id]);
    });

    it('이미 진행 중인 교대 요청이 있으면 중복 요청할 수 없어야 함', async () => {
      // 첫 번째 요청
      await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '첫 번째 요청'
        });

      // 중복 요청
      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '중복 요청'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('이미 진행 중');
    });
  });

  describe('교대 후 검증', () => {
    it('교대 후 주 52시간을 초과하면 경고를 표시해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '교대 요청',
          check_hours: true
        });

      // 응답에 경고가 포함되어야 함
      if (response.body.warning) {
        expect(response.body.warning).toContain('52시간');
      }
    });

    it('교대 후 휴식 시간이 부족하면 경고를 표시해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules/swap')
        .set('Authorization', `Bearer ${worker1Token}`)
        .send({
          my_schedule_id: schedule1Id,
          target_schedule_id: schedule2Id,
          reason: '교대 요청',
          check_rest: true
        });

      if (response.body.warning) {
        expect(response.body.warning).toContain('11시간');
      }
    });
  });
});

module.exports = {
  schedule1Id,
  schedule2Id,
  workerId1,
  workerId2
};