module.exports = {
  // React 테스트 환경
  testEnvironment: 'jsdom',

  // Create React App 설정 확장
  roots: ['<rootDir>/src'],

  // 테스트 파일 패턴
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx}'
  ],

  // 변환 설정
  transform: {
    '^.+\\.(js|jsx)$': '<rootDir>/node_modules/babel-jest',
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
    '^(?!.*\\.(js|jsx|css|json)$)': '<rootDir>/config/jest/fileTransform.js'
  },

  // 모듈 파일 확장자
  moduleFileExtensions: [
    'js',
    'jsx',
    'json',
    'node'
  ],

  // 모듈 경로 alias
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@pages/(.*)$': '<rootDir>/src/pages/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@contexts/(.*)$': '<rootDir>/src/contexts/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js'
  },

  // Setup 파일
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.js'
  ],

  // 커버리지 설정
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/serviceWorker.js',
    '!src/**/*.test.{js,jsx}',
    '!src/**/*.spec.{js,jsx}',
    '!src/**/__tests__/**'
  ],

  // 커버리지 임계값
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },

  // 커버리지 리포터
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],

  // Watch 모드에서 무시할 경로
  watchPathIgnorePatterns: [
    'node_modules'
  ],

  // Transform 무시 패턴
  transformIgnorePatterns: [
    'node_modules/(?!(axios|@mui|@emotion)/)'
  ],

  // 테스트 타임아웃
  testTimeout: 10000,

  // 상세 출력
  verbose: true,

  // 테스트 실행 후 정리
  clearMocks: true,
  restoreMocks: true,

  // 글로벌 설정
  globals: {
    'NODE_ENV': 'test'
  }
};