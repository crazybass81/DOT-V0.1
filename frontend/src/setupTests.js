/**
 * Jest 테스트 환경 설정
 */

// Polyfill을 모든 imports 전에 실행
require('./test-polyfill');

import '@testing-library/jest-dom';

// MSW 설정 - 일시적으로 비활성화 (Node.js 버전 이슈)
// TransformStream 관련 에러로 인해 임시로 비활성화
// const { server } = require('./mocks/server');

// MSW 서버 시작 - 일시적으로 비활성화
// beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close());

// localStorage mock
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// console.error를 조용히 만들기 (테스트 출력 정리)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});