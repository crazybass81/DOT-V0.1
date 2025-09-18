/**
 * T262: 스케줄 충돌 검사 모듈
 * 시간 겹침, 연속 근무, 휴식 시간 충돌 검사
 */

const moment = require('moment-timezone');

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
 * 두 시간 범위가 겹치는지 확인
 * @param {Date} start1 - 첫 번째 시작 시간
 * @param {Date} end1 - 첫 번째 종료 시간
 * @param {Date} start2 - 두 번째 시작 시간
 * @param {Date} end2 - 두 번째 종료 시간
 * @returns {boolean} 겹침 여부
 */
function isOverlapping(start1, end1, start2, end2) {
  // 시작 시간이 종료 시간보다 늦으면 false
  if (start1 >= end1 || start2 >= end2) {
    return false;
  }

  // 겹침 확인: start1 < end2 && start2 < end1
  return start1 < end2 && start2 < end1;
}

/**
 * 단일 스케줄 충돌 검사
 * @param {Object} newSchedule - 검사할 새 스케줄
 * @param {Array} existingSchedules - 기존 스케줄 목록
 * @returns {Object} { hasConflict: boolean, conflicts: Array }
 */
function checkConflict(newSchedule, existingSchedules) {
  const conflicts = [];

  // 날짜 처리를 위한 변환
  let newStart, newEnd;

  // 레거시 형식 지원 (date + startTime/endTime)
  if (newSchedule.date && newSchedule.startTime && newSchedule.endTime) {
    const date = moment(newSchedule.date).format('YYYY-MM-DD');
    newStart = moment(`${date} ${newSchedule.startTime}`).toDate();
    newEnd = moment(`${date} ${newSchedule.endTime}`).toDate();
  } else {
    // 새 형식 (start_time, end_time)
    newStart = new Date(newSchedule.start_time);
    newEnd = new Date(newSchedule.end_time);
  }

  const userId = newSchedule.user_id || newSchedule.userId;

  for (const existing of existingSchedules) {
    // 같은 사용자의 스케줄만 검사
    const existingUserId = existing.user_id || existing.userId;
    if (existingUserId !== userId) {
      continue;
    }

    // 취소된 스케줄은 제외
    if (existing.status === 'cancelled') {
      continue;
    }

    let existingStart, existingEnd;

    // 레거시 형식 지원
    if (existing.date && existing.startTime && existing.endTime) {
      const date = moment(existing.date).format('YYYY-MM-DD');
      existingStart = moment(`${date} ${existing.startTime}`).toDate();
      existingEnd = moment(`${date} ${existing.endTime}`).toDate();
    } else {
      existingStart = new Date(existing.start_time);
      existingEnd = new Date(existing.end_time);
    }

    // 시간 겹침 검사
    if (isOverlapping(newStart, newEnd, existingStart, existingEnd)) {
      conflicts.push({
        type: 'TIME_OVERLAP',
        schedule_id: existing.id,
        message: `${moment(existingStart).format('YYYY-MM-DD HH:mm')}~${moment(existingEnd).format('HH:mm')} 스케줄과 겹침`
      });
    }

    // 최소 휴식 시간 검사 (11시간)
    const restBetween = Math.abs(newStart - existingEnd) / (1000 * 60 * 60);
    const restBefore = Math.abs(existingStart - newEnd) / (1000 * 60 * 60);

    if (restBetween < 11 && restBetween > 0) {
      conflicts.push({
        type: 'INSUFFICIENT_REST',
        schedule_id: existing.id,
        message: `이전 근무 종료 후 ${restBetween.toFixed(1)}시간만 휴식 (최소 11시간 필요)`
      });
    }

    if (restBefore < 11 && restBefore > 0) {
      conflicts.push({
        type: 'INSUFFICIENT_REST',
        schedule_id: existing.id,
        message: `다음 근무 시작 전 ${restBefore.toFixed(1)}시간만 휴식 (최소 11시간 필요)`
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts: conflicts
  };
}

/**
 * 여러 스케줄 충돌 검사
 * @param {Array} schedules - 검사할 스케줄 목록
 * @param {Array} existingSchedules - 기존 스케줄 목록
 * @returns {Map} 스케줄별 충돌 정보
 */
function checkMultipleConflicts(schedules, existingSchedules) {
  const results = new Map();

  // 새 스케줄끼리도 충돌 검사
  const allSchedules = [...existingSchedules];

  for (const schedule of schedules) {
    const conflictResult = checkConflict(schedule, allSchedules);
    results.set(schedule.id || schedule.temp_id, conflictResult);

    // 충돌이 없으면 검사 대상에 추가
    if (!conflictResult.hasConflict) {
      allSchedules.push(schedule);
    }
  }

  return results;
}

/**
 * 특정 시간대에 근무 가능한 직원 찾기
 * @param {Date} startTime - 시작 시간
 * @param {Date} endTime - 종료 시간
 * @param {Array} workers - 직원 목록
 * @param {Array} schedules - 전체 스케줄 목록
 * @returns {Array} 근무 가능한 직원 목록
 */
function findAvailableWorkers(startTime, endTime, workers, schedules) {
  const available = [];

  for (const worker of workers) {
    // 해당 직원의 스케줄만 필터링
    const workerSchedules = schedules.filter(s =>
      (s.user_id === worker.id || s.userId === worker.id) &&
      s.status !== 'cancelled'
    );

    // 충돌 검사
    const testSchedule = {
      user_id: worker.id,
      start_time: startTime,
      end_time: endTime
    };

    const conflict = checkConflict(testSchedule, workerSchedules);

    if (!conflict.hasConflict) {
      // 주당 근무 시간 확인
      const weekStart = moment(startTime).startOf('week');
      const weekEnd = moment(startTime).endOf('week');

      let weeklyHours = 0;
      let dailyHours = 0;
      const today = moment(startTime).format('YYYY-MM-DD');

      for (const schedule of workerSchedules) {
        const schedStart = moment(schedule.start_time || `${schedule.date} ${schedule.startTime}`);
        const schedEnd = moment(schedule.end_time || `${schedule.date} ${schedule.endTime}`);

        // 주간 시간 계산
        if (schedStart.isBetween(weekStart, weekEnd)) {
          weeklyHours += schedEnd.diff(schedStart, 'hours', true);
        }

        // 일일 시간 계산
        if (schedStart.format('YYYY-MM-DD') === today) {
          dailyHours += schedEnd.diff(schedStart, 'hours', true);
        }
      }

      const newHours = moment(endTime).diff(moment(startTime), 'hours', true);

      // 주 52시간, 일 12시간 제한
      if (weeklyHours + newHours <= 52 && dailyHours + newHours <= 12) {
        available.push({
          ...worker,
          currentWeeklyHours: weeklyHours,
          currentDailyHours: dailyHours,
          availableHours: Math.min(52 - weeklyHours, 12 - dailyHours)
        });
      }
    }
  }

  // 가용 시간이 많은 순으로 정렬
  return available.sort((a, b) => b.availableHours - a.availableHours);
}

/**
 * 충돌하는 스케줄 목록 조회
 * @param {Object} schedule - 검사할 스케줄
 * @param {Array} allSchedules - 전체 스케줄 목록
 * @returns {Array} 충돌하는 스케줄 목록
 */
function getConflictingSchedules(schedule, allSchedules) {
  const result = checkConflict(schedule, allSchedules);

  if (!result.hasConflict) {
    return [];
  }

  const conflictIds = result.conflicts.map(c => c.schedule_id);
  return allSchedules.filter(s => conflictIds.includes(s.id));
}

/**
 * 레거시 API 호환 함수들
 */
async function findConflicts(options, schedules = []) {
  const conflicts = [];
  const userSchedules = {};

  schedules.forEach(schedule => {
    const userId = schedule.userId || schedule.user_id;
    if (!userSchedules[userId]) {
      userSchedules[userId] = [];
    }
    userSchedules[userId].push(schedule);
  });

  for (const userId in userSchedules) {
    const userScheduleList = userSchedules[userId];

    for (let i = 0; i < userScheduleList.length; i++) {
      for (let j = i + 1; j < userScheduleList.length; j++) {
        const result = checkConflict(userScheduleList[i], [userScheduleList[j]]);
        if (result.hasConflict) {
          conflicts.push({
            userId: parseInt(userId),
            schedule1: userScheduleList[i],
            schedule2: userScheduleList[j],
            details: result.conflicts[0].message
          });
        }
      }
    }
  }

  return conflicts;
}

function findConflictsForSchedule(newSchedule, existingSchedules) {
  const result = checkConflict(newSchedule, existingSchedules);

  if (!result.hasConflict) {
    return [];
  }

  return result.conflicts.map(conflict => ({
    conflictWith: existingSchedules.find(s => s.id === conflict.schedule_id),
    reason: conflict.message
  }));
}

module.exports = {
  timeToMinutes,
  isOverlapping,
  checkConflict,
  checkMultipleConflicts,
  findAvailableWorkers,
  getConflictingSchedules,
  // 레거시 호환
  findConflicts,
  findConflictsForSchedule
};