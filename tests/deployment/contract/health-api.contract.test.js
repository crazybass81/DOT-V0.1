/**
 * 헬스체크 API 계약 테스트
 *
 * 이 테스트는 DOT Platform의 헬스체크 엔드포인트들이
 * specs/003-/contracts/health-api.yaml에 정의된 계약을 준수하는지 검증합니다.
 *
 * TDD: 이 테스트는 실제 구현 전에 작성되었으며, 초기에는 실패해야 합니다.
 */

const request = require('supertest');

// 프로덕션 환경에서는 실제 서버 URL 사용
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';
const API_BASE = `${BASE_URL}`;

describe('헬스체크 API 계약 테스트', () => {
  let server;

  beforeAll(async () => {
    // 프로덕션 환경에서는 실제 서버 사용
    if (process.env.NODE_ENV === 'production') {
      console.log('프로덕션 환경에서 API 계약 테스트 실행:', BASE_URL);
      server = API_BASE;
    } else {
      // 개발 환경에서는 테스트 서버 설정 (구현 시)
      server = API_BASE;
    }
  });

  describe('GET /health - 전체 시스템 헬스체크', () => {
    test('정상 상태일 때 200 응답과 올바른 스키마 반환', async () => {
      const response = await request(server)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      // 응답 스키마 검증 (health-api.yaml 기준)
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime_seconds');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('checks');

      // status 필드 검증
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);

      // timestamp ISO 8601 형식 검증
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

      // uptime_seconds 양수 검증
      expect(response.body.uptime_seconds).toBeGreaterThanOrEqual(0);

      // version Semantic Versioning 형식 검증
      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);

      // checks 배열 검증
      expect(Array.isArray(response.body.checks)).toBe(true);

      // 각 헬스체크 항목 검증
      response.body.checks.forEach(check => {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('status');
        expect(check).toHaveProperty('response_time_ms');

        expect(['database', 'redis', 'external_api', 'file_system']).toContain(check.name);
        expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
        expect(check.response_time_ms).toBeGreaterThanOrEqual(0);
      });
    });

    test('시스템 비정상 상태일 때 503 응답', async () => {
      // 시스템이 비정상 상태인 경우를 시뮬레이션하기 위해
      // 데이터베이스나 Redis 서비스를 일시적으로 중단한 상황을 가정
      // 실제 구현에서는 mock 또는 테스트 시나리오로 처리

      // 이 테스트는 현재 구현되지 않은 상태에서는 실패할 것입니다
      try {
        const response = await request(server)
          .get('/health')
          .expect('Content-Type', /json/);

        if (response.status === 503) {
          // 비정상 상태 응답 스키마 검증
          expect(response.body).toHaveProperty('status', 'unhealthy');
          expect(response.body).toHaveProperty('checks');

          // 실패한 헬스체크가 있는지 확인
          const failedChecks = response.body.checks.filter(check =>
            check.status === 'unhealthy'
          );
          expect(failedChecks.length).toBeGreaterThan(0);
        }
      } catch (error) {
        // 헬스체크 엔드포인트가 아직 구현되지 않은 경우
        console.log('헬스체크 엔드포인트 구현 필요:', error.message);
        throw error;
      }
    });

    test('응답 시간이 허용 범위 내에 있어야 함 (< 5초)', async () => {
      const startTime = Date.now();

      try {
        await request(server)
          .get('/health')
          .timeout(5000); // 5초 타임아웃

        const responseTime = Date.now() - startTime;
        expect(responseTime).toBeLessThan(5000);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.log('서버가 실행되지 않음 - 배포 후 테스트 필요');
          throw new Error('배포 후 헬스체크 엔드포인트 구현 및 테스트 필요');
        }
        throw error;
      }
    });
  });

  describe('GET /health/live - Liveness 프로브', () => {
    test('서비스가 살아있음을 확인', async () => {
      try {
        const response = await request(server)
          .get('/health/live')
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body).toHaveProperty('status', 'alive');
        expect(response.body).toHaveProperty('timestamp');
      } catch (error) {
        console.log('Liveness 프로브 엔드포인트 구현 필요:', error.message);
        throw error;
      }
    });
  });

  describe('GET /health/ready - Readiness 프로브', () => {
    test('서비스가 트래픽을 받을 준비가 되었음을 확인', async () => {
      try {
        const response = await request(server)
          .get('/health/ready')
          .expect('Content-Type', /json/);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('status', 'ready');
          expect(response.body).toHaveProperty('ready', true);
          expect(response.body).toHaveProperty('checks');
        } else if (response.status === 503) {
          expect(response.body).toHaveProperty('status', 'not_ready');
          expect(response.body).toHaveProperty('ready', false);
        }
      } catch (error) {
        console.log('Readiness 프로브 엔드포인트 구현 필요:', error.message);
        throw error;
      }
    });
  });

  describe('GET /metrics - 시스템 메트릭', () => {
    test('시스템 성능 지표를 올바른 형식으로 반환', async () => {
      try {
        const response = await request(server)
          .get('/metrics')
          .expect('Content-Type', /json/)
          .expect(200);

        // 메트릭 응답 스키마 검증
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('response_times');
        expect(response.body).toHaveProperty('resource_usage');

        // 응답 시간 메트릭 검증
        const { response_times } = response.body;
        expect(response_times).toHaveProperty('p50_ms');
        expect(response_times).toHaveProperty('p95_ms');
        expect(response_times).toHaveProperty('p99_ms');
        expect(response_times).toHaveProperty('max_ms');

        // 백분위수 순서 검증
        expect(response_times.p50_ms).toBeLessThanOrEqual(response_times.p95_ms);
        expect(response_times.p95_ms).toBeLessThanOrEqual(response_times.p99_ms);
        expect(response_times.p99_ms).toBeLessThanOrEqual(response_times.max_ms);

        // 리소스 사용량 메트릭 검증
        const { resource_usage } = response.body;
        expect(resource_usage).toHaveProperty('memory_mb');
        expect(resource_usage).toHaveProperty('cpu_percent');

        expect(resource_usage.memory_mb).toBeGreaterThanOrEqual(0);
        expect(resource_usage.cpu_percent).toBeGreaterThanOrEqual(0);
        expect(resource_usage.cpu_percent).toBeLessThanOrEqual(100);

        // 성능 요구사항 검증 (한국어 요구사항)
        if (response.body.concurrent_users !== undefined) {
          expect(response.body.concurrent_users).toBeLessThanOrEqual(10); // 10명 동시 사용자 목표
        }

        if (response.body.error_rate !== undefined) {
          expect(response.body.error_rate).toBeLessThanOrEqual(0.05); // 5% 이하 오류율
        }
      } catch (error) {
        console.log('메트릭 엔드포인트 구현 필요:', error.message);
        throw error;
      }
    });

    test('성능 요구사항 준수 검증 (< 3초 페이지 로딩)', async () => {
      try {
        const response = await request(server)
          .get('/metrics')
          .expect('Content-Type', /json/)
          .expect(200);

        // 페이지 로딩 시간 검증 (한국어 요구사항: < 3초)
        if (response.body.response_times && response.body.response_times.p95_ms) {
          expect(response.body.response_times.p95_ms).toBeLessThan(3000); // 3초 = 3000ms
        }
      } catch (error) {
        console.log('성능 메트릭 엔드포인트 구현 필요:', error.message);
        throw error;
      }
    });
  });

  afterAll(async () => {
    // 테스트 정리
    if (server && typeof server.close === 'function') {
      await server.close();
    }
  });
});

/**
 * TDD 노트:
 *
 * 이 테스트들은 현재 헬스체크 엔드포인트가 구현되지 않은 상태에서 작성되었습니다.
 * 따라서 초기 실행 시 다음과 같은 실패들이 예상됩니다:
 *
 * 1. ECONNREFUSED: 서버가 실행되지 않음
 * 2. 404 Not Found: 헬스체크 엔드포인트가 구현되지 않음
 * 3. 잘못된 응답 스키마: 계약에 맞지 않는 응답
 *
 * 이러한 실패는 TDD의 "Red" 단계로, 정상적인 과정입니다.
 * 다음 단계에서 이 테스트들을 통과시키기 위한 구현을 진행합니다.
 */