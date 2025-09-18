/**
 * T249: 출퇴근 시간 검증 및 근무 시간 계산 모듈
 * 근무 시간 계산, 휴게 시간 처리, 출퇴근 유효성 검증
 */

const { calculateDistance } = require('./gps');
const { verifyQRCode } = require('./qr');

// 기본 설정값들
const DEFAULT_CHECK_RADIUS = 50; // 미터
const DEFAULT_WORK_HOURS = 8; // 시간
const DEFAULT_BREAK_TIME = 3600; // 초 (1시간)
const MAX_DAILY_WORK_HOURS = 12; // 시간
const MIN_BREAK_TIME = 1800; // 초 (30분)

/**
 * 출근 시간 검증
 * @param {Object} params - 검증 파라미터
 * @param {string} params.method - 체크인 방식 ('gps' | 'qr')
 * @param {Object} [params.userLocation] - 사용자 위치 {lat, lng}
 * @param {Object} [params.businessLocation] - 사업장 위치 {lat, lng}
 * @param {string} [params.qrToken] - QR 토큰
 * @param {number} [params.maxDistance] - 최대 허용 거리 (미터)
 * @returns {Promise<Object>} 검증 결과 {valid: boolean, distance?: number, error?: string}
 */
async function validateCheckIn({ method, userLocation, businessLocation, qrToken, maxDistance = DEFAULT_CHECK_RADIUS }) {
  try {
    if (method === 'gps') {
      // GPS 방식 검증
      if (!userLocation || !businessLocation) {
        return {
          valid: false,
          error: 'GPS 체크인을 위해서는 사용자와 사업장 위치가 필요합니다'
        };
      }

      // 위치 형식 정규화
      const normalizedUserLocation = {
        lat: userLocation.latitude || userLocation.lat,
        lng: userLocation.longitude || userLocation.lng
      };

      const normalizedBusinessLocation = {
        lat: businessLocation.latitude || businessLocation.lat,
        lng: businessLocation.longitude || businessLocation.lng
      };

      if (!normalizedUserLocation.lat || !normalizedUserLocation.lng) {
        return {
          valid: false,
          error: '유효하지 않은 사용자 위치 형식입니다'
        };
      }

      if (!normalizedBusinessLocation.lat || !normalizedBusinessLocation.lng) {
        return {
          valid: false,
          error: '유효하지 않은 사업장 위치 형식입니다'
        };
      }

      // 거리 계산
      const distance = calculateDistance(
        normalizedUserLocation.lat,
        normalizedUserLocation.lng,
        normalizedBusinessLocation.lat,
        normalizedBusinessLocation.lng
      );

      const valid = distance <= maxDistance;

      return {
        valid,
        distance: Math.round(distance),
        error: valid ? null : `사업장으로부터 ${Math.round(distance)}m 떨어져 있습니다. 허용 범위: ${maxDistance}m`
      };

    } else if (method === 'qr') {
      // QR 방식 검증
      if (!qrToken) {
        return {
          valid: false,
          error: 'QR 체크인을 위해서는 QR 토큰이 필요합니다'
        };
      }

      // QR 토큰 검증
      const qrValidation = await verifyQRCode(qrToken);

      if (!qrValidation.valid) {
        return {
          valid: false,
          error: `유효하지 않은 QR 코드: ${qrValidation.error}`
        };
      }

      return {
        valid: true,
        businessId: qrValidation.businessId,
        qrValidation
      };

    } else {
      return {
        valid: false,
        error: '지원하지 않는 체크인 방식입니다. GPS 또는 QR 방식을 사용하세요'
      };
    }

  } catch (error) {
    return {
      valid: false,
      error: `체크인 검증 중 오류 발생: ${error.message}`
    };
  }
}

/**
 * 퇴근 시간 검증
 * @param {Object} params - 검증 파라미터
 * @param {Date} params.checkInTime - 체크인 시간
 * @param {Date} [params.checkOutTime] - 체크아웃 시간 (기본값: 현재 시간)
 * @param {Object} [params.userLocation] - 사용자 위치
 * @param {Object} [params.businessLocation] - 사업장 위치
 * @param {number} [params.maxDistance] - 최대 허용 거리
 * @param {boolean} [params.force] - 강제 체크아웃 여부
 * @returns {Object} 검증 결과
 */
