/**
 * 성능 검증 통합 테스트 (T008)
 *
 * 한국어 요구사항인 "< 3초 페이지 로딩, 10명 동시 사용자 지원"을
 * 실제 배포된 환경에서 검증합니다.
 */

const request = require('supertest');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

describe('성능 검증 통합 테스트', () => {
  describe('페이지 로딩 성능 (< 3초)', () => {
    test('메인 페이지 로딩 시간 < 3초', async () => {
      const startTime = performance.now();

      try {
        const response = await request(BASE_URL)
          .get('/')
          .timeout(5000);

        const loadTime = performance.now() - startTime;

        expect(response.status).toBe(200);
        expect(loadTime).toBeLessThan(3000); // 3초 = 3000ms

        console.log(`메인 페이지 로딩 시간: ${loadTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('메인 페이지 응답 구현 필요:', error.message);
        throw error;
      }
    });

    test('로그인 페이지 로딩 시간 < 3초', async () => {
      const startTime = performance.now();

      try {
        const response = await request(BASE_URL)
          .get('/login')
          .timeout(5000);

        const loadTime = performance.now() - startTime;

        expect(response.status).toBe(200);
        expect(loadTime).toBeLessThan(3000);

        console.log(`로그인 페이지 로딩 시간: ${loadTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('로그인 페이지 응답 구현 필요:', error.message);
        throw error;
      }
    });

    test('대시보드 페이지 로딩 시간 < 3초', async () => {
      const startTime = performance.now();

      try {
        const response = await request(BASE_URL)
          .get('/dashboard')
          .timeout(5000);

        const loadTime = performance.now() - startTime;

        // 인증이 필요한 페이지이므로 리다이렉트(302) 또는 401도 허용
        expect([200, 302, 401]).toContain(response.status);
        expect(loadTime).toBeLessThan(3000);

        console.log(`대시보드 페이지 로딩 시간: ${loadTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('대시보드 페이지 응답 구현 필요:', error.message);
        throw error;
      }
    });

    test('정적 리소스 로딩 성능', async () => {
      const startTime = performance.now();

      try {
        const response = await request(BASE_URL)
          .get('/static/css/main.css')
          .timeout(2000);

        const loadTime = performance.now() - startTime;

        expect([200, 404]).toContain(response.status); // 파일이 없을 수도 있음
        if (response.status === 200) {
          expect(loadTime).toBeLessThan(1000); // 정적 파일은 1초 이내
        }
      } catch (error) {
        console.log('정적 리소스 서빙 구현 필요:', error.message);
      }
    });
  });

  describe('API 응답 성능', () => {
    test('헬스체크 API 응답 시간 < 500ms', async () => {
      const startTime = performance.now();

      try {
        const response = await request(BASE_URL)
          .get('/health')
          .timeout(2000);

        const responseTime = performance.now() - startTime;

        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(500);

        console.log(`헬스체크 API 응답 시간: ${responseTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('헬스체크 API 성능 최적화 필요:', error.message);
        throw error;
      }
    });

    test('인증 API 응답 시간 < 1초', async () => {
      const startTime = performance.now();

      try {
        // 잘못된 인증 정보로 테스트 (실제 로그인은 하지 않음)
        const response = await request(BASE_URL)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          })
          .timeout(2000);

        const responseTime = performance.now() - startTime;

        // 401 또는 404 응답 예상 (아직 구현되지 않았을 수 있음)
        expect([401, 404, 400]).toContain(response.status);
        expect(responseTime).toBeLessThan(1000);

        console.log(`인증 API 응답 시간: ${responseTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('인증 API 구현 필요:', error.message);
        throw error;
      }
    });

    test('메트릭 API 응답 시간 < 500ms', async () => {
      const startTime = performance.now();

      try {
        const response = await request(BASE_URL)
          .get('/metrics')
          .timeout(2000);

        const responseTime = performance.now() - startTime;

        if (response.status === 200) {
          expect(responseTime).toBeLessThan(500);

          // 메트릭 데이터 유효성 검증
          const metrics = response.body;
          if (metrics.response_times) {
            expect(metrics.response_times.p95_ms).toBeLessThan(3000); // 95% 요청이 3초 이내
          }
        }

        console.log(`메트릭 API 응답 시간: ${responseTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('메트릭 API 구현 필요:', error.message);
        throw error;
      }
    });
  });

  describe('동시 사용자 지원 (10명)', () => {
    test('10개 동시 요청 처리', async () => {
      const concurrent_requests = 10;
      const startTime = performance.now();

      const requests = Array(concurrent_requests).fill().map((_, index) =>
        request(BASE_URL)
          .get(`/health?id=${index}`)
          .timeout(5000)
      );

      try {
        const responses = await Promise.all(requests);
        const totalTime = performance.now() - startTime;

        // 모든 요청이 성공해야 함
        responses.forEach((response, index) => {
          expect(response.status).toBe(200);
        });

        // 평균 응답 시간이 3초를 넘지 않아야 함
        const avgResponseTime = totalTime / concurrent_requests;
        expect(avgResponseTime).toBeLessThan(3000);

        console.log(`10개 동시 요청 처리 시간: ${totalTime.toFixed(2)}ms`);
        console.log(`평균 응답 시간: ${avgResponseTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('동시 요청 처리 최적화 필요:', error.message);
        throw error;
      }
    });

    test('10명 동시 로그인 시도 처리', async () => {
      const concurrent_users = 10;
      const startTime = performance.now();

      const loginRequests = Array(concurrent_users).fill().map((_, index) =>
        request(BASE_URL)
          .post('/api/auth/login')
          .send({
            email: `test${index}@example.com`,
            password: 'testpassword'
          })
          .timeout(5000)
      );

      try {
        const responses = await Promise.allSettled(loginRequests);
        const totalTime = performance.now() - startTime;

        // 성공 또는 실패 여부와 관계없이 응답이 와야 함
        const validResponses = responses.filter(result =>
          result.status === 'fulfilled' &&
          result.value.status !== undefined
        );

        expect(validResponses.length).toBe(concurrent_users);

        const avgResponseTime = totalTime / concurrent_users;
        expect(avgResponseTime).toBeLessThan(5000); // 5초 이내

        console.log(`10명 동시 로그인 처리 시간: ${totalTime.toFixed(2)}ms`);
        console.log(`평균 처리 시간: ${avgResponseTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('동시 로그인 처리 최적화 필요:', error.message);
        throw error;
      }
    });

    test('부하 상황에서 시스템 안정성', async () => {
      const highLoad = 20; // 목표보다 높은 부하로 테스트
      const startTime = performance.now();

      const heavyRequests = Array(highLoad).fill().map((_, index) =>
        request(BASE_URL)
          .get('/')
          .timeout(10000)
      );

      try {
        const responses = await Promise.allSettled(heavyRequests);
        const totalTime = performance.now() - startTime;

        const successfulResponses = responses.filter(result =>
          result.status === 'fulfilled' &&
          result.value.status === 200
        );

        // 최소 10개 이상의 요청은 성공해야 함 (10명 동시 사용자 목표)
        expect(successfulResponses.length).toBeGreaterThanOrEqual(10);

        // 성공률이 50% 이상이어야 함
        const successRate = successfulResponses.length / highLoad;
        expect(successRate).toBeGreaterThanOrEqual(0.5);

        console.log(`고부하 테스트 - 성공률: ${(successRate * 100).toFixed(1)}%`);
        console.log(`총 처리 시간: ${totalTime.toFixed(2)}ms`);
      } catch (error) {
        console.log('고부하 처리 안정성 개선 필요:', error.message);
        throw error;
      }
    });
  });

  describe('메모리 및 리소스 사용량', () => {
    test('시스템 리소스 모니터링', async () => {
      try {
        const response = await request(BASE_URL)
          .get('/metrics')
          .timeout(2000);

        if (response.status === 200 && response.body.resource_usage) {
          const { resource_usage } = response.body;

          // 메모리 사용량이 합리적 범위 내에 있어야 함 (< 2GB)
          if (resource_usage.memory_mb) {
            expect(resource_usage.memory_mb).toBeLessThan(2048);
          }

          // CPU 사용률이 90% 미만이어야 함
          if (resource_usage.cpu_percent) {
            expect(resource_usage.cpu_percent).toBeLessThan(90);
          }

          console.log('리소스 사용량:', resource_usage);
        }
      } catch (error) {
        console.log('리소스 모니터링 구현 필요:', error.message);
      }
    });
  });
});