/**
 * T264: 근무 할당 관리 모듈
 * 직원 할당, 교대, 자동 할당
 */

const conflict = require('./conflict');
const moment = require('moment-timezone');

/**
 * 직원을 스케줄에 할당
 * @param {Object} schedule - 스케줄 정보
 * @param {Object} worker - 할당할 직원
 * @param {Array} existingSchedules - 기존 스케줄 목록
 * @returns {Object} 할당 결과
 */
function assignWorker(schedule, worker, existingSchedules) {
  // 충돌 검사
  const testSchedule = {
    ...schedule,
    user_id: worker.id
  };

  const conflictResult = conflict.checkConflict(testSchedule, existingSchedules);

  if (conflictResult.hasConflict) {
    return {
      success: false,
      error: 'ASSIGNMENT_FAILED',
      message: '할당 실패: 스케줄 충돌',
      conflicts: conflictResult.conflicts
    };
  }

  // 주당 최대 근무 시간 확인 (52시간)
  const weekStart = moment(schedule.start_time).startOf('week');
  const weekEnd = moment(schedule.start_time).endOf('week');

  const weeklyHours = calculateWeeklyHours(
    worker.id,
    existingSchedules,
    weekStart.toDate(),
    weekEnd.toDate()
  );

  const scheduleHours = moment(schedule.end_time).diff(moment(schedule.start_time), 'hours', true);

  if (weeklyHours + scheduleHours > 52) {
    return {
      success: false,
      error: 'EXCEED_MAX_HOURS',
      message: `할당 실패: 주당 최대 근무 시간(52시간) 초과`,
      currentHours: weeklyHours,
      additionalHours: scheduleHours,
      maxHours: 52
    };
  }

  // 할당 성공
  return {
    success: true,
    assignment: {
      schedule_id: schedule.id,
      user_id: worker.id,
      assigned_at: new Date(),
      status: 'assigned',
      worker_name: worker.name,
      worker_role: worker.role_type
    }
  };
}

/**
 * 스케줄에서 직원 할당 제거
 * @param {Object} schedule - 스케줄 정보
 * @param {number} workerId - 제거할 직원 ID
 * @returns {Object} 제거 결과
 */
function removeAssignment(schedule, workerId) {
  // 할당된 직원 확인
  if (!schedule.assignments || !schedule.assignments.find(a => a.user_id === workerId)) {
    return {
      success: false,
      error: 'NOT_ASSIGNED',
      message: '해당 직원이 할당되어 있지 않습니다.'
    };
  }

  // 스케줄 시작 24시간 이내인지 확인
  const hoursUntilStart = moment(schedule.start_time).diff(moment(), 'hours');

  if (hoursUntilStart < 24) {
    return {
      success: false,
      error: 'TOO_LATE_TO_REMOVE',
      message: '근무 시작 24시간 이내에는 할당을 취소할 수 없습니다.',
      hoursUntilStart
    };
  }

  return {
    success: true,
    message: '할당이 제거되었습니다.',
    removedWorkerId: workerId
  };
}

/**
 * 두 직원의 스케줄 교환
 * @param {Object} schedule1 - 첫 번째 스케줄
 * @param {Object} schedule2 - 두 번째 스케줄
 * @param {Array} allSchedules - 전체 스케줄 목록
 * @returns {Object} 교환 결과
 */
function swapAssignments(schedule1, schedule2, allSchedules) {
  // 두 스케줄 모두 할당된 상태인지 확인
  if (!schedule1.user_id || !schedule2.user_id) {
    return {
      success: false,
      error: 'NOT_ASSIGNED',
      message: '두 스케줄 모두 할당된 상태여야 합니다.'
    };
  }

  // 같은 직원인지 확인
  if (schedule1.user_id === schedule2.user_id) {
    return {
      success: false,
      error: 'SAME_WORKER',
      message: '같은 직원의 스케줄은 교환할 수 없습니다.'
    };
  }

  // 스케줄 시작 24시간 이전인지 확인
  const hours1 = moment(schedule1.start_time).diff(moment(), 'hours');
  const hours2 = moment(schedule2.start_time).diff(moment(), 'hours');

  if (hours1 < 24 || hours2 < 24) {
    return {
      success: false,
      error: 'TOO_LATE_TO_SWAP',
      message: '근무 시작 24시간 이전에만 교환이 가능합니다.'
    };
  }

  // 각 직원에 대한 충돌 검사
  const swapped1 = { ...schedule1, user_id: schedule2.user_id };
  const swapped2 = { ...schedule2, user_id: schedule1.user_id };

  const otherSchedules = allSchedules.filter(
    s => s.id !== schedule1.id && s.id !== schedule2.id
  );

  const conflict1 = conflict.checkConflict(swapped1, otherSchedules);
  const conflict2 = conflict.checkConflict(swapped2, otherSchedules);

  if (conflict1.hasConflict || conflict2.hasConflict) {
    return {
      success: false,
      error: 'SWAP_CONFLICT',
      message: '교환 후 스케줄 충돌이 발생합니다.',
      conflicts: [...conflict1.conflicts, ...conflict2.conflicts]
    };
  }

  return {
    success: true,
    message: '스케줄이 교환되었습니다.',
    swapped: [
      { schedule_id: schedule1.id, new_user_id: schedule2.user_id },
      { schedule_id: schedule2.id, new_user_id: schedule1.user_id }
    ]
  };
}

