/**
 * T144-T145: Schedule Library 진입점
 * 스케줄 관리를 위한 통합 인터페이스 제공
 */

const ScheduleCore = require('./schedule');
const PatternManager = require('./patterns');
const ScheduleValidator = require('./validator');
const ScheduleCalculator = require('./calculator');

class ScheduleManager {
  constructor(pool) {
    if (!pool) {
      throw new Error('Database pool is required');
    }

    this.pool = pool;
    this.core = new ScheduleCore(pool);
    this.patterns = new PatternManager(pool);
    this.validator = new ScheduleValidator(pool);
    this.calculator = new ScheduleCalculator(pool);
  }

  /**
   * 주간 스케줄 생성
   */
  async createWeeklySchedule(scheduleData) {
    return this.core.createWeeklySchedule(scheduleData);
  }

  /**
   * 월간 스케줄 생성
   */
  async createMonthlySchedule(scheduleData) {
    return this.core.createMonthlySchedule(scheduleData);
  }

  /**
   * 날짜별 스케줄 조회
   */
  async getScheduleByDate(params) {
    return this.core.getScheduleByDate(params);
  }

  /**
   * 주간 스케줄 조회
   */
  async getWeeklySchedule(params) {
    return this.core.getWeeklySchedule(params);
  }

  /**
   * 직원별 스케줄 조회
   */
  async getEmployeeSchedule(params) {
    return this.core.getEmployeeSchedule(params);
  }

  /**
   * 스케줄 수정
   */
  async updateSchedule(params) {
    return this.core.updateSchedule(params);
  }

  /**
   * 스케줄 삭제
   */
  async deleteSchedule(params) {
    return this.core.deleteSchedule(params);
  }

  /**
   * 스케줄 변경 이력 조회
   */
  async getScheduleHistory(params) {
    return this.core.getScheduleHistory(params);
  }

  /**
   * 근무 패턴 생성
   */
  async createPattern(patternData) {
    return this.patterns.createPattern(patternData);
  }

  /**
   * 패턴을 사용한 스케줄 생성
   */
  async createScheduleFromPattern(params) {
    return this.patterns.createScheduleFromPattern(params);
  }

  /**
   * 근무 시간 계산
   */
  async calculateWorkHours(params) {
    return this.calculator.calculateWorkHours(params);
  }

  /**
   * 초과 근무 시간 계산
   */
  async calculateOvertimeHours(params) {
    return this.calculator.calculateOvertimeHours(params);
  }

  /**
   * 스케줄 유효성 검증
   */
  async validateSchedule(scheduleData) {
    return this.validator.validateSchedule(scheduleData);
  }

  /**
   * 스케줄 충돌 체크
   */
  async checkConflicts(params) {
    return this.validator.checkConflicts(params);
  }
}

module.exports = ScheduleManager;