/**
 * T081, T083: 출퇴근 체크인/아웃 테스트 (RED phase)
 * 실제 PostgreSQL 사용, Mock 없음
 */

const {
  checkIn,
  checkOut,
  getActiveAttendance,
  validateCheckIn,
  calculateWorkDuration
} = require('./attendance');

const { query } = require('../../config/database');

describe('Attendance Module', () => {
  // 테스트 데이터
  const testUserId = 1;
  const testBusinessId = 1;
  const testLocation = { lat: 37.5665, lng: 126.9780 }; // 서울시청
  const businessLocation = { lat: 37.5665, lng: 126.9780 }; // 사업장 위치

  // 각 테스트 전 데이터 정리
  beforeEach(async () => {
    // 테스트 사용자의 모든 근태 기록 삭제
    await query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
  });

  // 테스트 후 정리
  afterAll(async () => {
    await query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
  });

  describe('checkIn', () => {
    test('정상적인 체크인', async () => {
      const result = await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('checkInTime');
      expect(result.userId).toBe(testUserId);
      expect(result.businessId).toBe(testBusinessId);
      expect(result.status).toBe('working');
    });

    test('GPS 위치 검증 실패 시 거부', async () => {
      const farLocation = { lat: 37.4979, lng: 127.0276 }; // 강남역 (약 9km)

      await expect(checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: farLocation,
        method: 'gps'
      })).rejects.toThrow('출퇴근 가능한 위치가 아닙니다');
    });

    test('중복 체크인 방지', async () => {
      // 첫 번째 체크인
      await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      });

      // 두 번째 체크인 시도
      await expect(checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      })).rejects.toThrow('이미 체크인 상태입니다');
    });

    test('QR 코드로 체크인', async () => {
      const result = await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        qrToken: 'valid-qr-token',
        method: 'qr'
      });

      expect(result.method).toBe('qr');
      expect(result.status).toBe('working');
    });

    test('필수 파라미터 검증', async () => {
      await expect(checkIn({
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      })).rejects.toThrow('User ID is required');

      await expect(checkIn({
        userId: testUserId,
        location: testLocation,
        method: 'gps'
      })).rejects.toThrow('Business ID is required');
    });

    test('체크인 시간 기록', async () => {
      const beforeTime = new Date();

      const result = await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      });

      const afterTime = new Date();
      const checkInTime = new Date(result.checkInTime);

      expect(checkInTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(checkInTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('checkOut', () => {
    let attendanceId;

    beforeEach(async () => {
      // 체크인 먼저 수행
      const checkInResult = await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      });
      attendanceId = checkInResult.id;
    });

    test('정상적인 체크아웃', async () => {
      const result = await checkOut({
        attendanceId,
        location: testLocation
      });

      expect(result).toHaveProperty('id', attendanceId);
      expect(result).toHaveProperty('checkOutTime');
      expect(result).toHaveProperty('workDuration');
      expect(result.status).toBe('completed');
    });

    test('근무 시간 계산', async () => {
      // 체크인 후 1초 대기
      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await checkOut({
        attendanceId,
        location: testLocation
      });

      expect(result.workDuration).toBeGreaterThan(0);
      expect(result.workDuration).toBeLessThan(10); // 10초 이내
    });

    test('위치 검증 실패 시 경고 포함', async () => {
      const farLocation = { lat: 37.4979, lng: 127.0276 }; // 강남역

      const result = await checkOut({
        attendanceId,
        location: farLocation
      });

      expect(result.status).toBe('completed');
      expect(result.notes).toContain('체크아웃 위치가 사업장과 멀리 떨어져 있습니다');
    });

    test('이미 체크아웃된 경우 처리', async () => {
      // 첫 번째 체크아웃
      await checkOut({
        attendanceId,
        location: testLocation
      });

      // 두 번째 체크아웃 시도
      await expect(checkOut({
        attendanceId,
        location: testLocation
      })).rejects.toThrow('이미 체크아웃되었습니다');
    });

    test('존재하지 않는 근태 ID', async () => {
      await expect(checkOut({
        attendanceId: 99999,
        location: testLocation
      })).rejects.toThrow('근태 기록을 찾을 수 없습니다');
    });

    test('위치 없이 체크아웃 (강제 종료)', async () => {
      const result = await checkOut({
        attendanceId,
        force: true
      });

      expect(result.status).toBe('completed');
      expect(result.notes).toContain('강제 종료');
    });
  });

  describe('getActiveAttendance', () => {
    test('활성 근태 조회', async () => {
      await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      });

      const active = await getActiveAttendance(testUserId);

      expect(active).not.toBeNull();
      expect(active.userId).toBe(testUserId);
      expect(active.status).toBe('working');
      expect(active.checkOutTime).toBeNull();
    });

    test('체크아웃 후 활성 근태 없음', async () => {
      const checkInResult = await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      });

      await checkOut({
        attendanceId: checkInResult.id,
        location: testLocation
      });

      const active = await getActiveAttendance(testUserId);
      expect(active).toBeNull();
    });

    test('체크인 전 활성 근태 없음', async () => {
      const active = await getActiveAttendance(testUserId);
      expect(active).toBeNull();
    });
  });

  describe('validateCheckIn', () => {
    test('GPS 방식 검증', () => {
      const userLocation = { lat: 37.5665, lng: 126.9780 };
      const businessLocation = { lat: 37.5665, lng: 126.9780 };

      const result = validateCheckIn({
        method: 'gps',
        userLocation,
        businessLocation,
        maxDistance: 50
      });

      expect(result.valid).toBe(true);
      expect(result.distance).toBe(0);
    });

    test('GPS 거리 초과', () => {
      const userLocation = { lat: 37.5665, lng: 126.9780 };
      const businessLocation = { lat: 37.5675, lng: 126.9790 }; // 약 150m

      const result = validateCheckIn({
        method: 'gps',
        userLocation,
        businessLocation,
        maxDistance: 50
      });

      expect(result.valid).toBe(false);
      expect(result.distance).toBeGreaterThan(50);
      expect(result.error).toContain('50m를 초과');
    });
  });

  describe('calculateWorkDuration', () => {
    test('근무 시간 계산 (초 단위)', () => {
      const checkIn = new Date('2025-01-16T09:00:00');
      const checkOut = new Date('2025-01-16T18:00:00');

      const duration = calculateWorkDuration(checkIn, checkOut);

      expect(duration).toBe(9 * 60 * 60); // 9시간 = 32400초
    });

    test('휴게 시간 제외 계산', () => {
      const checkIn = new Date('2025-01-16T09:00:00');
      const checkOut = new Date('2025-01-16T18:00:00');
      const breakTime = 60 * 60; // 1시간 휴게

      const duration = calculateWorkDuration(checkIn, checkOut, breakTime);

      expect(duration).toBe(8 * 60 * 60); // 8시간
    });

    test('잘못된 시간 순서', () => {
      const checkIn = new Date('2025-01-16T18:00:00');
      const checkOut = new Date('2025-01-16T09:00:00');

      expect(() => calculateWorkDuration(checkIn, checkOut))
        .toThrow('체크아웃 시간이 체크인 시간보다 이전입니다');
    });
  });

  describe('Performance', () => {
    test('체크인 처리는 100ms 이내', async () => {
      const start = Date.now();

      await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: testLocation,
        method: 'gps'
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});