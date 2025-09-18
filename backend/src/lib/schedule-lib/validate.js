/**
 * T155: 스케줄 유효성 검증
 * 시간 충돌 및 논리적 오류 검증
 */

/**
 * 스케줄 유효성 검증
 * @param {Object} schedule - 검증할 스케줄 객체
 * @returns {Promise<Object>} 검증 결과 {valid: boolean, errors: string[]}
 */
async function validateSchedule(schedule) {
  const errors = [];

  // 필수 필드 검증
  if (!schedule.userId) {
    errors.push('사용자 ID가 필요합니다');
  }

  if (!schedule.date) {
    errors.push('날짜가 필요합니다');
  }

  if (!schedule.startTime) {
    errors.push('시작 시간이 필요합니다');
  }

  if (!schedule.endTime) {
    errors.push('종료 시간이 필요합니다');
  }

  // 날짜 형식 검증 (YYYY-MM-DD)
  if (schedule.date) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(schedule.date)) {
      errors.push('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)');
    }
  }

  // 시간 형식 검증 (HH:mm)
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (schedule.startTime && !timePattern.test(schedule.startTime)) {
    errors.push('시작 시간 형식이 올바르지 않습니다 (HH:mm)');
  }

  if (schedule.endTime && !timePattern.test(schedule.endTime)) {
    errors.push('종료 시간 형식이 올바르지 않습니다 (HH:mm)');
  }

  // 시작 시간과 종료 시간 비교
  if (schedule.startTime && schedule.endTime) {
    const start = timeToMinutes(schedule.startTime);
    const end = timeToMinutes(schedule.endTime);

    if (start >= end) {
      errors.push('종료 시간은 시작 시간보다 늦어야 합니다');
    }

    // 최대 근무 시간 체크 (12시간)
    if (end - start > 720) {
      errors.push('연속 근무 시간은 12시간을 초과할 수 없습니다');
    }

    // 최소 근무 시간 체크 (30분)
    if (end - start < 30) {
      errors.push('최소 근무 시간은 30분입니다');
    }
  }

  // 스케줄 타입 검증
  const validTypes = ['shift', 'break', 'leave', 'overtime', 'meeting', 'training'];
  if (schedule.type && !validTypes.includes(schedule.type)) {
    errors.push(`유효하지 않은 스케줄 타입입니다. 허용: ${validTypes.join(', ')}`);
  }

  // 반복 설정 검증
  if (schedule.recurring) {
    const validRecurring = ['daily', 'weekly', 'monthly'];
    if (!validRecurring.includes(schedule.recurring)) {
      errors.push(`유효하지 않은 반복 설정입니다. 허용: ${validRecurring.join(', ')}`);
    }

    if (!schedule.recurringEnd) {
      errors.push('반복 일정은 종료일이 필요합니다');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 시간을 분 단위로 변환
 * @param {string} time - HH:mm 형식의 시간
 * @returns {number} 분 단위 시간
 */
function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 분 단위를 시간 형식으로 변환
 * @param {number} minutes - 분 단위 시간
 * @returns {string} HH:mm 형식의 시간
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

module.exports = {
  validateSchedule,
  timeToMinutes,
  minutesToTime
};