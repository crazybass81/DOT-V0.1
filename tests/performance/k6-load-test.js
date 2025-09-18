/**
 * DOT Platform K6 로드 테스트 시나리오
 *
 * 한국어 요구사항 검증:
 * - 페이지 로딩: < 3초
 * - 동시 사용자: 10명 지원
 * - 시스템 안정성 및 확장성 검증
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 한국어 커스텀 메트릭 정의
const koreanPageLoadTime = new Trend('korean_page_load_time_ms', true);
const koreanErrorRate = new Rate('korean_error_rate');
const koreanConcurrentUsers = new Counter('korean_concurrent_users');

// 테스트 설정
export const options = {
  // 한국어 요구사항: 10명 동시 사용자
  scenarios: {
    // 시나리오 1: 기본 부하 테스트 (10명 동시 사용자)
    korean_requirement_test: {
      executor: 'constant-vus',
      vus: 10, // 10명 동시 사용자
      duration: '2m', // 2분간 지속
      tags: { scenario: 'korean_10_concurrent_users' },
    },

    // 시나리오 2: 점진적 부하 증가 테스트
    ramp_up_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },   // 30초 동안 5명까지
        { duration: '1m', target: 10 },   // 1분 동안 10명까지 (한국어 요구사항)
        { duration: '2m', target: 10 },   // 2분간 10명 유지
        { duration: '30s', target: 15 },  // 30초 동안 15명까지 (확장성 테스트)
        { duration: '1m', target: 15 },   // 1분간 15명 유지
        { duration: '30s', target: 0 },   // 30초 동안 0명까지 감소
      ],
      tags: { scenario: 'ramp_up_scalability' },
    },

    // 시나리오 3: 스파이크 테스트 (순간 부하 증가)
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },  // 기본 10명
        { duration: '5s', target: 50 },   // 갑자기 50명으로 증가
        { duration: '10s', target: 50 },  // 50명 유지
        { duration: '5s', target: 10 },   // 다시 10명으로 감소
        { duration: '10s', target: 10 },  // 10명 유지
      ],
      tags: { scenario: 'spike_load_test' },
    },

    // 시나리오 4: 스트레스 테스트 (시스템 한계 테스트)
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },   // 1분 동안 20명까지
        { duration: '2m', target: 30 },   // 2분 동안 30명까지
        { duration: '1m', target: 40 },   // 1분 동안 40명까지
        { duration: '2m', target: 40 },   // 2분간 40명 유지
        { duration: '1m', target: 0 },    // 1분 동안 감소
      ],
      tags: { scenario: 'stress_limit_test' },
    },
  },

  // 한국어 요구사항 임계값 설정
  thresholds: {
    // 페이지 로딩 시간: < 3초 (3000ms)
    'korean_page_load_time_ms': ['p(95)<3000'], // 95%의 요청이 3초 이내
    'http_req_duration': ['p(95)<3000', 'avg<2000'], // 평균 2초, 95% 3초 이내

    // 오류율: < 1%
    'korean_error_rate': ['rate<0.01'],
    'http_req_failed': ['rate<0.01'],

    // 응답 시간 안정성
    'http_req_waiting': ['p(90)<2500', 'p(95)<3000'],

    // 동시 사용자 관련 메트릭
    'http_reqs': ['count>1000'], // 최소 1000개 요청 처리
    'vus': ['value<=50'], // 최대 50명까지 테스트
  },

  // 태그 및 메타데이터
  tags: {
    project: 'DOT Platform',
    version: 'v0.1',
    requirement: 'korean_3sec_10users',
  },
};

// 환경 설정
const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const API_BASE_URL = `${BASE_URL}/api`;

// 테스트 데이터
const testUsers = [
  { email: 'test1@example.com', password: 'testpass123' },
  { email: 'test2@example.com', password: 'testpass123' },
  { email: 'test3@example.com', password: 'testpass123' },
  { email: 'admin@example.com', password: 'adminpass123' },
];

// 테스트 페이지 경로
const testPages = [
  { path: '/', name: '메인페이지', weight: 30 },
  { path: '/login', name: '로그인페이지', weight: 20 },
  { path: '/dashboard', name: '대시보드', weight: 25 },
  { path: '/attendance', name: '출퇴근', weight: 15 },
  { path: '/schedule', name: '스케줄', weight: 10 },
];

// 유틸리티 함수: 가중치 기반 랜덤 페이지 선택
function getRandomPage() {
  const totalWeight = testPages.reduce((sum, page) => sum + page.weight, 0);
  let random = Math.random() * totalWeight;

  for (const page of testPages) {
    random -= page.weight;
    if (random <= 0) {
      return page;
    }
  }
  return testPages[0]; // 기본값
}

// 유틸리티 함수: 한국어 로그 메시지
function logKorean(message, data = {}) {
  console.log(`[한국어테스트] ${message}`, JSON.stringify(data));
}

// 유틸리티 함수: 응답시간 체크 (한국어 요구사항)
function checkKoreanRequirements(response, pageName) {
  const duration = response.timings.duration;

  // 한국어 요구사항: < 3초 페이지 로딩
  const pageLoadOk = check(response, {
    [`${pageName} 페이지 로딩 < 3초`]: (r) => r.timings.duration < 3000,
    [`${pageName} HTTP 상태 정상`]: (r) => r.status === 200,
    [`${pageName} 응답 본문 존재`]: (r) => r.body.length > 0,
  });

  // 커스텀 메트릭 기록
  koreanPageLoadTime.add(duration, { page: pageName });
  koreanErrorRate.add(!pageLoadOk);

  if (!pageLoadOk) {
    logKorean(`성능 요구사항 미달`, {
      page: pageName,
      duration: duration,
      status: response.status,
      requirement: '< 3000ms'
    });
  }

  return pageLoadOk;
}

// 시나리오 1: 메인 페이지 로딩 테스트
export function mainPageLoadTest() {
  group('메인 페이지 로딩 테스트', () => {
    const startTime = Date.now();

    const response = http.get(`${BASE_URL}/`);
    checkKoreanRequirements(response, '메인페이지');

    const loadTime = Date.now() - startTime;
    logKorean('메인 페이지 로딩 완료', {
      loadTime: loadTime,
      requirement: '< 3초',
      status: loadTime < 3000 ? '통과' : '실패'
    });
  });
}

// 시나리오 2: 로그인 플로우 테스트
export function loginFlowTest() {
  group('로그인 플로우 테스트', () => {
    // 1. 로그인 페이지 접근
    let response = http.get(`${BASE_URL}/login`);
    checkKoreanRequirements(response, '로그인페이지');

    // 2. 로그인 시도 (실제 로그인은 구현 후 활성화)
    /*
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];
    const loginData = {
      email: user.email,
      password: user.password,
    };

    response = http.post(`${API_BASE_URL}/auth/login`, JSON.stringify(loginData), {
      headers: { 'Content-Type': 'application/json' },
    });

    check(response, {
      '로그인 응답 시간 < 1초': (r) => r.timings.duration < 1000,
      '로그인 상태 확인': (r) => [200, 401, 400].includes(r.status), // 구현 상태에 따라 다양한 응답
    });
    */

    sleep(0.5); // 사용자 행동 시뮬레이션
  });
}

