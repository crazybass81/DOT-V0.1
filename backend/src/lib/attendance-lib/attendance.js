/**
 * T082, T084: 출퇴근 체크인/아웃 구현 (GREEN phase)
 * PostgreSQL 직접 쿼리 사용, Mock 없음
 */

const { query } = require('../../config/database');
const { calculateDistance, isWithinRadius } = require('./gps');
const { verifyQRCode } = require('./qr');

// 기본 출퇴근 허용 반경 (미터)
const DEFAULT_CHECK_RADIUS = 50;

/**
 * 체크인 유효성 검증
 * @param {Object} options - 검증 옵션
 * @returns {Object} 검증 결과
 */
function validateCheckIn({ method, userLocation, businessLocation, maxDistance = DEFAULT_CHECK_RADIUS }) {
  if (method === 'gps' && userLocation && businessLocation) {
    const distance = calculateDistance(userLocation, businessLocation);
    const valid = distance <= maxDistance;

    return {
      valid,
      distance: Math.round(distance),
      error: valid ? null : `사업장으로부터 ${Math.round(distance)}m 떨어져 있습니다. ${maxDistance}m를 초과합니다.`
    };
  }

  if (method === 'qr') {
    return { valid: true, distance: null };
  }

  return { valid: false, error: '유효하지 않은 체크인 방식입니다' };
}

/**
 * 근무 시간 계산 (초 단위)
 * @param {Date} checkInTime - 체크인 시간
 * @param {Date} checkOutTime - 체크아웃 시간
 * @param {number} breakTime - 휴게 시간 (초)
 * @returns {number} 근무 시간 (초)
 */
function calculateWorkDuration(checkInTime, checkOutTime, breakTime = 0) {
  const checkIn = checkInTime instanceof Date ? checkInTime : new Date(checkInTime);
  const checkOut = checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime);

  if (checkOut < checkIn) {
    throw new Error('체크아웃 시간이 체크인 시간보다 이전입니다');
  }

  const totalSeconds = Math.floor((checkOut - checkIn) / 1000);
  return Math.max(0, totalSeconds - breakTime);
}

/**
 * 활성 근태 기록 조회
 * @param {number} userId - 사용자 ID
 * @returns {Promise<Object|null>} 활성 근태 기록
 */
