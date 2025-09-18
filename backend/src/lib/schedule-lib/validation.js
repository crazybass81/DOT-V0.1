/**
 * T265: 스케줄 유효성 검증 모듈
 * 시간, 휴식, 근무 시간 제한 검증
 */

const moment = require('moment-timezone');

/**
 * 스케줄 유효성 검증
 * @param {Object} schedule - 검증할 스케줄
 * @returns {Object} 검증 결과
 */
function validateSchedule(schedule) {
  const errors = [];

  // 필수 필드 검증
  if (!schedule.business_id) {
    errors.push({
      field: 'business_id',
      message: '사업장 ID가 필요합니다.'
    });
  }

  if (!schedule.start_time) {
    errors.push({
      field: 'start_time',
      message: '시작 시간이 필요합니다.'
    });
  }

  if (!schedule.end_time) {
    errors.push({
      field: 'end_time',
      message: '종료 시간이 필요합니다.'
    });
  }

  // 시간 범위 검증
  if (schedule.start_time && schedule.end_time) {
    const timeValidation = validateTimeRange(schedule.start_time, schedule.end_time);
    if (!timeValidation.valid) {
      errors.push(...timeValidation.errors);
    }
  }

  // 상태 검증
  const validStatuses = ['draft', 'published', 'confirmed', 'cancelled', 'completed'];
  if (schedule.status && !validStatuses.includes(schedule.status)) {
    errors.push({
      field: 'status',
      message: `유효한 상태가 아닙니다: ${schedule.status}`
    });
  }

  // 필요 인원 검증
  if (schedule.required_workers !== undefined) {
    if (schedule.required_workers < 1) {
      errors.push({
        field: 'required_workers',
        message: '필요 인원은 최소 1명 이상이어야 합니다.'
      });
    }

    if (schedule.required_workers > 100) {
      errors.push({
        field: 'required_workers',
        message: '필요 인원은 100명을 초과할 수 없습니다.'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 시간 범위 유효성 검증
 * @param {Date|string} startTime - 시작 시간
 * @param {Date|string} endTime - 종료 시간
 * @returns {Object} 검증 결과
 */
function validateTimeRange(startTime, endTime) {
  const errors = [];
  const start = moment(startTime);
  const end = moment(endTime);

  // 유효한 날짜인지 확인
  if (!start.isValid()) {
    errors.push({
      field: 'start_time',
      message: '유효하지 않은 시작 시간입니다.'
    });
  }

  if (!end.isValid()) {
    errors.push({
      field: 'end_time',
      message: '유효하지 않은 종료 시간입니다.'
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 시작 시간이 종료 시간보다 빠른지 확인
  if (start.isSameOrAfter(end)) {
    errors.push({
      field: 'time_range',
      message: '시작 시간은 종료 시간보다 빨라야 합니다.'
    });
  }

  // 근무 시간 검증 (3시간 ~ 12시간)
  const duration = end.diff(start, 'hours', true);

  if (duration < 3) {
    errors.push({
      field: 'duration',
      message: `근무 시간은 최소 3시간 이상이어야 합니다. (현재: ${duration.toFixed(1)}시간)`
    });
  }

  if (duration > 12) {
    errors.push({
      field: 'duration',
      message: `근무 시간은 최대 12시간을 초과할 수 없습니다. (현재: ${duration.toFixed(1)}시간)`
    });
  }

  // 미래 3개월 제한
  const threeMonthsLater = moment().add(3, 'months');
  if (start.isAfter(threeMonthsLater)) {
    errors.push({
      field: 'start_time',
      message: '스케줄은 3개월 이내로만 생성 가능합니다.'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    duration
  };
}

/**
 * 최소 휴식 시간 검증 (11시간)
 * @param {Array} schedules - 직원의 스케줄 목록
 * @returns {Object} 검증 결과
 */
function validateMinimumRest(schedules) {
  const violations = [];

  // 시간순으로 정렬
  const sortedSchedules = [...schedules].sort((a, b) =>
    new Date(a.end_time) - new Date(b.end_time)
  );

  for (let i = 0; i < sortedSchedules.length - 1; i++) {
    const current = sortedSchedules[i];
    const next = sortedSchedules[i + 1];

    const restHours = moment(next.start_time).diff(moment(current.end_time), 'hours', true);

    if (restHours < 11) {
      violations.push({
        schedule1_id: current.id,
        schedule2_id: next.id,
        rest_hours: restHours,
        message: `휴식 시간 ${restHours.toFixed(1)}시간 (최소 11시간 필요)`,
        period: {
          from: current.end_time,
          to: next.start_time
        }
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * 최대 근무 시간 검증
 * @param {Array} schedules - 직원의 스케줄 목록
 * @param {Date} startDate - 검증 시작일
 * @param {Date} endDate - 검증 종료일
 * @returns {Object} 검증 결과
 */
function validateMaxHours(schedules, startDate, endDate) {
  const violations = [];

  // 주별 근무 시간 계산
  const weeklyHours = new Map();
  const dailyHours = new Map();

  for (const schedule of schedules) {
    const schedStart = moment(schedule.start_time);
    const schedEnd = moment(schedule.end_time);
    const duration = schedEnd.diff(schedStart, 'hours', true);

    // 주간 시간 계산
    const weekKey = schedStart.format('YYYY-[W]WW');
    const currentWeekHours = weeklyHours.get(weekKey) || 0;
    weeklyHours.set(weekKey, currentWeekHours + duration);

    // 일일 시간 계산
    const dayKey = schedStart.format('YYYY-MM-DD');
    const currentDayHours = dailyHours.get(dayKey) || 0;
    dailyHours.set(dayKey, currentDayHours + duration);
  }

  // 주 52시간 초과 검사
  for (const [week, hours] of weeklyHours.entries()) {
    if (hours > 52) {
      violations.push({
        type: 'WEEKLY_LIMIT',
        week,
        hours,
        limit: 52,
        message: `${week}: 주간 ${hours.toFixed(1)}시간 (최대 52시간)`
      });
    }
  }

  // 일 12시간 초과 검사
  for (const [day, hours] of dailyHours.entries()) {
    if (hours > 12) {
      violations.push({
        type: 'DAILY_LIMIT',
        date: day,
        hours,
        limit: 12,
        message: `${day}: 일일 ${hours.toFixed(1)}시간 (최대 12시간)`
      });
    }
  }

  // 연속 근무 일수 검사 (6일)
  const consecutiveDays = checkConsecutiveDays(schedules);
  if (consecutiveDays.maxDays > 6) {
    violations.push({
      type: 'CONSECUTIVE_DAYS',
      days: consecutiveDays.maxDays,
      limit: 6,
      period: consecutiveDays.period,
      message: `연속 ${consecutiveDays.maxDays}일 근무 (최대 6일)`
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    summary: {
      maxWeeklyHours: Math.max(...weeklyHours.values()),
      maxDailyHours: Math.max(...dailyHours.values()),
      consecutiveDays: consecutiveDays.maxDays
    }
  };
}

/**
 * 사업장 운영 시간 검증
 * @param {Object} schedule - 스케줄
 * @param {Object} businessHours - 사업장 운영 시간
 * @returns {Object} 검증 결과
 */
function validateBusinessHours(schedule, businessHours) {
  const errors = [];

  if (!businessHours) {
    return { valid: true, errors };
  }

  const schedStart = moment(schedule.start_time);
  const schedEnd = moment(schedule.end_time);
  const dayOfWeek = schedStart.format('dddd').toLowerCase();

  // 해당 요일의 영업 시간 확인
  const dayHours = businessHours[dayOfWeek];

  if (!dayHours) {
    errors.push({
      field: 'day',
      message: `${dayOfWeek}은 영업일이 아닙니다.`
    });
    return { valid: false, errors };
  }

  if (dayHours.closed) {
    errors.push({
      field: 'day',
      message: `${dayOfWeek}은 휴무일입니다.`
    });
    return { valid: false, errors };
  }

  // 영업 시간 범위 확인
  const bizOpen = moment(schedStart).set({
    hour: parseInt(dayHours.open.split(':')[0]),
    minute: parseInt(dayHours.open.split(':')[1])
  });

  const bizClose = moment(schedStart).set({
    hour: parseInt(dayHours.close.split(':')[0]),
    minute: parseInt(dayHours.close.split(':')[1])
  });

  // 마감 시간이 다음날로 넘어가는 경우 처리
  if (bizClose.isBefore(bizOpen)) {
    bizClose.add(1, 'day');
  }

  // 스케줄 시간이 영업 시간 내에 있는지 확인
  if (schedStart.isBefore(bizOpen)) {
    errors.push({
      field: 'start_time',
      message: `시작 시간(${schedStart.format('HH:mm')})이 영업 시작 시간(${dayHours.open})보다 빠릅니다.`
    });
  }

  // 종료 시간이 다음날로 넘어가는 경우 처리
  let adjustedEnd = schedEnd;
  if (schedEnd.isBefore(schedStart)) {
    adjustedEnd = schedEnd.clone().add(1, 'day');
  }

  if (adjustedEnd.isAfter(bizClose)) {
    errors.push({
      field: 'end_time',
      message: `종료 시간(${schedEnd.format('HH:mm')})이 영업 종료 시간(${dayHours.close})보다 늦습니다.`
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 연속 근무 일수 확인 (헬퍼 함수)
 */
function checkConsecutiveDays(schedules) {
  if (schedules.length === 0) {
    return { maxDays: 0, period: null };
  }

  // 날짜별로 그룹화
  const workDays = new Set();
  schedules.forEach(schedule => {
    const date = moment(schedule.start_time).format('YYYY-MM-DD');
    workDays.add(date);
  });

  // 날짜 정렬
  const sortedDays = Array.from(workDays).sort();

  let maxConsecutive = 1;
  let currentConsecutive = 1;
  let maxPeriod = { start: sortedDays[0], end: sortedDays[0] };
  let currentStart = sortedDays[0];

  for (let i = 1; i < sortedDays.length; i++) {
    const prevDay = moment(sortedDays[i - 1]);
    const currentDay = moment(sortedDays[i]);

    if (currentDay.diff(prevDay, 'days') === 1) {
      currentConsecutive++;
    } else {
      if (currentConsecutive > maxConsecutive) {
        maxConsecutive = currentConsecutive;
        maxPeriod = {
          start: currentStart,
          end: sortedDays[i - 1]
        };
      }
      currentConsecutive = 1;
      currentStart = sortedDays[i];
    }
  }

  // 마지막 연속 기간 확인
  if (currentConsecutive > maxConsecutive) {
    maxConsecutive = currentConsecutive;
    maxPeriod = {
      start: currentStart,
      end: sortedDays[sortedDays.length - 1]
    };
  }

  return {
    maxDays: maxConsecutive,
    period: maxPeriod
  };
}

module.exports = {
  validateSchedule,
  validateTimeRange,
  validateMinimumRest,
  validateMaxHours,
  validateBusinessHours,
  checkConsecutiveDays
};