/**
 * T077: GPS 거리 계산 모듈 테스트 (RED phase)
 * Haversine 공식 기반 거리 계산 검증
 */

const {
  calculateDistance,
  isWithinRadius,
  validateCoordinates,
  toRadians
} = require('./gps');

describe('GPS Module', () => {

  describe('calculateDistance', () => {
    test('같은 위치는 0m를 반환해야 함', () => {
      const pos1 = { lat: 37.5665, lng: 126.9780 }; // 서울시청
      const pos2 = { lat: 37.5665, lng: 126.9780 };

      const distance = calculateDistance(pos1, pos2);
      expect(distance).toBe(0);
    });

    test('서울시청과 강남역 거리 계산 (약 8.8km)', () => {
      const 서울시청 = { lat: 37.5665, lng: 126.9780 };
      const 강남역 = { lat: 37.4979, lng: 127.0276 };

      const distance = calculateDistance(서울시청, 강남역);
      // 실제 거리는 약 8.8km (8800m)
      expect(distance).toBeGreaterThan(8700);
      expect(distance).toBeLessThan(8900);
    });

    test('1도 차이는 약 111km', () => {
      const pos1 = { lat: 37.0, lng: 127.0 };
      const pos2 = { lat: 38.0, lng: 127.0 };

      const distance = calculateDistance(pos1, pos2);
      // 위도 1도 차이는 약 111km
      expect(distance).toBeGreaterThan(110000);
      expect(distance).toBeLessThan(112000);
    });

    test('매우 가까운 거리 정확도 (1m 이내)', () => {
      const pos1 = { lat: 37.5665000, lng: 126.9780000 };
      const pos2 = { lat: 37.5665010, lng: 126.9780000 };

      const distance = calculateDistance(pos1, pos2);
      // 위도 0.000001도는 약 0.11m
      expect(distance).toBeGreaterThan(0.1);
      expect(distance).toBeLessThan(2);
    });

    test('null 또는 undefined 처리', () => {
      expect(() => calculateDistance(null, { lat: 37, lng: 127 }))
        .toThrow('Invalid coordinates');

      expect(() => calculateDistance({ lat: 37, lng: 127 }, undefined))
        .toThrow('Invalid coordinates');
    });
  });

  describe('isWithinRadius', () => {
    test('50m 반경 내 판정', () => {
      const 사업장 = { lat: 37.5665, lng: 126.9780 };
      const 근처 = { lat: 37.5668, lng: 126.9783 }; // 약 40m

      expect(isWithinRadius(사업장, 근처, 50)).toBe(true);
      expect(isWithinRadius(사업장, 근처, 30)).toBe(false);
    });

    test('정확히 반경 경계선', () => {
      const center = { lat: 37.5665, lng: 126.9780 };
      const boundary = { lat: 37.56695, lng: 126.9780 }; // 정확히 50m

      const distance = calculateDistance(center, boundary);
      expect(isWithinRadius(center, boundary, distance)).toBe(true);
      expect(isWithinRadius(center, boundary, distance - 0.1)).toBe(false);
    });

    test('0m 반경 (같은 위치만 허용)', () => {
      const pos = { lat: 37.5665, lng: 126.9780 };

      expect(isWithinRadius(pos, pos, 0)).toBe(true);
      expect(isWithinRadius(pos, { lat: 37.5665001, lng: 126.9780 }, 0)).toBe(false);
    });

    test('음수 반경 처리', () => {
      const pos1 = { lat: 37.5665, lng: 126.9780 };
      const pos2 = { lat: 37.5665, lng: 126.9780 };

      expect(() => isWithinRadius(pos1, pos2, -10))
        .toThrow('Radius must be non-negative');
    });
  });

  describe('validateCoordinates', () => {
    test('유효한 좌표', () => {
      expect(validateCoordinates(37.5665, 126.9780)).toBe(true);
      expect(validateCoordinates(0, 0)).toBe(true); // 적도/본초자오선
      expect(validateCoordinates(-90, 180)).toBe(true); // 남극점
      expect(validateCoordinates(90, -180)).toBe(true); // 북극점
    });

    test('유효하지 않은 위도', () => {
      expect(validateCoordinates(91, 0)).toBe(false);
      expect(validateCoordinates(-91, 0)).toBe(false);
      expect(validateCoordinates(180, 0)).toBe(false);
    });

    test('유효하지 않은 경도', () => {
      expect(validateCoordinates(0, 181)).toBe(false);
      expect(validateCoordinates(0, -181)).toBe(false);
      expect(validateCoordinates(0, 360)).toBe(false);
    });

    test('숫자가 아닌 값', () => {
      expect(validateCoordinates('37', 127)).toBe(false);
      expect(validateCoordinates(37, '127')).toBe(false);
      expect(validateCoordinates(null, 127)).toBe(false);
      expect(validateCoordinates(37, undefined)).toBe(false);
      expect(validateCoordinates(NaN, 127)).toBe(false);
    });
  });

  describe('toRadians', () => {
    test('도를 라디안으로 변환', () => {
      expect(toRadians(0)).toBe(0);
      expect(toRadians(90)).toBeCloseTo(Math.PI / 2);
      expect(toRadians(180)).toBeCloseTo(Math.PI);
      expect(toRadians(360)).toBeCloseTo(2 * Math.PI);
      expect(toRadians(-180)).toBeCloseTo(-Math.PI);
    });
  });

  describe('Performance', () => {
    test('거리 계산은 1ms 이내여야 함', () => {
      const pos1 = { lat: 37.5665, lng: 126.9780 };
      const pos2 = { lat: 37.4979, lng: 127.0276 };

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        calculateDistance(pos1, pos2);
      }
      const duration = Date.now() - start;

      // 1000번 계산이 1000ms 이내 (평균 1ms)
      expect(duration).toBeLessThan(1000);
    });
  });
});