async function getActiveAttendance(userId) {
  const result = await query(
    `SELECT * FROM attendance
     WHERE user_id = $1
     AND check_out_time IS NULL
     AND status = 'working'
     ORDER BY check_in_time DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // camelCase로 변환
  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    businessId: row.business_id,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    status: row.status,
    method: row.method,
    notes: row.notes
  };
}

/**
 * 사업장 위치 조회
 * @param {number} businessId - 사업장 ID
 * @returns {Promise<Object>} 사업장 위치 정보
 */
async function getBusinessLocation(businessId) {
  const result = await query(
    `SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
     FROM businesses
     WHERE id = $1`,
    [businessId]
  );

  if (result.rows.length === 0) {
    throw new Error('사업장을 찾을 수 없습니다');
  }

  return {
    lat: result.rows[0].lat,
    lng: result.rows[0].lng
  };
}

/**
 * 출근 체크인
 * @param {Object} params - 체크인 파라미터
 * @returns {Promise<Object>} 체크인 결과
 */
async function checkIn({ userId, businessId, location, qrToken, method = 'gps' }) {
  // 필수 파라미터 검증
  if (!userId) throw new Error('User ID is required');
  if (!businessId) throw new Error('Business ID is required');

  // 이미 체크인 상태인지 확인
  const activeAttendance = await getActiveAttendance(userId);
  if (activeAttendance) {
    throw new Error('이미 체크인 상태입니다');
  }

  // 체크인 방식별 검증
  if (method === 'gps') {
    if (!location) throw new Error('GPS location is required');

    // location 형식 정규화 (latitude/longitude 또는 lat/lng 지원)
    const userLocation = {
      lat: location.latitude || location.lat,
      lng: location.longitude || location.lng
    };

    if (!userLocation.lat || !userLocation.lng) {
      throw new Error('Invalid location format. Required: latitude/longitude or lat/lng');
    }

    // 사업장 위치 및 반경 조회
    const businessResult = await query(
      `SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, gps_radius_meters
       FROM businesses
       WHERE id = $1`,
      [businessId]
    );

    if (businessResult.rows.length === 0) {
      throw new Error('사업장을 찾을 수 없습니다');
    }

    const business = businessResult.rows[0];
    const businessLocation = { lat: business.lat, lng: business.lng };
    const maxRadius = business.gps_radius_meters || DEFAULT_CHECK_RADIUS;

    // GPS 위치 검증
    const validation = validateCheckIn({
      method: 'gps',
      userLocation,
      businessLocation,
      maxDistance: maxRadius
    });

    if (!validation.valid) {
      throw new Error('GPS 위치가 사업장 범위를 벗어났습니다');
    }
  } else if (method === 'qr') {
    if (!qrToken) throw new Error('QR token is required');

    // QR 토큰 검증
    const qrValidation = await verifyQRCode(qrToken);
    if (!qrValidation.valid) {
      throw new Error('유효하지 않은 QR 코드입니다: ' + qrValidation.error);
    }

    // QR 코드의 사업장 ID 확인
    if (qrValidation.businessId !== String(businessId)) {
      throw new Error('QR 코드의 사업장이 일치하지 않습니다');
    }
  }

  // location 정규화
  const normalizedLocation = location ? {
    lng: location.longitude || location.lng,
    lat: location.latitude || location.lat
  } : null;

  // 근태 기록 생성
  const result = await query(
    `INSERT INTO attendance
     (user_id, business_id, check_in_time, status, method, check_in_location)
     VALUES ($1, $2, NOW(), 'working', $3, $4)
     RETURNING *`,
    [
      userId,
      businessId,
      method,
      normalizedLocation ? `POINT(${normalizedLocation.lng} ${normalizedLocation.lat})` : null
    ]
  );

  const attendance = result.rows[0];

  return {
    success: true,
    id: attendance.id,
    userId: attendance.user_id,
    businessId: attendance.business_id,
    checkInTime: attendance.check_in_time,
    status: attendance.status,
    method: attendance.method
  };
}

/**
 * 퇴근 체크아웃
 * @param {Object} params - 체크아웃 파라미터
 * @returns {Promise<Object>} 체크아웃 결과
 */
async function checkOut({ userId, businessId, attendanceId, location, method = 'gps', force = false }) {
  // attendanceId가 없으면 userId로 활성 출근 기록 찾기
  if (!attendanceId && userId) {
    const activeAttendance = await getActiveAttendance(userId);
    if (!activeAttendance) {
      throw new Error('출근 기록이 없습니다');
    }
    attendanceId = activeAttendance.id;
  }

  if (!attendanceId) {
    throw new Error('Attendance ID or User ID is required');
  }
  // 근태 기록 조회
  const attendanceResult = await query(
    `SELECT * FROM attendance WHERE id = $1`,
    [attendanceId]
  );

  if (attendanceResult.rows.length === 0) {
    throw new Error('근태 기록을 찾을 수 없습니다');
  }

  const attendance = attendanceResult.rows[0];

  // 이미 체크아웃된 경우
  if (attendance.check_out_time) {
    throw new Error('이미 체크아웃되었습니다');
  }

  let notes = attendance.notes || '';

  // 위치 검증 (선택사항)
  if (location && !force) {
    // location 정규화
    const userLocation = {
      lat: location.latitude || location.lat,
      lng: location.longitude || location.lng
    };

    const businessLocation = await getBusinessLocation(attendance.business_id);
    const distance = calculateDistance(userLocation, businessLocation);

    if (distance > DEFAULT_CHECK_RADIUS) {
      notes += `체크아웃 위치가 사업장과 ${Math.round(distance)}m 멀리 떨어져 있습니다. `;
    }
  }

  if (force) {
    notes += '강제 종료. ';
  }

  // 근무 시간 계산
  const checkInTime = new Date(attendance.check_in_time);
  const checkOutTime = new Date();
  const workDuration = calculateWorkDuration(checkInTime, checkOutTime, attendance.break_duration || 0);

  // location 정규화 (저장용)
  const normalizedLocation = location ? {
    lng: location.longitude || location.lng,
    lat: location.latitude || location.lat
  } : null;

  // 체크아웃 업데이트
  const updateResult = await query(
    `UPDATE attendance
     SET check_out_time = NOW(),
         check_out_location = $1,
         work_duration = $2,
         status = 'completed',
         notes = $3
     WHERE id = $4
     RETURNING *`,
    [
      normalizedLocation ? `POINT(${normalizedLocation.lng} ${normalizedLocation.lat})` : null,
      workDuration,
      notes.trim(),
      attendanceId
    ]
  );

  const updated = updateResult.rows[0];

  // 근무 시간을 시간 단위로 변환
  const totalHours = updated.work_duration / 3600;

  return {
    success: true,
    id: updated.id,
    userId: updated.user_id,
    businessId: updated.business_id,
    checkInTime: updated.check_in_time,
    checkOutTime: updated.check_out_time,
    workDuration: updated.work_duration,
    duration: totalHours,
    status: updated.status,
    notes: updated.notes
  };
}

/**
 * 출퇴근 상태 조회
 * @param {number} userId - 사용자 ID
 * @param {number} businessId - 사업장 ID
 * @returns {Promise<Object>} 출퇴근 상태
 */
async function getAttendanceStatus(userId, businessId) {
  // 오늘 날짜 기준으로 출퇴근 기록 조회
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await query(
    `SELECT * FROM attendance
     WHERE user_id = $1
     AND business_id = $2
     AND check_in_time >= $3
     ORDER BY check_in_time DESC
     LIMIT 1`,
    [userId, businessId, today]
  );

  if (result.rows.length === 0) {
    return {
      isWorking: false,
      checkInTime: null,
      checkOutTime: null,
      method: null,
      totalHours: 0
    };
  }

  const attendance = result.rows[0];
  const isWorking = !attendance.check_out_time;
  const totalHours = attendance.work_duration ? attendance.work_duration / 3600 : 0;

  return {
    isWorking,
    checkInTime: attendance.check_in_time,
    checkOutTime: attendance.check_out_time,
    method: attendance.method,
    totalHours,
    status: attendance.status
  };
}

/**
 * 날짜별 근태 조회
 * @param {number} userId - 사용자 ID
 * @param {Date} date - 조회 날짜
 * @returns {Promise<Array>} 근태 목록
 */
async function getAttendanceByDate(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await query(
    `SELECT * FROM attendance
     WHERE user_id = $1
     AND check_in_time >= $2
     AND check_in_time <= $3
     ORDER BY check_in_time DESC`,
    [userId, startOfDay, endOfDay]
  );

  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    businessId: row.business_id,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    workDuration: row.work_duration,
    status: row.status,
    method: row.method,
    notes: row.notes
  }));
}

module.exports = {
  checkIn,
  checkOut,
  getActiveAttendance,
  getAttendanceStatus,
  validateCheckIn,
  calculateWorkDuration,
  getAttendanceByDate,
  getBusinessLocation,
  DEFAULT_CHECK_RADIUS
};