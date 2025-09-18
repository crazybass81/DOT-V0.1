/**
 * 반복 일정 관리
 */

const moment = require('moment-timezone');

/**
 * 반복 스케줄 생성
 * @param {Object} baseSchedule - 기본 스케줄
 * @param {Object} recurringOptions - 반복 옵션
 * @returns {Promise<Array>} 생성된 스케줄 목록
 */
async function createRecurringSchedule(baseSchedule, recurringOptions) {
  const schedules = [];
  const { recurring, recurringEnd, weekdays, monthday } = recurringOptions;

  if (!recurring || !recurringEnd) {
    throw new Error('반복 타입과 종료일이 필요합니다');
  }

  const startDate = moment(baseSchedule.date);
  const endDate = moment(recurringEnd);

  if (endDate.isBefore(startDate)) {
    throw new Error('종료일은 시작일보다 늦어야 합니다');
  }

  let currentDate = startDate.clone();

  while (currentDate.isSameOrBefore(endDate)) {
    let shouldCreate = false;

    switch (recurring) {
      case 'daily':
        shouldCreate = true;
        break;

      case 'weekly':
        // 특정 요일만 (weekdays 배열: [1,2,3,4,5] = 월-금)
        if (weekdays && weekdays.includes(currentDate.isoWeekday())) {
          shouldCreate = true;
        }
        break;

      case 'monthly':
        // 매월 특정일 (monthday: 15 = 매월 15일)
        if (monthday && currentDate.date() === monthday) {
          shouldCreate = true;
        }
        break;
    }

    if (shouldCreate) {
      schedules.push({
        ...baseSchedule,
        date: currentDate.format('YYYY-MM-DD'),
        recurringId: `${baseSchedule.userId}-${startDate.format('YYYYMMDD')}`
      });
    }

    // 다음 날짜로 이동
    currentDate.add(1, 'day');
  }

  return schedules;
}

/**
 * 반복 일정 확장 (특정 기간의 일정 생성)
 * @param {Object} recurringSchedule - 반복 스케줄 정보
 * @param {string} startDate - 시작일
 * @param {string} endDate - 종료일
 * @returns {Array} 확장된 스케줄 목록
 */
function expandRecurringSchedule(recurringSchedule, startDate, endDate) {
  const expanded = [];
  const start = moment(startDate);
  const end = moment(endDate);

  // 반복 규칙에 따라 날짜 생성
  let current = start.clone();

  while (current.isSameOrBefore(end)) {
    if (shouldOccurOnDate(recurringSchedule, current)) {
      expanded.push({
        ...recurringSchedule,
        date: current.format('YYYY-MM-DD'),
        isRecurring: true
      });
    }
    current.add(1, 'day');
  }

  return expanded;
}

/**
 * 특정 날짜에 반복 일정이 발생하는지 확인
 * @param {Object} schedule - 반복 스케줄
 * @param {moment} date - 확인할 날짜
 * @returns {boolean} 발생 여부
 */
function shouldOccurOnDate(schedule, date) {
  if (!schedule.recurring) return false;

  switch (schedule.recurring) {
    case 'daily':
      return true;

    case 'weekly':
      return schedule.weekdays && schedule.weekdays.includes(date.isoWeekday());

    case 'monthly':
      return schedule.monthday === date.date();

    default:
      return false;
  }
}

/**
 * 다음 발생 날짜 계산
 * @param {Object} recurringSchedule - 반복 스케줄
 * @param {string} afterDate - 기준 날짜
 * @returns {string|null} 다음 발생 날짜
 */
function getNextOccurrence(recurringSchedule, afterDate = null) {
  const after = afterDate ? moment(afterDate) : moment();
  const maxDays = 365; // 최대 1년까지만 검색

  for (let i = 1; i <= maxDays; i++) {
    const checkDate = after.clone().add(i, 'days');

    if (shouldOccurOnDate(recurringSchedule, checkDate)) {
      return checkDate.format('YYYY-MM-DD');
    }
  }

  return null;
}

module.exports = {
  createRecurringSchedule,
  expandRecurringSchedule,
  getNextOccurrence
};