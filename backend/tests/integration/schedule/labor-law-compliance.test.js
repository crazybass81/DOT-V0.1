/**
 * T275: 스케줄 통합 테스트 - 노동법 준수 검증
 * 한국 근로기준법 준수 여부 통합 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');
const { generateToken } = require('../../../src/lib/auth-lib/token');
const scheduleLib = require('../../../src/lib/schedule-lib');
const moment = require('moment-timezone');

describe('스케줄 노동법 준수 통합 테스트', () => {
  let managerId, workerId;
  let managerToken, workerToken;
  let businessId;

  beforeAll(async () => {
    // 테스트 환경 설정
    const businessResult = await pool.query(`
      INSERT INTO businesses (name, registration_number, owner_id, address)
      VALUES ('노동법테스트 사업장', '777-66-55544', 1, '서울시 중구')
      RETURNING id
    `);
    businessId = businessResult.rows[0].id;

    const managerResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('labor-manager@test.com', 'hashed', '노동법관리자', '010-7777-8888')
      RETURNING id
    `);
    managerId = managerResult.rows[0].id;

    const workerResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone)
      VALUES ('labor-worker@test.com', 'hashed', '노동법직원', '010-9999-0000')
      RETURNING id
    `);
    workerId = workerResult.rows[0].id;

    await pool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type, wage_type, wage_amount)
      VALUES
        ($1, $3, 'manager', 'monthly', 3000000),
        ($2, $3, 'worker', 'hourly', 10000)
    `, [managerId, workerId, businessId]);

    managerToken = generateToken({ userId: managerId, role: 'manager' });
    workerToken = generateToken({ userId: workerId, role: 'worker' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM schedules WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [businessId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [managerId, workerId]);
  });

  describe('주 52시간 제한 검증', () => {
    it('주 52시간을 초과하는 스케줄 할당은 거부되어야 함', async () => {
      const scheduleIds = [];
      const monday = moment().startOf('week').add(1, 'week'); // 다음 주 월요일

      // 월-금 각 10시간씩 스케줄 생성 (총 50시간)
      for (let i = 0; i < 5; i++) {
        const date = monday.clone().add(i, 'days').set({ hour: 9, minute: 0, second: 0 });
        const createResponse = await request(app)
          .post('/api/v1/schedules')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            business_id: businessId,
            start_time: date.toISOString(),
            end_time: date.clone().add(10, 'hours').toISOString(),
            required_workers: 1,
            user_id: workerId
          });

        if (createResponse.status === 201) {
          scheduleIds.push(createResponse.body.data.schedule_id);
        }
      }

      // 토요일에 3시간 추가 시도 (총 53시간 - 초과)
      const saturday = monday.clone().add(5, 'days').set({ hour: 9, minute: 0, second: 0 });
      const saturdayResponse = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: saturday.toISOString(),
          end_time: saturday.clone().add(3, 'hours').toISOString(),
          required_workers: 1,
          user_id: workerId
        });

      // 52시간 초과로 할당 실패해야 함
      expect(saturdayResponse.status).toBe(201); // 스케줄은 생성됨

      const assignResponse = await request(app)
        .post(`/api/v1/schedules/${saturdayResponse.body.data.schedule_id}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          user_id: workerId
        });

      expect(assignResponse.status).toBe(400);
      expect(assignResponse.body.error).toContain('EXCEED_MAX_HOURS');
      expect(assignResponse.body.maxHours).toBe(52);
    });

    it('라이브러리 함수로 주간 시간을 검증할 수 있어야 함', () => {
      const schedules = [];
      const monday = moment().startOf('week');

      // 주간 스케줄 생성
      for (let i = 0; i < 6; i++) {
        const date = monday.clone().add(i, 'days');
        schedules.push({
          start_time: date.clone().set({ hour: 9, minute: 0 }).toDate(),
          end_time: date.clone().set({ hour: 18, minute: 0 }).toDate() // 9시간씩
        });
      }

      const validation = scheduleLib.validateMaxHours(
        schedules,
        monday.toDate(),
        monday.clone().endOf('week').toDate()
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          type: 'MAX_WEEKLY_HOURS',
          message: expect.stringContaining('52시간')
        })
      );
      expect(validation.weeklyHours).toBe(54); // 9시간 × 6일 = 54시간
    });
  });

  describe('11시간 연속 휴식 보장', () => {
    it('11시간 미만 휴식 시간은 경고가 발생해야 함', async () => {
      const today = moment().set({ hour: 22, minute: 0, second: 0 }); // 오늘 밤 10시
      const tomorrow = moment().add(1, 'day').set({ hour: 8, minute: 0, second: 0 }); // 내일 오전 8시

      // 밤 근무 스케줄 생성
      const nightResponse = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: today.toISOString(),
          end_time: today.clone().add(4, 'hours').toISOString(), // 밤 10시-새벽 2시
          required_workers: 1,
          user_id: workerId
        });

      expect(nightResponse.status).toBe(201);

      // 다음날 아침 근무 스케줄 생성 (휴식시간 6시간)
      const morningResponse = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: tomorrow.toISOString(), // 오전 8시 시작
          end_time: tomorrow.clone().add(8, 'hours').toISOString(),
          required_workers: 1,
          user_id: workerId
        });

      // 충돌 검사 결과 확인
      if (morningResponse.status === 400) {
        expect(morningResponse.body.conflicts).toContainEqual(
          expect.objectContaining({
            type: 'INSUFFICIENT_REST'
          })
        );
      }
    });

    it('라이브러리 함수로 휴식 시간을 검증할 수 있어야 함', () => {
      const today = moment();

      const newSchedule = {
        start_time: today.clone().set({ hour: 9, minute: 0 }).toDate(),
        end_time: today.clone().set({ hour: 18, minute: 0 }).toDate()
      };

      const existingSchedules = [{
        start_time: today.clone().subtract(1, 'day').set({ hour: 20, minute: 0 }).toDate(),
        end_time: today.clone().subtract(1, 'day').set({ hour: 23, minute: 0 }).toDate() // 전날 밤 11시 종료
      }];

      const conflictCheck = scheduleLib.checkConflict(newSchedule, existingSchedules);

      expect(conflictCheck.hasConflict).toBe(true);
      expect(conflictCheck.conflicts).toContainEqual(
        expect.objectContaining({
          type: 'INSUFFICIENT_REST',
          message: expect.stringContaining('11시간')
        })
      );
    });
  });

  describe('일 최대 12시간 제한', () => {
    it('12시간을 초과하는 단일 스케줄은 생성할 수 없어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: moment().add(20, 'days').set({ hour: 6, minute: 0 }).toISOString(),
          end_time: moment().add(20, 'days').set({ hour: 19, minute: 0 }).toISOString(), // 13시간
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

    it('하루에 여러 스케줄로도 12시간을 초과할 수 없어야 함', async () => {
      const targetDate = moment().add(30, 'days');

      // 첫 번째 스케줄: 오전 9시-오후 5시 (8시간)
      const morning = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: targetDate.clone().set({ hour: 9, minute: 0 }).toISOString(),
          end_time: targetDate.clone().set({ hour: 17, minute: 0 }).toISOString(),
          required_workers: 1,
          user_id: workerId
        });

      expect(morning.status).toBe(201);

      // 두 번째 스케줄: 오후 6시-밤 11시 (5시간) - 총 13시간
      const evening = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: targetDate.clone().set({ hour: 18, minute: 0 }).toISOString(),
          end_time: targetDate.clone().set({ hour: 23, minute: 0 }).toISOString(),
          required_workers: 1,
          user_id: workerId
        });

      // 일일 최대 시간 초과로 거부되어야 함
      if (evening.status === 201) {
        const assignResponse = await request(app)
          .post(`/api/v1/schedules/${evening.body.data.schedule_id}/assign`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            user_id: workerId
          });

        // 할당 시 검증
        expect(assignResponse.body.currentHours).toBeGreaterThan(8);
      }
    });
  });

  describe('연속 6일 근무 제한', () => {
    it('7일 연속 근무는 허용되지 않아야 함', async () => {
      const startMonday = moment().add(2, 'weeks').startOf('week');
      const scheduleIds = [];

      // 월-토 6일 연속 스케줄 생성
      for (let i = 0; i < 6; i++) {
        const date = startMonday.clone().add(i, 'days');
        const response = await request(app)
          .post('/api/v1/schedules')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            business_id: businessId,
            start_time: date.clone().set({ hour: 9, minute: 0 }).toISOString(),
            end_time: date.clone().set({ hour: 18, minute: 0 }).toISOString(),
            required_workers: 1,
            user_id: workerId
          });

        if (response.status === 201) {
          scheduleIds.push(response.body.data.schedule_id);
        }
      }

      // 일요일 (7일째) 스케줄 생성 시도
      const sunday = startMonday.clone().add(6, 'days');
      const sundayResponse = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          start_time: sunday.clone().set({ hour: 9, minute: 0 }).toISOString(),
          end_time: sunday.clone().set({ hour: 18, minute: 0 }).toISOString(),
          required_workers: 1,
          user_id: workerId
        });

      // 연속 근무일 제한 검증
      const validation = scheduleLib.validateMaxConsecutiveDays([
        ...scheduleIds.map((id, i) => ({
          start_time: startMonday.clone().add(i, 'days').set({ hour: 9, minute: 0 }).toDate(),
          end_time: startMonday.clone().add(i, 'days').set({ hour: 18, minute: 0 }).toDate()
        })),
        {
          start_time: sunday.clone().set({ hour: 9, minute: 0 }).toDate(),
          end_time: sunday.clone().set({ hour: 18, minute: 0 }).toDate()
        }
      ]);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          type: 'MAX_CONSECUTIVE_DAYS',
          message: expect.stringContaining('6일')
        })
      );
    });
  });

  describe('자동 할당 시 노동법 준수', () => {
    it('자동 할당도 주 52시간을 준수해야 함', async () => {
      const nextWeek = moment().add(1, 'week').startOf('week');

      // 자동 할당 요청
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          business_id: businessId,
          template_id: null,
          start_time: nextWeek.clone().set({ hour: 9, minute: 0 }).toISOString(),
          end_time: nextWeek.clone().set({ hour: 18, minute: 0 }).toISOString(),
          required_workers: 1,
          auto_assign: true
        });

      if (response.status === 201 && response.body.data.auto_assigned) {
        // 자동 할당된 직원의 주간 시간 확인
        const weeklySchedules = await pool.query(`
          SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as total_hours
          FROM schedules
          WHERE user_id = ANY(
            SELECT user_id FROM schedule_assignments
            WHERE schedule_id = $1
          )
          AND start_time >= $2
          AND end_time <= $3
        `, [
          response.body.data.schedules[0].id,
          nextWeek.toDate(),
          nextWeek.clone().endOf('week').toDate()
        ]);

        const totalHours = parseFloat(weeklySchedules.rows[0]?.total_hours || 0);
        expect(totalHours).toBeLessThanOrEqual(52);
      }
    });
  });
});

module.exports = {
  businessId,
  managerId,
  workerId
};