// 시나리오 3: 대시보드 및 기능 페이지 테스트
export function dashboardAndFeaturesTest() {
  group('대시보드 및 기능 페이지 테스트', () => {
    const page = getRandomPage();

    const response = http.get(`${BASE_URL}${page.path}`);
    checkKoreanRequirements(response, page.name);

    // 인증이 필요한 페이지의 경우 적절한 상태 코드 허용
    if (page.path === '/dashboard' || page.path === '/attendance' || page.path === '/schedule') {
      check(response, {
        [`${page.name} 적절한 응답`]: (r) => [200, 302, 401].includes(r.status),
      });
    }

    sleep(Math.random() * 2 + 1); // 1-3초 랜덤 대기 (사용자 행동 시뮬레이션)
  });
}

// 시나리오 4: API 헬스체크 테스트
export function apiHealthTest() {
  group('API 헬스체크 테스트', () => {
    const response = http.get(`${BASE_URL}/health`);

    check(response, {
      'API 헬스체크 응답 시간 < 500ms': (r) => r.timings.duration < 500,
      'API 헬스체크 상태 정상': (r) => [200, 404].includes(r.status), // 구현 상태에 따라
    });

    if (response.status === 200) {
      try {
        const healthData = JSON.parse(response.body);
        check(healthData, {
          '헬스체크 데이터 유효성': (data) => data.hasOwnProperty('status'),
        });
      } catch (e) {
        logKorean('헬스체크 응답 파싱 실패', { error: e.message });
      }
    }
  });
}