function validateCheckOut({
  checkInTime,
  checkOutTime = new Date(),
  userLocation,
  businessLocation,
  maxDistance = DEFAULT_CHECK_RADIUS,
  force = false
}) {
  try {
    const result = {
      valid: true,
      warnings: [],
      distance: null,
      workDuration: null
    };

    // 체크인/체크아웃 시간 검증
    const checkIn = checkInTime instanceof Date ? checkInTime : new Date(checkInTime);
    const checkOut = checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime);

    if (checkOut < checkIn) {
      return {
        valid: false,
        error: '체크아웃 시간이 체크인 시간보다 이전입니다'
      };
    }

    // 근무 시간 계산 (초 단위)
    const workDurationSeconds = Math.floor((checkOut - checkIn) / 1000);
    result.workDuration = workDurationSeconds;

    // 과도한 근무 시간 확인 (12시간 초과)
    const workHours = workDurationSeconds / 3600;
    if (workHours > MAX_DAILY_WORK_HOURS) {
      result.warnings.push(`과도한 근무 시간: ${workHours.toFixed(1)}시간`);
    }

    // 위치 검증 (선택사항, force가 아닌 경우에만)
    if (!force && userLocation && businessLocation) {
      // 위치 형식 정규화
      const normalizedUserLocation = {
        lat: userLocation.latitude || userLocation.lat,
        lng: userLocation.longitude || userLocation.lng
      };

      const normalizedBusinessLocation = {
        lat: businessLocation.latitude || businessLocation.lat,
        lng: businessLocation.longitude || businessLocation.lng
      };

      if (normalizedUserLocation.lat && normalizedUserLocation.lng &&
          normalizedBusinessLocation.lat && normalizedBusinessLocation.lng) {

        const distance = calculateDistance(
          normalizedUserLocation.lat,
          normalizedUserLocation.lng,
          normalizedBusinessLocation.lat,
          normalizedBusinessLocation.lng
        );

        result.distance = Math.round(distance);

        if (distance > maxDistance) {
          result.warnings.push(`체크아웃 위치가 사업장에서 ${Math.round(distance)}m 떨어져 있습니다`);
        }
      }
    }

    if (force) {
      result.warnings.push('강제 체크아웃이 실행되었습니다');
    }

    return result;

  } catch (error) {
    return {
      valid: false,
      error: `체크아웃 검증 중 오류 발생: ${error.message}`
    };
  }
}

/**
 * 근무 시간 계산 (초 단위)
 * @param {Date|string} checkInTime - 체크인 시간
 * @param {Date|string} checkOutTime - 체크아웃 시간
 * @param {number} [breakTimeSeconds=0] - 휴게 시간 (초)
 * @returns {number} 실제 근무 시간 (초)
 */
function calculateWorkHours(checkInTime, checkOutTime, breakTimeSeconds = 0) {
  try {
    const checkIn = checkInTime instanceof Date ? checkInTime : new Date(checkInTime);
    const checkOut = checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime);

    if (checkOut < checkIn) {
      throw new Error('체크아웃 시간이 체크인 시간보다 이전입니다');
    }

    if (breakTimeSeconds < 0) {
      throw new Error('휴게 시간은 0 이상이어야 합니다');
    }

    // 총 시간 계산 (초 단위)
    const totalSeconds = Math.floor((checkOut - checkIn) / 1000);

    // 실제 근무 시간 = 총 시간 - 휴게 시간
    const workSeconds = Math.max(0, totalSeconds - breakTimeSeconds);

    return workSeconds;

  } catch (error) {
    throw new Error(`근무 시간 계산 오류: ${error.message}`);
  }
}

/**
 * 휴게 시간 유효성 검증
 * @param {number} breakTimeSeconds - 휴게 시간 (초)
 * @param {number} totalWorkSeconds - 총 근무 시간 (초)
 * @returns {Object} 검증 결과
 */
