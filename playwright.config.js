/**
 * T126: Playwright 설치 및 초기 설정
 * DOT Platform E2E 테스트 설정
 * 실제 브라우저 환경에서 사용자 시나리오 검증
 */

const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright 테스트 설정
 * 한글 주석: 테스트 환경 및 브라우저 설정
 */
module.exports = defineConfig({
  // 테스트 파일 위치
  testDir: './tests/e2e',

  // 병렬 실행 설정 (성능 향상)
  fullyParallel: true,

  // 테스트 실패 시 재시도 (CI 환경에서만)
  retries: process.env.CI ? 2 : 0,

  // 병렬 워커 수 (CPU 코어에 따라 조정)
  workers: process.env.CI ? 1 : undefined,

  // 테스트 리포터 설정
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }]
  ],

  // 글로벌 설정
  use: {
    // 기본 URL (환경별 설정)
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',

    // 브라우저 옵션
    headless: process.env.CI ? true : false,
    viewport: { width: 1280, height: 720 },

    // 타임아웃 설정
    actionTimeout: 10000,
    navigationTimeout: 30000,

    // 스크린샷 및 비디오 설정
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // 한국 로케일 설정
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',

    // 추가 컨텍스트 옵션
    ignoreHTTPSErrors: true,
    acceptDownloads: true
  },

  // 테스트 프로젝트 설정 (브라우저별)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },

    // 모바일 테스트
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] }
    }
  ],

  // 테스트 전 서버 시작 설정
  webServer: [
    {
      command: 'cd backend && npm start',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: 'cd frontend && npm start',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    }
  ],

  // 출력 디렉토리
  outputDir: 'test-results/e2e-artifacts',

  // 글로벌 설정 및 정리
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown'),

  // 테스트 타임아웃 (전체)
  timeout: 30000,

  // expect 타임아웃
  expect: {
    timeout: 5000
  },

  // 테스트 메타데이터
  metadata: {
    project: 'DOT Platform',
    version: '0.1.0',
    description: 'E2E 테스트 - 식음료 사업 운영 관리 시스템'
  },

  // 환경별 설정 오버라이드
  ...(process.env.NODE_ENV === 'production' && {
    retries: 3,
    workers: 2,
    use: {
      ...module.exports.use,
      baseURL: process.env.PROD_URL || 'https://dot-platform.com'
    }
  })
});