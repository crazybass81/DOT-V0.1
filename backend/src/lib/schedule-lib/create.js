/**
 * T151-T152: 스케줄 생성 로직
 */

const { validateSchedule } = require('./validate');
const { findConflictsForSchedule } = require('./conflict');

/**
 * 새 스케줄 생성
 * @param {Object} scheduleData - 스케줄 데이터
 * @param {Array} existingSchedules - 기존 스케줄 목록 (충돌 체크용)
 * @returns {Promise<Object>} 생성 결과
 */
async function createSchedule(scheduleData, existingSchedules = []) {
  // 1. 유효성 검증
  const validation = await validateSchedule(scheduleData);
  if (!validation.valid) {
    throw new Error(`스케줄 유효성 검증 실패: ${validation.errors.join(', ')}`);
  }

  // 2. 충돌 체크
  const conflicts = findConflictsForSchedule(scheduleData, existingSchedules);
  if (conflicts.length > 0) {
    throw new Error(`스케줄 충돌 발견: ${conflicts[0].reason}`);
  }

  // 3. 스케줄 객체 생성
  const schedule = {
    id: Date.now(), // 임시 ID
    userId: scheduleData.userId,
    businessId: scheduleData.businessId,
    date: scheduleData.date,
    startTime: scheduleData.startTime,
    endTime: scheduleData.endTime,
    type: scheduleData.type || 'shift',
    status: 'scheduled',
    notes: scheduleData.notes || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return {
    success: true,
    schedule: schedule
  };
}

/**
 * 여러 스케줄 일괄 생성
 * @param {Array} scheduleDataList - 스케줄 데이터 배열
 * @returns {Promise<Object>} 생성 결과
 */
async function createBulkSchedules(scheduleDataList) {
  const results = {
    success: [],
    failed: []
  };

  const allSchedules = [];

  for (const scheduleData of scheduleDataList) {
    try {
      const result = await createSchedule(scheduleData, allSchedules);
      results.success.push(result.schedule);
      allSchedules.push(result.schedule);
    } catch (error) {
      results.failed.push({
        data: scheduleData,
        error: error.message
      });
    }
  }

  return results;
}

module.exports = {
  createSchedule,
  createBulkSchedules
};