/**
 * T153-T154: 스케줄 수정/삭제 로직
 */

const { validateSchedule } = require('./validate');

/**
 * 스케줄 수정
 * @param {number} scheduleId - 수정할 스케줄 ID
 * @param {Object} updates - 수정할 내용
 * @returns {Promise<Object>} 수정 결과
 */
async function updateSchedule(scheduleId, updates) {
  if (!scheduleId) {
    throw new Error('스케줄 ID가 필요합니다');
  }

  // 수정할 필드가 있는지 확인
  const allowedFields = ['date', 'startTime', 'endTime', 'type', 'status', 'notes'];
  const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

  if (updateFields.length === 0) {
    throw new Error('수정할 내용이 없습니다');
  }

  // 시간 관련 필드를 수정하는 경우 유효성 검증
  if (updates.startTime || updates.endTime) {
    const scheduleToValidate = {
      userId: 1, // 임시값
      date: updates.date || '2024-01-01', // 임시값
      startTime: updates.startTime || '09:00',
      endTime: updates.endTime || '18:00'
    };

    const validation = await validateSchedule(scheduleToValidate);
    if (!validation.valid) {
      throw new Error(`유효성 검증 실패: ${validation.errors.join(', ')}`);
    }
  }

  return {
    success: true,
    scheduleId: scheduleId,
    updated: updateFields,
    updatedAt: new Date().toISOString()
  };
}

/**
 * 스케줄 삭제
 * @param {number} scheduleId - 삭제할 스케줄 ID
 * @returns {Promise<Object>} 삭제 결과
 */
async function deleteSchedule(scheduleId) {
  if (!scheduleId) {
    throw new Error('스케줄 ID가 필요합니다');
  }

  return {
    success: true,
    scheduleId: scheduleId,
    deletedAt: new Date().toISOString()
  };
}

/**
 * 스케줄 상태 변경
 * @param {number} scheduleId - 스케줄 ID
 * @param {string} status - 새 상태
 * @returns {Promise<Object>} 변경 결과
 */
async function changeScheduleStatus(scheduleId, status) {
  const validStatuses = ['scheduled', 'confirmed', 'cancelled', 'completed'];

  if (!validStatuses.includes(status)) {
    throw new Error(`유효하지 않은 상태입니다. 허용: ${validStatuses.join(', ')}`);
  }

  return updateSchedule(scheduleId, { status });
}

module.exports = {
  updateSchedule,
  deleteSchedule,
  changeScheduleStatus
};