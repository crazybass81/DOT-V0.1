/**
 * T078: GPS 거리 계산 모듈 구현 (GREEN phase)
 * 기존 DOT 프로젝트의 검증된 Haversine 공식 재사용
 */

// 지구 반지름 (킬로미터)
const EARTH_RADIUS_KM = 6371;

/**
 * 도(degree)를 라디안(radian)으로 변환
 * @param {number} degrees - 도 단위 각도
 * @returns {number} 라디안 단위 각도
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * 두 GPS 좌표 간 거리 계산 (Haversine 공식)
 * @param {number|Object} lat1 - 첫 번째 위도 또는 첫 번째 위치 객체 {lat, lng}
 * @param {number} [lon1] - 첫 번째 경도 (lat1이 객체인 경우 두 번째 위치 객체)
 * @param {number} [lat2] - 두 번째 위도
 * @param {number} [lon2] - 두 번째 경도
 * @returns {number} 거리 (미터)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  // 오버로딩: 객체 형태로 호출된 경우 (기존 호환성 유지)
  if (typeof lat1 === 'object' && typeof lon1 === 'object') {
    const pos1 = lat1;
    const pos2 = lon1;

    // 입력 검증
    if (!pos1 || !pos2) {
      throw new Error('유효하지 않은 좌표입니다');
    }

    if (!validateCoordinates(pos1.lat, pos1.lng) || !validateCoordinates(pos2.lat, pos2.lng)) {
      throw new Error('유효하지 않은 좌표입니다');
    }

    // 같은 위치인 경우 즉시 반환
    if (pos1.lat === pos2.lat && pos1.lng === pos2.lng) {
      return 0;
    }

    // Haversine 공식 적용
    const dLat = toRadians(pos2.lat - pos1.lat);
    const dLon = toRadians(pos2.lng - pos1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(pos1.lat)) *
      Math.cos(toRadians(pos2.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // 킬로미터를 미터로 변환
    return EARTH_RADIUS_KM * c * 1000;
  }

  // 새로운 형태: 개별 좌표로 호출된 경우
  if (typeof lat1 === 'number' && typeof lon1 === 'number' &&
      typeof lat2 === 'number' && typeof lon2 === 'number') {

    // 입력 검증
    if (!validateCoordinates(lat1, lon1) || !validateCoordinates(lat2, lon2)) {
      throw new Error('유효하지 않은 좌표입니다');
    }

    // 같은 위치인 경우 즉시 반환
    if (lat1 === lat2 && lon1 === lon2) {
      return 0;
    }

    // Haversine 공식 적용
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // 킬로미터를 미터로 변환
    return EARTH_RADIUS_KM * c * 1000;
  }

  throw new Error('잘못된 함수 호출: calculateDistance(lat1, lon1, lat2, lon2) 또는 calculateDistance(pos1, pos2) 형태로 호출하세요');
}

/**
 * 특정 반경 내에 있는지 확인
 * @param {Object} center - 중심 위치 {lat, lng}
 * @param {Object} point - 확인할 위치 {lat, lng}
 * @param {number} radius - 반경 (미터)
 * @returns {boolean} 반경 내 여부
 */
function isWithinRadius(center, point, radius) {
  // 반경 검증
  if (radius < 0) {
    throw new Error('Radius must be non-negative');
  }

  const distance = calculateDistance(center, point);
  return distance <= radius;
}

/**
 * GPS 좌표 유효성 검증
 * @param {number} lat - 위도
 * @param {number} lng - 경도
 * @returns {boolean} 유효 여부
 */
function validateCoordinates(lat, lng) {
  // 타입 검사
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return false;
  }

  // NaN 검사
  if (isNaN(lat) || isNaN(lng)) {
    return false;
  }

  // 범위 검사
  // 위도: -90 ~ 90
  // 경도: -180 ~ 180
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * 사업장 위치 기준 출퇴근 가능 여부 확인
 * @param {Object} businessLocation - 사업장 위치 {lat, lng}
 * @param {Object} userLocation - 사용자 위치 {lat, lng}
 * @param {number} allowedRadius - 허용 반경 (미터, 기본 50m)
 * @returns {Object} {allowed: boolean, distance: number}
 */
function checkAttendanceLocation(businessLocation, userLocation, allowedRadius = 50) {
  try {
    const distance = calculateDistance(businessLocation, userLocation);
    const allowed = distance <= allowedRadius;

    return {
      allowed,
      distance: Math.round(distance), // 미터 단위로 반올림
      message: allowed
        ? '출퇴근 가능한 위치입니다'
        : `사업장에서 ${Math.round(distance)}m 떨어져 있습니다. ${allowedRadius}m 이내로 이동해주세요.`
    };
  } catch (error) {
    return {
      allowed: false,
      distance: null,
      message: 'GPS 위치를 확인할 수 없습니다',
      error: error.message
    };
  }
}

/**
 * GPS 좌표를 주소 형식 문자열로 변환 (디버깅용)
 * @param {Object} location - 위치 {lat, lng}
 * @returns {string} 좌표 문자열
 */
function formatLocation(location) {
  if (!location || !validateCoordinates(location.lat, location.lng)) {
    return 'Invalid location';
  }

  return `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
}

module.exports = {
  calculateDistance,
  isWithinRadius,
  validateCoordinates,
  toRadians,
  checkAttendanceLocation,
  formatLocation,
  EARTH_RADIUS_KM
};