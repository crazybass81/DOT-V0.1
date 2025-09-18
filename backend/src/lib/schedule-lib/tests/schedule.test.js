/**
 * T142-T143: Schedule Library 테스트
 * TDD RED Phase - 테스트를 먼저 작성
 * 실제 PostgreSQL 사용, mock 금지
 */

const { expect } = require('chai');
const { Pool } = require('pg');
const ScheduleManager = require('../src/index');
require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env') });

describe('Schedule Library', () => {
  let pool;
  let scheduleManager;
  let testBusinessId;
  let testEmployeeId;

  before(async () => {
    // 실제 데이터베이스 연결
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5434,
      database: process.env.TEST_DB_NAME || process.env.DB_NAME || 'dot_platform_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres123'
    });

    scheduleManager = new ScheduleManager(pool);

    // 테스트 데이터 준비
    await pool.query('BEGIN');

    // 테스트용 비즈니스 생성
    const businessResult = await pool.query(`
      INSERT INTO businesses (
        name, owner_id, registration_number, business_type,
        industry_type, address, location, phone, created_at
      )
      VALUES (
        '테스트 카페', 1, '123-45-67890', '개인사업자',
        'food_service', '서울시 강남구',
        ST_GeogFromText('POINT(127.0276 37.4979)'),
        '02-1234-5678', NOW()
      )
      RETURNING id
    `);
    testBusinessId = businessResult.rows[0].id;

    // 테스트용 직원 생성
    const employeeResult = await pool.query(`
      INSERT INTO employees (
        business_id, user_id, name, role, hourly_rate,
        employment_status, joined_at
      )
      VALUES ($1, 1, '테스트 직원', 'full_time', 10000, 'active', NOW())
      RETURNING id
    `, [testBusinessId]);
    testEmployeeId = employeeResult.rows[0].id;

    await pool.query('COMMIT');
  });

  after(async () => {
    // 테스트 데이터 정리
    if (testBusinessId) {
      await pool.query('DELETE FROM schedules WHERE business_id = $1', [testBusinessId]);
      await pool.query('DELETE FROM employees WHERE business_id = $1', [testBusinessId]);
      await pool.query('DELETE FROM businesses WHERE id = $1', [testBusinessId]);
    }
    await pool.end();
  });

  describe('스케줄 생성', () => {
    it('주간 스케줄을 생성할 수 있어야 한다', async () => {
      // Given: 스케줄 데이터
      const scheduleData = {
        businessId: testBusinessId,
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        employeeSchedules: [
          {
            employeeId: testEmployeeId,
            shifts: [
              { date: '2024-01-01', startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
              { date: '2024-01-02', startTime: '09:00', endTime: '18:00', breakMinutes: 60 }
            ]
          }
        ]
      };

      // When: 스케줄 생성
      const result = await scheduleManager.createWeeklySchedule(scheduleData);

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('scheduleId');
      expect(result.shifts).to.have.lengthOf(2);
      expect(result.totalHours).to.equal(16); // (9시간 - 1시간 휴게) * 2일
    });

    it('중복된 시간대의 스케줄은 생성할 수 없어야 한다', async () => {
      // Given: 첫 번째 스케줄 생성
      await scheduleManager.createWeeklySchedule({
        businessId: testBusinessId,
        startDate: '2024-01-08',
        endDate: '2024-01-08',
        employeeSchedules: [
          {
            employeeId: testEmployeeId,
            shifts: [
              { date: '2024-01-08', startTime: '09:00', endTime: '18:00' }
            ]
          }
        ]
      });

      // When & Then: 같은 시간대 스케줄 생성 시도
      try {
        await scheduleManager.createWeeklySchedule({
          businessId: testBusinessId,
          startDate: '2024-01-08',
          endDate: '2024-01-08',
          employeeSchedules: [
            {
              employeeId: testEmployeeId,
              shifts: [
                { date: '2024-01-08', startTime: '14:00', endTime: '20:00' }
              ]
            }
          ]
        });
        expect.fail('중복 스케줄이 생성되었습니다');
      } catch (error) {
        expect(error.message).to.include('이미 스케줄이 존재합니다');
      }
    });

    it('월간 스케줄을 생성할 수 있어야 한다', async () => {
      // Given: 월간 스케줄 데이터
      const monthlyData = {
        businessId: testBusinessId,
        year: 2024,
        month: 2,
        pattern: 'fixed', // 고정 패턴
        employeeSchedules: [
          {
            employeeId: testEmployeeId,
            weeklyPattern: {
              monday: { startTime: '09:00', endTime: '18:00' },
              tuesday: { startTime: '09:00', endTime: '18:00' },
              wednesday: { startTime: '09:00', endTime: '18:00' },
              thursday: { startTime: '09:00', endTime: '18:00' },
              friday: { startTime: '09:00', endTime: '18:00' },
              saturday: null,
              sunday: null
            }
          }
        ]
      };

      // When: 월간 스케줄 생성
      const result = await scheduleManager.createMonthlySchedule(monthlyData);

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('scheduleId');
      expect(result.totalDays).to.be.greaterThan(0);
      expect(result.totalHours).to.be.greaterThan(0);
    });
  });

  describe('스케줄 조회', () => {
    let createdScheduleId;

    beforeEach(async () => {
      // 테스트용 스케줄 생성
      const result = await scheduleManager.createWeeklySchedule({
        businessId: testBusinessId,
        startDate: '2024-03-01',
        endDate: '2024-03-07',
        employeeSchedules: [
          {
            employeeId: testEmployeeId,
            shifts: [
              { date: '2024-03-01', startTime: '09:00', endTime: '18:00' }
            ]
          }
        ]
      });
      createdScheduleId = result.scheduleId;
    });

    it('특정 날짜의 스케줄을 조회할 수 있어야 한다', async () => {
      // When: 특정 날짜 스케줄 조회
      const result = await scheduleManager.getScheduleByDate({
        businessId: testBusinessId,
        date: '2024-03-01'
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.schedules).to.be.an('array');
      expect(result.schedules).to.have.length.greaterThan(0);
      expect(result.schedules[0]).to.have.property('employeeId', testEmployeeId);
    });

    it('주간 스케줄을 조회할 수 있어야 한다', async () => {
      // When: 주간 스케줄 조회
      const result = await scheduleManager.getWeeklySchedule({
        businessId: testBusinessId,
        startDate: '2024-03-01',
        endDate: '2024-03-07'
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.schedules).to.be.an('array');
      expect(result.totalHours).to.be.greaterThan(0);
    });

    it('직원별 스케줄을 조회할 수 있어야 한다', async () => {
      // When: 직원별 스케줄 조회
      const result = await scheduleManager.getEmployeeSchedule({
        employeeId: testEmployeeId,
        startDate: '2024-03-01',
        endDate: '2024-03-31'
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.schedules).to.be.an('array');
      expect(result.employeeId).to.equal(testEmployeeId);
    });
  });

  describe('스케줄 수정', () => {
    let scheduleToModify;

    beforeEach(async () => {
      // 수정할 스케줄 생성
      const result = await scheduleManager.createWeeklySchedule({
        businessId: testBusinessId,
        startDate: '2024-04-01',
        endDate: '2024-04-01',
        employeeSchedules: [
          {
            employeeId: testEmployeeId,
            shifts: [
              { date: '2024-04-01', startTime: '09:00', endTime: '18:00' }
            ]
          }
        ]
      });
      scheduleToModify = result.shifts[0].id;
    });

    it('스케줄 시간을 변경할 수 있어야 한다', async () => {
      // When: 스케줄 시간 변경
      const result = await scheduleManager.updateSchedule({
        scheduleId: scheduleToModify,
        startTime: '10:00',
        endTime: '19:00'
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.updatedSchedule.startTime).to.equal('10:00:00');
      expect(result.updatedSchedule.endTime).to.equal('19:00:00');
    });

    it('스케줄을 삭제할 수 있어야 한다', async () => {
      // When: 스케줄 삭제
      const result = await scheduleManager.deleteSchedule({
        scheduleId: scheduleToModify,
        reason: '직원 요청'
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('deletedAt');
    });

    it('스케줄 변경 이력을 조회할 수 있어야 한다', async () => {
      // Given: 스케줄 수정
      await scheduleManager.updateSchedule({
        scheduleId: scheduleToModify,
        startTime: '10:00',
        endTime: '19:00'
      });

      // When: 변경 이력 조회
      const result = await scheduleManager.getScheduleHistory({
        scheduleId: scheduleToModify
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.history).to.be.an('array');
      expect(result.history).to.have.length.greaterThan(0);
    });
  });

  describe('근무 패턴 관리', () => {
    it('근무 패턴을 생성할 수 있어야 한다', async () => {
      // Given: 근무 패턴 데이터
      const patternData = {
        businessId: testBusinessId,
        name: '주간 근무',
        pattern: {
          monday: { startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          tuesday: { startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          wednesday: { startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          thursday: { startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          friday: { startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          saturday: null,
          sunday: null
        }
      };

      // When: 패턴 생성
      const result = await scheduleManager.createPattern(patternData);

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('patternId');
      expect(result.pattern.name).to.equal('주간 근무');
    });

    it('패턴을 사용하여 스케줄을 생성할 수 있어야 한다', async () => {
      // Given: 패턴 생성
      const pattern = await scheduleManager.createPattern({
        businessId: testBusinessId,
        name: '오전 근무',
        pattern: {
          monday: { startTime: '06:00', endTime: '14:00' },
          tuesday: { startTime: '06:00', endTime: '14:00' },
          wednesday: { startTime: '06:00', endTime: '14:00' },
          thursday: { startTime: '06:00', endTime: '14:00' },
          friday: { startTime: '06:00', endTime: '14:00' },
          saturday: null,
          sunday: null
        }
      });

      // When: 패턴을 사용한 스케줄 생성
      const result = await scheduleManager.createScheduleFromPattern({
        patternId: pattern.patternId,
        employeeId: testEmployeeId,
        startDate: '2024-05-01',
        endDate: '2024-05-31'
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.schedules).to.be.an('array');
      expect(result.schedules.length).to.be.greaterThan(0);
    });
  });

  describe('근무 시간 계산', () => {
    it('주간 근무 시간을 계산할 수 있어야 한다', async () => {
      // Given: 주간 스케줄 생성
      await scheduleManager.createWeeklySchedule({
        businessId: testBusinessId,
        startDate: '2024-06-03',
        endDate: '2024-06-07',
        employeeSchedules: [
          {
            employeeId: testEmployeeId,
            shifts: [
              { date: '2024-06-03', startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
              { date: '2024-06-04', startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
              { date: '2024-06-05', startTime: '09:00', endTime: '18:00', breakMinutes: 60 }
            ]
          }
        ]
      });

      // When: 근무 시간 계산
      const result = await scheduleManager.calculateWorkHours({
        employeeId: testEmployeeId,
        startDate: '2024-06-03',
        endDate: '2024-06-07'
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.totalHours).to.equal(24); // 8시간 * 3일
      expect(result.totalDays).to.equal(3);
      expect(result.averageHoursPerDay).to.equal(8);
    });

    it('초과 근무 시간을 계산할 수 있어야 한다', async () => {
      // Given: 초과 근무 포함 스케줄
      await scheduleManager.createWeeklySchedule({
        businessId: testBusinessId,
        startDate: '2024-07-01',
        endDate: '2024-07-01',
        employeeSchedules: [
          {
            employeeId: testEmployeeId,
            shifts: [
              { date: '2024-07-01', startTime: '09:00', endTime: '22:00', breakMinutes: 60 } // 12시간 근무
            ]
          }
        ]
      });

      // When: 초과 근무 계산
      const result = await scheduleManager.calculateOvertimeHours({
        employeeId: testEmployeeId,
        date: '2024-07-01',
        standardHours: 8
      });

      // Then: 결과 검증
      expect(result).to.have.property('success', true);
      expect(result.regularHours).to.equal(8);
      expect(result.overtimeHours).to.equal(4); // 12시간 - 8시간
    });
  });
});