/**
 * Jest 테스트 설정
 * 실제 데이터베이스 사용, Mock 사용 안함
 * TDD 지향 설정으로 구성
 */

module.exports = {
  // 테스트 환경 설정 - Node.js 환경에서 실행
  testEnvironment: 'node',

  // 테스트 파일 패턴 정의
  testMatch: [
    '**/tests/**/*.test.js',     // tests 디렉토리 내 모든 .test.js 파일
    '**/tests/**/*.spec.js',     // tests 디렉토리 내 모든 .spec.js 파일
    '**/__tests__/**/*.js'       // __tests__ 디렉토리 내 모든 js 파일
  ],

  // 테스트에서 제외할 경로
  testPathIgnorePatterns: [
    '/node_modules/',            // npm 패키지들
    '/dist/',                   // 빌드 결과물
    '/build/',                  // 빌드 디렉토리
    '/coverage/'                // 커버리지 보고서
  ],

  // 커버리지 수집 대상 파일들
  collectCoverageFrom: [
    'src/**/*.js',              // src 디렉토리의 모든 JS 파일
    '!src/**/*.test.js',        // 테스트 파일 제외
    '!src/**/*.spec.js',        // 스펙 파일 제외
    '!src/server.js',           // 서버 진입점 제외
    '!src/app.js',              // 앱 설정 파일 제외
    '!**/node_modules/**',      // node_modules 제외
    '!**/coverage/**',          // 커버리지 디렉토리 제외
    '!**/dist/**',              // 빌드 결과물 제외
    '!src/config/**'            // 설정 파일들 제외 (환경 변수 의존적)
  ],

  // 커버리지 리포트 형식
  coverageReporters: [
    'text',                     // 콘솔 출력
    'text-summary',             // 간단한 요약
    'html',                     // HTML 보고서
    'lcov',                     // LCOV 형식 (CI/CD용)
    'json'                      // JSON 형식
  ],

  // 커버리지 출력 디렉토리
  coverageDirectory: 'coverage',

  // 커버리지 임계값 설정 (TDD 지향으로 높은 기준 설정)
  coverageThreshold: {
    global: {
      branches: 80,             // 분기 커버리지 80% 이상
      functions: 85,            // 함수 커버리지 85% 이상
      lines: 80,                // 라인 커버리지 80% 이상
      statements: 80            // 구문 커버리지 80% 이상
    },
    // 핵심 비즈니스 로직은 더 높은 커버리지 요구
    'src/services/**/*.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    // 컨트롤러는 통합 테스트로 커버
    'src/controllers/**/*.js': {
      branches: 75,
      functions: 80,
      lines: 75,
      statements: 75
    }
  },

  // 테스트 실행 전 setup 파일들
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.js',           // 전역 테스트 설정
    '<rootDir>/tests/database-setup.js'   // 데이터베이스 테스트 설정
  ],

  // 각 테스트 파일 실행 전 실행할 파일
  setupFiles: [
    '<rootDir>/tests/env-setup.js'       // 환경변수 설정
  ],

  // 타임아웃 설정 (실제 DB 사용으로 길게 설정)
  testTimeout: 30000,                    // 30초 (DB 연결 및 쿼리 시간 고려)

  // 변환 설정 (ES6+ 문법 지원)
  transform: {
    '^.+\\.js$': 'babel-jest'            // Babel을 통한 JS 변환
  },

  // 모듈 경로 alias 설정 (import 경로 간소화)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@db/(.*)$': '<rootDir>/src/db/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },

  // 테스트 그룹별 프로젝트 설정 (병렬 실행 가능)
  projects: [
    {
      displayName: 'unit',                    // 단위 테스트
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testEnvironment: 'node',
      maxWorkers: 4                           // 단위 테스트는 빠르게 병렬 실행
    },
    {
      displayName: 'integration',             // 통합 테스트
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      maxWorkers: 2,                          // DB 리소스 고려하여 제한
      testTimeout: 60000                      // 통합 테스트는 더 긴 타임아웃
    },
    {
      displayName: 'contract',                // 계약 테스트
      testMatch: ['<rootDir>/tests/contract/**/*.test.js'],
      testEnvironment: 'node',
      maxWorkers: 2,                          // 실제 DB 사용으로 제한
      testTimeout: 45000
    },
    {
      displayName: 'e2e',                     // E2E 테스트
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
      testEnvironment: 'node',
      maxWorkers: 1,                          // 순차 실행 (전체 시스템 테스트)
      testTimeout: 120000                     // 가장 긴 타임아웃
    }
  ],

  // 상세 출력 활성화
  verbose: true,

  // 테스트 실패 시 즉시 중단하지 않음 (모든 테스트 결과 확인)
  bail: false,

  // 병렬 실행 워커 수 (CPU 코어의 50%)
  maxWorkers: '50%',

  // Mock 관련 설정 (실제 구현 사용을 위해 비활성화)
  clearMocks: false,                        // Mock을 사용하지 않으므로 정리 안함
  restoreMocks: false,                      // Mock 복원 안함
  resetMocks: false,                        // Mock 리셋 안함

  // 전역 변수 설정
  globals: {
    'NODE_ENV': 'test',                     // 테스트 환경 설정
    '__DEV__': false                        // 개발 모드 비활성화
  },

  // 테스트 실행 전/후 훅
  globalSetup: '<rootDir>/tests/global-setup.js',     // 전역 설정 (DB 초기화 등)
  globalTeardown: '<rootDir>/tests/global-teardown.js', // 전역 정리 (DB 정리 등)

  // 에러 스택 트레이스 필터 제거 (Jest 최신 버전에서 지원 안함)

  // 실행 중인 테스트 정보 출력
  notify: false,                            // 데스크톱 알림 비활성화
  notifyMode: 'failure-change',

  // 테스트 결과 캐시 (빠른 재실행을 위해)
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',

  // 느린 테스트 경고 임계값 (밀리초)
  slowTestThreshold: 5,

  // 실제 타이머 사용 (setTimeout, setInterval 등)
  fakeTimers: {
    enableGlobally: false                   // 가짜 타이머 비활성화
  },

  // 테스트 실행 순서 (실행 시간 기반 최적화)
  testSequencer: '@jest/test-sequencer',

  // 에러 보고 개선
  errorOnDeprecated: true,                  // deprecated API 사용 시 에러

  // 실제 환경과 동일한 설정 사용
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },

  // 실제 데이터베이스 사용을 위한 추가 설정
  forceExit: false,                         // 테스트 후 강제 종료하지 않음
  detectOpenHandles: true,                  // 열린 핸들 감지 (DB 연결 등)

  // 테스트 실행 시 표시할 정보
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/server.js',
    '!src/app.js',
    '!src/config/**',                       // 환경 설정 파일 제외
    '!**/node_modules/**',
    '!**/coverage/**'
  ],

  // 실제 DB 연결을 위한 추가 타임아웃
  roots: ['<rootDir>/src', '<rootDir>/tests'],

  // 테스트 환경별 설정
  testEnvironment: 'node',
  testRunner: 'jest-circus/runner'          // 최신 테스트 러너 사용
};