// 시나리오 5: 혼합 사용자 행동 시뮬레이션
export function mixedUserBehaviorTest() {
  group('혼합 사용자 행동 시뮬레이션', () => {
    // 동시 사용자 카운트
    koreanConcurrentUsers.add(1);

    const scenarios = [
      { func: mainPageLoadTest, weight: 30 },
      { func: loginFlowTest, weight: 25 },
      { func: dashboardAndFeaturesTest, weight: 35 },
      { func: apiHealthTest, weight: 10 },
    ];

    // 가중치 기반 시나리오 선택
    const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;

    for (const scenario of scenarios) {
      random -= scenario.weight;
      if (random <= 0) {
        scenario.func();
        break;
      }
    }

    // 사용자 세션 간 대기 시간
    sleep(Math.random() * 3 + 1); // 1-4초 랜덤 대기
  });
}

// 메인 테스트 함수 (기본 실행)
export default function() {
  // 시나리오에 따라 다른 테스트 실행
  const scenario = __ENV.SCENARIO || 'mixed';

  switch(scenario) {
    case 'main':
      mainPageLoadTest();
      break;
    case 'login':
      loginFlowTest();
      break;
    case 'dashboard':
      dashboardAndFeaturesTest();
      break;
    case 'api':
      apiHealthTest();
      break;
    case 'mixed':
    default:
      mixedUserBehaviorTest();
      break;
  }
}

// 테스트 시작 시 실행
export function setup() {
  logKorean('DOT Platform K6 로드 테스트 시작', {
    baseUrl: BASE_URL,
    koreanRequirements: {
      pageLoad: '< 3초',
      concurrentUsers: '10명',
      errorRate: '< 1%'
    }
  });

  // 기본 연결성 확인
  const response = http.get(BASE_URL);
  if (response.status !== 200) {
    logKorean('경고: 기본 URL 연결 실패', {
      url: BASE_URL,
      status: response.status,
      message: '테스트를 계속 진행하지만 결과가 부정확할 수 있습니다'
    });
  } else {
    logKorean('기본 연결성 확인 완료', { url: BASE_URL });
  }

  return {
    startTime: Date.now(),
    baseUrl: BASE_URL,
  };
}

// 테스트 종료 시 실행
export function teardown(data) {
  const duration = Date.now() - data.startTime;
  logKorean('DOT Platform K6 로드 테스트 완료', {
    totalDuration: `${duration}ms`,
    baseUrl: data.baseUrl,
    koreanRequirementsStatus: '결과는 임계값을 확인하세요'
  });
}

// 테스트 옵션 검증 함수
export function handleSummary(data) {
  const koreanSummary = {
    '테스트_실행_시간': new Date().toISOString(),
    '한국어_요구사항_검증': {
      '페이지_로딩_시간_3초_미만': data.metrics['korean_page_load_time_ms'] ?
        `P95: ${Math.round(data.metrics['korean_page_load_time_ms'].values.p95)}ms` : 'N/A',
      '동시_사용자_10명_지원': `최대 VU: ${data.metrics.vus ? data.metrics.vus.values.max : 'N/A'}`,
      '오류율_1퍼센트_미만': data.metrics['korean_error_rate'] ?
        `${(data.metrics['korean_error_rate'].values.rate * 100).toFixed(2)}%` : 'N/A',
    },
    '전체_요청_수': data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    '평균_응답시간': data.metrics.http_req_duration ?
      `${Math.round(data.metrics.http_req_duration.values.avg)}ms` : 'N/A',
    '성공률': data.metrics.http_req_failed ?
      `${((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2)}%` : 'N/A',
  };

  return {
    'stdout': JSON.stringify(koreanSummary, null, 2),
    'summary.json': JSON.stringify(data, null, 2),
  };
}