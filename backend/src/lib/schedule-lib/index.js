/**
 * T261: Schedule Library 메인 모듈
 * 스케줄 관리 핵심 기능 통합 제공
 */

const conflict = require('./conflict');
const template = require('./template');
const assignment = require('./assignment');
const validation = require('./validation');

/**
 * 스케줄 라이브러리 메인 export
 * 모든 스케줄 관련 기능을 통합 제공
 */
module.exports = {
  // 충돌 검사
  checkConflict: conflict.checkConflict,
  checkMultipleConflicts: conflict.checkMultipleConflicts,
  findAvailableWorkers: conflict.findAvailableWorkers,
  getConflictingSchedules: conflict.getConflictingSchedules,

  // 템플릿 관리
  createTemplate: template.createTemplate,
  applyTemplate: template.applyTemplate,
  generateWeeklySchedule: template.generateWeeklySchedule,
  cloneTemplate: template.cloneTemplate,
  getTemplatePatterns: template.getTemplatePatterns,

  // 할당 관리
  assignWorker: assignment.assignWorker,
  removeAssignment: assignment.removeAssignment,
  swapAssignments: assignment.swapAssignments,
  autoAssign: assignment.autoAssign,
  bulkAssign: assignment.bulkAssign,

  // 유효성 검증
  validateSchedule: validation.validateSchedule,
  validateTimeRange: validation.validateTimeRange,
  validateMinimumRest: validation.validateMinimumRest,
  validateMaxHours: validation.validateMaxHours,
  validateBusinessHours: validation.validateBusinessHours,

  // 상수
  CONSTANTS: {
    // 최소 휴식 시간 (시간)
    MINIMUM_REST_HOURS: 11,
    // 주당 최대 근무 시간
    MAX_WEEKLY_HOURS: 52,
    // 일일 최대 근무 시간
    MAX_DAILY_HOURS: 12,
    // 연속 근무 최대 일수
    MAX_CONSECUTIVE_DAYS: 6,
    // 스케줄 생성 최대 기간 (일)
    MAX_SCHEDULE_DAYS: 90,
    // 근무 교대 최소 시간 (시간)
    MIN_SWAP_NOTICE_HOURS: 24,
    // 최소 근무 시간 (시간)
    MIN_SHIFT_HOURS: 3,
    // 최대 근무 시간 (시간)
    MAX_SHIFT_HOURS: 12
  },

  // 에러 코드
  ERRORS: {
    CONFLICT: 'SCHEDULE_CONFLICT',
    INVALID_TIME: 'INVALID_TIME_RANGE',
    INSUFFICIENT_REST: 'INSUFFICIENT_REST',
    EXCEED_MAX_HOURS: 'EXCEED_MAX_HOURS',
    INVALID_TEMPLATE: 'INVALID_TEMPLATE',
    ASSIGNMENT_FAILED: 'ASSIGNMENT_FAILED',
    WORKER_UNAVAILABLE: 'WORKER_UNAVAILABLE',
    SWAP_NOT_ALLOWED: 'SWAP_NOT_ALLOWED',
    INVALID_BUSINESS_HOURS: 'INVALID_BUSINESS_HOURS',
    CONSECUTIVE_DAYS_EXCEEDED: 'CONSECUTIVE_DAYS_EXCEEDED'
  },

  // 스케줄 타입
  SCHEDULE_TYPES: {
    REGULAR: 'regular',      // 정규 근무
    OVERTIME: 'overtime',    // 초과 근무
    HOLIDAY: 'holiday',      // 휴일 근무
    EMERGENCY: 'emergency',  // 긴급 근무
    TRAINING: 'training'     // 교육/훈련
  },

  // 스케줄 상태
  SCHEDULE_STATUS: {
    DRAFT: 'draft',          // 초안
    PUBLISHED: 'published',  // 게시됨
    CONFIRMED: 'confirmed',  // 확정됨
    CANCELLED: 'cancelled',  // 취소됨
    COMPLETED: 'completed'   // 완료됨
  }
};