/**
 * T076: Jest 설정 - attendance-lib
 * 실제 PostgreSQL과 Redis 사용, Mock 없음
 */

module.exports = {
  displayName: 'attendance-lib',
  testEnvironment: 'node',

  // 테스트 파일 위치
  testMatch: [
    '**/*.test.js',
    '**/tests/**/*.test.js'
  ],

  // 커버리지 설정
  collectCoverageFrom: [
    '**/*.js',
    '!jest.config.js',
    '!cli.js',
    '!**/tests/**',
    '!**/node_modules/**'
  ],

  // 커버리지 임계값
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // 테스트 환경 설정
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // 테스트 타임아웃 (GPS 계산, QR 생성 등)
  testTimeout: 10000,

  // 상세 출력
  verbose: true
};