function validateBreakTime(breakTimeSeconds, totalWorkSeconds) {
  const result = {
    valid: true,
    warnings: [],
    adjustedBreakTime: breakTimeSeconds
  };

  // 휴게 시간이 음수인지 확인
  if (breakTimeSeconds < 0) {
    result.valid = false;
    result.error = '휴게 시간은 0 이상이어야 합니다';
    return result;
  }

  // 휴게 시간이 총 근무 시간보다 큰지 확인
  if (breakTimeSeconds >= totalWorkSeconds) {
    result.valid = false;
    result.error = '휴게 시간이 총 근무 시간과 같거나 초과합니다';
    return result;
  }

  // 8시간 이상 근무 시 최소 30분 휴게 시간 권장
  const workHours = totalWorkSeconds / 3600;
  if (workHours >= 8 && breakTimeSeconds < MIN_BREAK_TIME) {
    result.warnings.push(`8시간 이상 근무 시 최소 ${MIN_BREAK_TIME / 60}분 휴게 시간을 권장합니다`);
  }

  // 휴게 시간이 과도한지 확인 (총 근무 시간의 50% 초과)
  if (breakTimeSeconds > totalWorkSeconds * 0.5) {
    result.warnings.push('휴게 시간이 총 근무 시간의 50%를 초과합니다');
  }

  return result;
}

/**
 * 일일 근무 시간 요약 계산
 * @param {Array} attendanceRecords - 출퇴근 기록 배열
 * @returns {Object} 근무 시간 요약
 */
function calculateDailySummary(attendanceRecords) {
  if (!Array.isArray(attendanceRecords)) {
    throw new Error('출퇴근 기록은 배열이어야 합니다');
  }

  let totalWorkSeconds = 0;
  let totalBreakSeconds = 0;
  let completedSessions = 0;
  let incompleteSessions = 0;

  for (const record of attendanceRecords) {
    if (record.checkOutTime && record.workDuration !== null) {
      // 완료된 세션
      totalWorkSeconds += record.workDuration || 0;
      totalBreakSeconds += record.breakDuration || 0;
      completedSessions++;
    } else {
      // 미완료 세션 (체크아웃 안됨)
      incompleteSessions++;
    }
  }

  const totalHours = totalWorkSeconds / 3600;
  const totalBreakHours = totalBreakSeconds / 3600;

  return {
    totalWorkSeconds,
    totalWorkHours: Math.round(totalHours * 100) / 100, // 소수점 둘째 자리까지
    totalBreakSeconds,
    totalBreakHours: Math.round(totalBreakHours * 100) / 100,
    completedSessions,
    incompleteSessions,
    averageSessionHours: completedSessions > 0 ? Math.round((totalHours / completedSessions) * 100) / 100 : 0,
    isOvertime: totalHours > DEFAULT_WORK_HOURS,
    overtimeHours: Math.max(0, totalHours - DEFAULT_WORK_HOURS)
  };
}

/**
 * 근무 시간을 읽기 쉬운 형태로 포맷팅
 * @param {number} seconds - 초 단위 시간
 * @returns {string} 포맷팅된 시간 문자열
 */
function formatWorkDuration(seconds) {
  if (typeof seconds !== 'number' || seconds < 0) {
    return '0시간 0분';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}분`;
  } else if (minutes === 0) {
    return `${hours}시간`;
  } else {
    return `${hours}시간 ${minutes}분`;
  }
}

/**
 * 야간 근무 시간 계산 (22:00 ~ 06:00)
 * @param {Date} checkInTime - 체크인 시간
 * @param {Date} checkOutTime - 체크아웃 시간
 * @returns {number} 야간 근무 시간 (초)
 */
function calculateNightWorkHours(checkInTime, checkOutTime) {
  const checkIn = checkInTime instanceof Date ? checkInTime : new Date(checkInTime);
  const checkOut = checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime);

  if (checkOut <= checkIn) {
    return 0;
  }

  let nightWorkSeconds = 0;
  const current = new Date(checkIn);

  while (current < checkOut) {
    const endOfHour = new Date(current);
    endOfHour.setMinutes(59, 59, 999);

    const periodEnd = endOfHour < checkOut ? endOfHour : checkOut;
    const hour = current.getHours();

    // 야간 시간 확인 (22:00-23:59 또는 00:00-05:59)
    if (hour >= 22 || hour < 6) {
      nightWorkSeconds += Math.floor((periodEnd - current) / 1000);
    }

    // 다음 시간으로 이동
    current.setHours(current.getHours() + 1, 0, 0, 0);
  }

  return nightWorkSeconds;
}

module.exports = {
  validateCheckIn,
  validateCheckOut,
  calculateWorkHours,
  validateBreakTime,
  calculateDailySummary,
  formatWorkDuration,
  calculateNightWorkHours,

  // 상수 export
  DEFAULT_CHECK_RADIUS,
  DEFAULT_WORK_HOURS,
  DEFAULT_BREAK_TIME,
  MAX_DAILY_WORK_HOURS,
  MIN_BREAK_TIME
};