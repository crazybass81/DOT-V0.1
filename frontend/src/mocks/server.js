/**
 * MSW 서버 설정 (Node.js 환경용)
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Node.js 환경에서 실행될 Mock 서버 설정
export const server = setupServer(...handlers);