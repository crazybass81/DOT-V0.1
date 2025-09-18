/**
 * k6 부하 테스트 스크립트
 * DOT Platform API 성능 테스트
 *
 * 실행 방법:
 * k6 run tests/load/k6-script.js
 * k6 run --vus 100 --duration 30s tests/load/k6-script.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// 환경 변수 설정
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/v1`;

// 커스텀 메트릭 정의
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const attendanceDuration = new Trend('attendance_duration');
const scheduleDuration = new Trend('schedule_duration');

// 테스트 시나리오 설정
export const options = {
  // 단계별 부하 증가
  stages: [
    { duration: '2m', target: 50 },   // 워밍업: 2분간 50명까지 증가
    { duration: '5m', target: 100 },  // 부하 증가: 5분간 100명까지
    { duration: '10m', target: 200 }, // 피크 부하: 10분간 200명 유지
    { duration: '5m', target: 500 },  // 스트레스: 5분간 500명까지
    { duration: '2m', target: 0 },    // 쿨다운: 2분간 0명으로 감소
  ],

  // 성능 목표 (SLA)
  thresholds: {
    // API 응답시간 목표
    http_req_duration: [
      'p(95)<500',  // 95%의 요청이 500ms 이내
      'p(99)<1000', // 99%의 요청이 1초 이내
    ],
    // 오류율 목표
    errors: ['rate<0.05'], // 5% 미만 오류율
    // 처리량 목표
    http_reqs: ['rate>100'], // 초당 100개 이상 요청 처리
    // 개별 API 목표
    login_duration: ['p(95)<300'],
    attendance_duration: ['p(95)<200'],
    schedule_duration: ['p(95)<400'],
  },

  // 테스트 설정
  noConnectionReuse: false,
  userAgent: 'K6LoadTest/1.0',
};

// 테스트 데이터 생성
function generateUser() {
  return {
    email: `user_${randomString(8)}@test.com`,
    password: 'Test123!@#',
    name: `Test User ${randomIntBetween(1, 1000)}`,
    phone: `010-${randomIntBetween(1000, 9999)}-${randomIntBetween(1000, 9999)}`,
  };
}

// Setup: 테스트 시작 전 실행
export function setup() {
  console.log('부하 테스트 시작...');

  // 테스트용 관리자 계정 생성
  const adminUser = {
    email: 'admin@loadtest.com',
    password: 'Admin123!@#',
    name: 'Load Test Admin',
    role: 'admin'
  };

  const res = http.post(`${API_URL}/auth/register`, JSON.stringify(adminUser), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 201 || res.status === 409) {
    console.log('테스트 환경 준비 완료');
  }

  return { adminUser };
}

// 메인 테스트 시나리오
export default function (data) {
  const user = generateUser();
  let authToken = null;
  let userId = null;

  // 시나리오 1: 회원가입 및 로그인
  group('인증 플로우', () => {
    // 회원가입
    const signupRes = http.post(`${API_URL}/auth/register`, JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'signup' },
    });

    const signupSuccess = check(signupRes, {
      '회원가입 성공': (r) => r.status === 201 || r.status === 409,
      '응답 시간 < 500ms': (r) => r.timings.duration < 500,
    });

    if (!signupSuccess) {
      errorRate.add(1);
    }

    sleep(1); // 사용자 행동 시뮬레이션

    // 로그인
    const loginStart = new Date();
    const loginRes = http.post(`${API_URL}/auth/login`, JSON.stringify({
      email: user.email,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
    });

    loginDuration.add(new Date() - loginStart);

    const loginSuccess = check(loginRes, {
      '로그인 성공': (r) => r.status === 200,
      'JWT 토큰 수신': (r) => {
        const body = JSON.parse(r.body || '{}');
        return body.data && body.data.accessToken;
      },
    });

    if (loginSuccess) {
      const body = JSON.parse(loginRes.body);
      authToken = body.data.accessToken;
      userId = body.data.user.id;
    } else {
      errorRate.add(1);
      return; // 로그인 실패 시 종료
    }
  });

  sleep(randomIntBetween(1, 3));

  // 시나리오 2: 출퇴근 체크
  if (authToken) {
    group('출퇴근 관리', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      };

      // GPS 출근 체크인
      const checkinStart = new Date();
      const checkinRes = http.post(`${API_URL}/attendance/checkin/gps`, JSON.stringify({
        latitude: 37.5665 + (Math.random() * 0.001),
        longitude: 126.9780 + (Math.random() * 0.001),
        accuracy: 10,
      }), {
        headers: headers,
        tags: { name: 'checkin' },
      });

      attendanceDuration.add(new Date() - checkinStart);

      const checkinSuccess = check(checkinRes, {
        '출근 체크인 성공': (r) => r.status === 200 || r.status === 201,
        '응답 시간 < 300ms': (r) => r.timings.duration < 300,
      });

      if (!checkinSuccess) {
        errorRate.add(1);
      }

      sleep(randomIntBetween(2, 5));

      // 출퇴근 기록 조회
      const historyRes = http.get(`${API_URL}/attendance/history?page=1&limit=10`, {
        headers: headers,
        tags: { name: 'attendance_history' },
      });

      check(historyRes, {
        '출퇴근 기록 조회 성공': (r) => r.status === 200,
        '데이터 포함': (r) => {
          const body = JSON.parse(r.body || '{}');
          return body.data && Array.isArray(body.data.records);
        },
      });
    });
  }

  sleep(randomIntBetween(1, 3));

  // 시나리오 3: 스케줄 조회
  if (authToken) {
    group('스케줄 관리', () => {
      const headers = {
        'Authorization': `Bearer ${authToken}`,
      };

      // 주간 스케줄 조회
      const scheduleStart = new Date();
      const scheduleRes = http.get(`${API_URL}/schedules/weekly`, {
        headers: headers,
        tags: { name: 'weekly_schedule' },
      });

      scheduleDuration.add(new Date() - scheduleStart);

      const scheduleSuccess = check(scheduleRes, {
        '스케줄 조회 성공': (r) => r.status === 200,
        '응답 시간 < 400ms': (r) => r.timings.duration < 400,
      });

      if (!scheduleSuccess) {
        errorRate.add(1);
      }

      // 팀 스케줄 조회
      const teamScheduleRes = http.get(`${API_URL}/schedules/team`, {
        headers: headers,
        tags: { name: 'team_schedule' },
      });

      check(teamScheduleRes, {
        '팀 스케줄 조회 성공': (r) => r.status === 200,
      });
    });
  }

  sleep(randomIntBetween(2, 5));

  // 시나리오 4: 급여 조회 (간헐적)
  if (authToken && Math.random() > 0.7) {
    group('급여 관리', () => {
      const headers = {
        'Authorization': `Bearer ${authToken}`,
      };

      // 급여 명세서 조회
      const payrollRes = http.get(`${API_URL}/payroll/statements/current`, {
        headers: headers,
        tags: { name: 'payroll_statement' },
      });

      check(payrollRes, {
        '급여 명세서 조회': (r) => r.status === 200 || r.status === 404,
      });
    });
  }

  // 시나리오 5: 동시 접속 부하
  if (Math.random() > 0.9) {
    group('동시 접속 테스트', () => {
      const batch = http.batch([
        ['GET', `${API_URL}/health`, null, { tags: { name: 'health' } }],
        ['GET', `${API_URL}/stats/dashboard`, null, {
          headers: { 'Authorization': `Bearer ${authToken}` },
          tags: { name: 'dashboard' }
        }],
      ]);

      check(batch[0], {
        '헬스체크 성공': (r) => r.status === 200,
      });
    });
  }

  sleep(randomIntBetween(3, 10)); // 사용자 간 요청 간격
}

// Teardown: 테스트 종료 후 실행
export function teardown(data) {
  console.log('부하 테스트 완료');

  // 테스트 결과 요약
  console.log(`
    ===== 테스트 결과 요약 =====
    실행 시간: ${new Date().toISOString()}
    기본 URL: ${BASE_URL}

    주요 메트릭:
    - 오류율: ${errorRate.rate}
    - 평균 로그인 시간: ${loginDuration.avg}ms
    - 평균 출퇴근 체크 시간: ${attendanceDuration.avg}ms
    - 평균 스케줄 조회 시간: ${scheduleDuration.avg}ms
  `);
}

// 부하 패턴 시뮬레이션 함수들
export function simulateMorningRush() {
  // 아침 출근 시간 시뮬레이션 (07:00 - 09:00)
  // 짧은 시간에 많은 사용자가 체크인
  return {
    executor: 'ramping-arrival-rate',
    startRate: 10,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 500,
    stages: [
      { target: 200, duration: '30s' }, // 급격한 증가
      { target: 200, duration: '2m' },  // 피크 유지
      { target: 20, duration: '30s' },  // 급격한 감소
    ],
  };
}

export function simulateLunchBreak() {
  // 점심 시간 시뮬레이션 (11:30 - 13:30)
  // 중간 정도의 부하가 지속적으로 유지
  return {
    executor: 'constant-arrival-rate',
    rate: 50,
    timeUnit: '1s',
    duration: '5m',
    preAllocatedVUs: 100,
    maxVUs: 200,
  };
}

export function simulateEndOfDay() {
  // 퇴근 시간 시뮬레이션 (17:00 - 19:00)
  // 출근 시간과 유사하지만 더 분산된 패턴
  return {
    executor: 'ramping-arrival-rate',
    startRate: 10,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 300,
    stages: [
      { target: 100, duration: '1m' },
      { target: 150, duration: '2m' },
      { target: 100, duration: '1m' },
      { target: 30, duration: '1m' },
    ],
  };
}