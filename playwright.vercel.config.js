/**
 * Vercel 배포 전용 Playwright 설정
 * 데이터베이스 의존성 없이 프론트엔드 배포만 테스트
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // 테스트 파일 위치
  testDir: './tests/e2e',
  testMatch: '**/vercel-deployment.test.js',

  // 병렬 실행 설정
  fullyParallel: true,

  // 테스트 실패 시 재시도
  retries: 1,

  // 병렬 워커 수
  workers: 1,

  // 테스트 리포터 설정
  reporter: [
    ['list'],
    ['html', { outputDir: 'test-results/vercel-html-report' }]
  ],

  // 글로벌 설정
  use: {
    // Vercel URL 테스트를 위한 기본 설정
    headless: true, // 헤드리스 모드 (서버 환경)
    viewport: { width: 1280, height: 720 },

    // 타임아웃 설정
    actionTimeout: 15000,
    navigationTimeout: 45000,

    // 스크린샷 및 비디오 설정
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // 한국 로케일 설정
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',

    // 추가 옵션
    ignoreHTTPSErrors: true,
    acceptDownloads: true
  },

  // 테스트 프로젝트 설정 (Chrome만 사용)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  // 출력 디렉토리
  outputDir: 'test-results/vercel-artifacts',

  // 글로벌 설정 제거 (데이터베이스 의존성 제거)
  // globalSetup: undefined,
  // globalTeardown: undefined,

  // 테스트 타임아웃
  timeout: 60000,

  // expect 타임아웃
  expect: {
    timeout: 10000
  },

  // 테스트 메타데이터
  metadata: {
    project: 'DOT Platform Vercel Deployment',
    version: '0.1.0',
    description: 'Vercel 배포 상태 검증 테스트'
  }
});