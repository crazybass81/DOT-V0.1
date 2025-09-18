/**
 * 스케줄 조회 유틸리티
 */

/**
 * 특정 날짜의 스케줄 조회
 * @param {string} date - 조회할 날짜 (YYYY-MM-DD)
 * @param {Array} schedules - 전체 스케줄 목록
 * @returns {Array} 해당 날짜의 스케줄
 */
function getSchedulesByDate(date, schedules) {
  return schedules.filter(schedule => schedule.date === date);
}

/**
 * 특정 사용자의 스케줄 조회
 * @param {number} userId - 사용자 ID
 * @param {Array} schedules - 전체 스케줄 목록
 * @returns {Array} 해당 사용자의 스케줄
 */
function getSchedulesByUser(userId, schedules) {
  return schedules.filter(schedule => schedule.userId === userId);
}

/**
 * 특정 사업장의 스케줄 조회
 * @param {number} businessId - 사업장 ID
 * @param {Array} schedules - 전체 스케줄 목록
 * @returns {Array} 해당 사업장의 스케줄
 */
function getSchedulesByBusiness(businessId, schedules) {
  return schedules.filter(schedule => schedule.businessId === businessId);
}

/**
 * 기간별 스케줄 조회
 * @param {string} startDate - 시작일
 * @param {string} endDate - 종료일
 * @param {Array} schedules - 전체 스케줄 목록
 * @returns {Array} 해당 기간의 스케줄
 */
function getSchedulesByDateRange(startDate, endDate, schedules) {
  return schedules.filter(schedule => {
    return schedule.date >= startDate && schedule.date <= endDate;
  });
}

module.exports = {
  getSchedulesByDate,
  getSchedulesByUser,
  getSchedulesByBusiness,
  getSchedulesByDateRange
};