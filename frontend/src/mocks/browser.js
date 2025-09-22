/**
 * MSW 브라우저 설정
 */

import { setupWorker } from 'msw';
import { handlers } from './handlers';

// 브라우저에서 실행될 Service Worker 설정
export const worker = setupWorker(...handlers);