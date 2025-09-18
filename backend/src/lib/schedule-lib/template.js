/**
 * T263: 스케줄 템플릿 관리 모듈
 * 반복 스케줄 생성, 템플릿 적용
 */

const moment = require('moment-timezone');

/**
 * 스케줄 템플릿 생성
 * @param {Object} templateData - 템플릿 데이터
 * @returns {Object} 생성된 템플릿
 */
function createTemplate(templateData) {
  const {
    name,
    business_id,
    schedule_type = 'regular',
    shifts = [],
    repeat_pattern = 'weekly', // daily, weekly, monthly
    active_days = [1, 2, 3, 4, 5], // 월-금
    description = ''
  } = templateData;

  // 유효성 검증
  if (!name || !business_id) {
    throw new Error('템플릿 이름과 사업장 ID가 필요합니다.');
  }

  if (shifts.length === 0) {
    throw new Error('최소 하나 이상의 근무 시프트가 필요합니다.');
  }

  // 시프트 유효성 검증
  for (const shift of shifts) {
    if (!shift.start_time || !shift.end_time) {
      throw new Error('모든 시프트에 시작/종료 시간이 필요합니다.');
    }

    if (!shift.required_workers || shift.required_workers < 1) {
      throw new Error('최소 필요 인원은 1명 이상이어야 합니다.');
    }
  }

  return {
    id: `template_${Date.now()}`,
    name,
    business_id,
    schedule_type,
    shifts: shifts.map(shift => ({
      ...shift,
      id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })),
    repeat_pattern,
    active_days,
    description,
    created_at: new Date(),
    updated_at: new Date()
  };
}

/**
 * 템플릿을 특정 기간에 적용
 * @param {Object} template - 적용할 템플릿
 * @param {Date} startDate - 시작 날짜
 * @param {Date} endDate - 종료 날짜
 * @returns {Array} 생성된 스케줄 목록
 */
function applyTemplate(template, startDate, endDate) {
  const schedules = [];
  const start = moment(startDate).tz('Asia/Seoul');
  const end = moment(endDate).tz('Asia/Seoul');

  // 최대 90일 제한
  if (end.diff(start, 'days') > 90) {
    throw new Error('템플릿 적용은 최대 90일까지 가능합니다.');
  }

  let currentDate = start.clone();

  while (currentDate.isSameOrBefore(end)) {
    const dayOfWeek = currentDate.day(); // 0 = 일요일, 1 = 월요일

    // 활성 요일인지 확인
    if (template.active_days.includes(dayOfWeek)) {
      // 각 시프트에 대해 스케줄 생성
      for (const shift of template.shifts) {
        const [startHour, startMin] = shift.start_time.split(':').map(Number);
        const [endHour, endMin] = shift.end_time.split(':').map(Number);

        const scheduleStart = currentDate.clone()
          .set({ hour: startHour, minute: startMin, second: 0 });
        const scheduleEnd = currentDate.clone()
          .set({ hour: endHour, minute: endMin, second: 0 });

        // 종료 시간이 다음날로 넘어가는 경우 처리
        if (scheduleEnd.isBefore(scheduleStart)) {
          scheduleEnd.add(1, 'day');
        }

        schedules.push({
          template_id: template.id,
          business_id: template.business_id,
          schedule_type: template.schedule_type,
          start_time: scheduleStart.toDate(),
          end_time: scheduleEnd.toDate(),
          required_workers: shift.required_workers,
          shift_name: shift.name || `시프트 ${shift.id}`,
          shift_id: shift.id,
          status: 'draft',
          created_from_template: true
        });
      }
    }

    // 반복 패턴에 따라 다음 날짜로 이동
    switch (template.repeat_pattern) {
      case 'daily':
        currentDate.add(1, 'day');
        break;
      case 'weekly':
        currentDate.add(1, 'day');
        break;
      case 'monthly':
        // 매달 같은 날짜로 이동
        if (currentDate.date() === start.date()) {
          currentDate.add(1, 'month');
        } else {
          currentDate.add(1, 'day');
        }
        break;
      default:
        currentDate.add(1, 'day');
    }
  }

  return schedules;
}

/**
 * 주간 스케줄 생성
 * @param {Object} template - 템플릿
 * @param {Date} weekStart - 주 시작일
 * @returns {Array} 주간 스케줄
 */
function generateWeeklySchedule(template, weekStart) {
  const start = moment(weekStart).startOf('week');
  const end = start.clone().endOf('week');

  return applyTemplate(template, start.toDate(), end.toDate());
}

/**
 * 템플릿 복제
 * @param {Object} template - 복제할 템플릿
 * @param {string} newName - 새 템플릿 이름
 * @returns {Object} 복제된 템플릿
 */
function cloneTemplate(template, newName) {
  return {
    ...template,
    id: `template_${Date.now()}`,
    name: newName || `${template.name} (복사본)`,
    shifts: template.shifts.map(shift => ({
      ...shift,
      id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })),
    created_at: new Date(),
    updated_at: new Date()
  };
}

/**
 * 템플릿 패턴 분석
 * @param {Object} template - 분석할 템플릿
 * @returns {Object} 패턴 분석 결과
 */
function getTemplatePatterns(template) {
  const patterns = {
    totalShifts: template.shifts.length,
    weeklyShifts: 0,
    totalRequiredWorkers: 0,
    shiftDetails: [],
    estimatedWeeklyHours: 0
  };

  // 주간 시프트 수 계산
  patterns.weeklyShifts = template.shifts.length * template.active_days.length;

  // 시프트별 상세 정보
  for (const shift of template.shifts) {
    const [startHour, startMin] = shift.start_time.split(':').map(Number);
    const [endHour, endMin] = shift.end_time.split(':').map(Number);

    let duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    if (duration < 0) {
      duration += 24 * 60; // 다음날 종료
    }

    const hoursPerShift = duration / 60;

    patterns.shiftDetails.push({
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      duration_hours: hoursPerShift,
      required_workers: shift.required_workers,
      weekly_occurrences: template.active_days.length
    });

    patterns.totalRequiredWorkers += shift.required_workers;
    patterns.estimatedWeeklyHours += hoursPerShift * template.active_days.length * shift.required_workers;
  }

  // 요일별 패턴
  patterns.dayPattern = {
    sunday: template.active_days.includes(0),
    monday: template.active_days.includes(1),
    tuesday: template.active_days.includes(2),
    wednesday: template.active_days.includes(3),
    thursday: template.active_days.includes(4),
    friday: template.active_days.includes(5),
    saturday: template.active_days.includes(6)
  };

  return patterns;
}

module.exports = {
  createTemplate,
  applyTemplate,
  generateWeeklySchedule,
  cloneTemplate,
  getTemplatePatterns
};