/**
 * 자동 할당 (최적화 알고리즘)
 * @param {Array} schedules - 할당할 스케줄 목록
 * @param {Array} workers - 가용 직원 목록
 * @param {Array} existingSchedules - 기존 스케줄
 * @returns {Object} 자동 할당 결과
 */
function autoAssign(schedules, workers, existingSchedules) {
  const assignments = [];
  const unassigned = [];
  const workingSchedules = [...existingSchedules];

  // 스케줄을 시간순으로 정렬
  const sortedSchedules = [...schedules].sort((a, b) =>
    new Date(a.start_time) - new Date(b.start_time)
  );

  for (const schedule of sortedSchedules) {
    // 가용한 직원 찾기
    const availableWorkers = conflict.findAvailableWorkers(
      schedule.start_time,
      schedule.end_time,
      workers,
      workingSchedules
    );

    if (availableWorkers.length === 0) {
      unassigned.push({
        schedule_id: schedule.id,
        reason: '가용한 직원이 없습니다.'
      });
      continue;
    }

    // 필요 인원수만큼 할당
    const requiredCount = schedule.required_workers || 1;
    const assignedWorkers = [];

    for (let i = 0; i < Math.min(requiredCount, availableWorkers.length); i++) {
      const worker = availableWorkers[i];
      assignedWorkers.push(worker);

      // 할당된 스케줄 추가
      workingSchedules.push({
        ...schedule,
        user_id: worker.id
      });
    }

    if (assignedWorkers.length < requiredCount) {
      assignments.push({
        schedule_id: schedule.id,
        assigned_workers: assignedWorkers,
        status: 'partial',
        message: `${requiredCount}명 필요, ${assignedWorkers.length}명만 할당됨`
      });
    } else {
      assignments.push({
        schedule_id: schedule.id,
        assigned_workers: assignedWorkers,
        status: 'complete'
      });
    }
  }

  return {
    success: true,
    total_schedules: schedules.length,
    assigned: assignments.filter(a => a.status === 'complete').length,
    partial: assignments.filter(a => a.status === 'partial').length,
    unassigned: unassigned.length,
    assignments,
    unassigned_schedules: unassigned
  };
}

/**
 * 대량 할당 (여러 직원을 한 번에 할당)
 * @param {Object} schedule - 스케줄 정보
 * @param {Array} workerIds - 할당할 직원 ID 목록
 * @param {Array} existingSchedules - 기존 스케줄
 * @returns {Object} 대량 할당 결과
 */
function bulkAssign(schedule, workerIds, existingSchedules) {
  const results = {
    success: [],
    failed: []
  };

  for (const workerId of workerIds) {
    const worker = { id: workerId };
    const result = assignWorker(schedule, worker, existingSchedules);

    if (result.success) {
      results.success.push({
        worker_id: workerId,
        assignment: result.assignment
      });

      // 성공한 할당을 기존 스케줄에 추가
      existingSchedules.push({
        ...schedule,
        user_id: workerId
      });
    } else {
      results.failed.push({
        worker_id: workerId,
        error: result.error,
        message: result.message
      });
    }
  }

  return {
    total: workerIds.length,
    succeeded: results.success.length,
    failed_count: results.failed.length,
    results
  };
}

/**
 * 주간 근무 시간 계산 (헬퍼 함수)
 */
function calculateWeeklyHours(workerId, schedules, weekStart, weekEnd) {
  let totalHours = 0;

  for (const schedule of schedules) {
    if (schedule.user_id !== workerId) continue;
    if (schedule.status === 'cancelled') continue;

    const schedStart = new Date(schedule.start_time);
    const schedEnd = new Date(schedule.end_time);

    // 해당 주에 포함되는지 확인
    if (schedStart >= weekStart && schedStart <= weekEnd) {
      totalHours += moment(schedEnd).diff(moment(schedStart), 'hours', true);
    }
  }

  return totalHours;
}

module.exports = {
  assignWorker,
  removeAssignment,
  swapAssignments,
  autoAssign,
  bulkAssign
};