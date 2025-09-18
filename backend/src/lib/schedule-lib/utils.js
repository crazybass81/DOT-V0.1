/**
 * 스케줄 관련 유틸리티 함수
 */

/**
 * 근무 시간 계산
 * @param {Object} options - 계산 옵션
 * @returns {Object} 시간 계산 결과
 */
function calculateWorkHours(options) {
  const { schedules = [], breakHours = 0 } = options;

  let totalMinutes = 0;
  let overtimeMinutes = 0;

  schedules.forEach(schedule => {
    if (schedule.type === 'shift' || schedule.type === 'overtime') {
      const start = timeToMinutes(schedule.startTime);
      const end = timeToMinutes(schedule.endTime);
      const duration = end - start;

      totalMinutes += duration;

      // 8시간(480분) 초과분은 초과근무
      if (totalMinutes > 480) {
        overtimeMinutes = totalMinutes - 480;
      }

      if (schedule.type === 'overtime') {
        overtimeMinutes += duration;
      }
    }
  });

  // 휴게시간 제외
  const actualWorkMinutes = totalMinutes - (breakHours * 60);
  const regularMinutes = Math.min(actualWorkMinutes, 480);

  return {
    total: minutesToHours(actualWorkMinutes),
    regular: minutesToHours(regularMinutes),
    overtime: minutesToHours(overtimeMinutes),
    break: breakHours
  };
}

/**
 * 스케줄 시간 포맷팅
 * @param {Object} schedule - 스케줄 객체
 * @returns {string} 포맷된 시간 문자열
 */
function formatScheduleTime(schedule) {
  return `${schedule.date} ${schedule.startTime}-${schedule.endTime}`;
}

/**
 * 스케줄 시간 문자열 파싱
 * @param {string} timeString - 시간 문자열
 * @returns {Object} 파싱된 스케줄 시간
 */
function parseScheduleTime(timeString) {
  // "2024-01-01 09:00-18:00" 형식
  const match = timeString.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})-(\d{2}:\d{2})/);

  if (!match) {
    throw new Error('올바른 시간 형식이 아닙니다');
  }

  return {
    date: match[1],
    startTime: match[2],
    endTime: match[3]
  };
}

/**
 * 시간을 분 단위로 변환
 */
function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 분을 시간 단위로 변환
 */
function minutesToHours(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}시간 ${mins}분`;
}

module.exports = {
  calculateWorkHours,
  formatScheduleTime,
  parseScheduleTime,
  timeToMinutes,
  minutesToHours
};