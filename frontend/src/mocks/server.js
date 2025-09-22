/**
 * MSW 서버 설정 (Node.js 환경용)
 */

// TextEncoder polyfill must be set before MSW import
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Use require to ensure polyfill is set first
const { setupServer } = require('msw/node');
const { handlers } = require('./handlers');

// Node.js 환경에서 실행될 Mock 서버 설정
const server = setupServer(...handlers);

module.exports = { server };