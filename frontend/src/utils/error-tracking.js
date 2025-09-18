/**
 * 에러 트래킹 유틸리티
 * Sentry를 이용한 프로덕션 에러 모니터링
 *
 * 주요 기능:
 * - 자동 에러 캡처
 * - 사용자 컨텍스트 추가
 * - 커스텀 에러 레벨 설정
 * - 성능 모니터링
 */

import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

// 환경 변수에서 설정 로드
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const sentryDSN = process.env.REACT_APP_SENTRY_DSN;

/**
 * Sentry 초기화
 */
export function initErrorTracking() {
  // 프로덕션 환경에서만 Sentry 활성화
  if (!isProduction || !sentryDSN) {
    console.log('에러 트래킹이 비활성화되었습니다 (개발 환경)');
    return;
  }

  Sentry.init({
    dsn: sentryDSN,
    environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || 'production',

    // 통합 설정
    integrations: [
      new BrowserTracing({
        // 라우팅 추적
        routingInstrumentation: Sentry.reactRouterV6Instrumentation(
          window.history
        ),
        // API 호출 추적
        tracingOrigins: [
          'localhost',
          process.env.REACT_APP_API_URL,
          /^\//
        ],
      }),
    ],

    // 샘플링 레이트
    tracesSampleRate: parseFloat(
      process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || '0.1'
    ),

    // 릴리스 정보
    release: process.env.REACT_APP_VERSION || 'unknown',

    // 에러 필터링
    beforeSend(event, hint) {
      // 개발 환경 에러 무시
      if (isDevelopment) {
        return null;
      }

      // 특정 에러 무시
      const error = hint.originalException;
      if (error && error.message) {
        // 네트워크 에러 무시 (일시적인 연결 문제)
        if (error.message.includes('Network request failed')) {
          return null;
        }

        // 취소된 요청 무시
        if (error.message.includes('AbortError')) {
          return null;
        }

        // 브라우저 확장 프로그램 에러 무시
        if (error.message.includes('extension://')) {
          return null;
        }
      }

      // 민감한 정보 제거
      if (event.request) {
        // 쿠키 제거
        delete event.request.cookies;

        // 인증 헤더 마스킹
        if (event.request.headers) {
          if (event.request.headers.Authorization) {
            event.request.headers.Authorization = '[REDACTED]';
          }
        }
      }

      // 사용자 데이터 마스킹
      if (event.user) {
        if (event.user.email) {
          // 이메일 부분 마스킹
          const [localPart, domain] = event.user.email.split('@');
          event.user.email = `${localPart.slice(0, 2)}***@${domain}`;
        }
      }

      return event;
    },

    // 브레드크럼 설정
    beforeBreadcrumb(breadcrumb, hint) {
      // 콘솔 로그 무시
      if (breadcrumb.category === 'console') {
        return null;
      }

      // 민감한 데이터가 포함된 브레드크럼 필터링
      if (breadcrumb.data) {
        // 비밀번호 필드 제거
        delete breadcrumb.data.password;
        delete breadcrumb.data.newPassword;
        delete breadcrumb.data.confirmPassword;

        // 토큰 마스킹
        if (breadcrumb.data.token) {
          breadcrumb.data.token = '[REDACTED]';
        }
      }

      return breadcrumb;
    },

    // 자동 세션 추적
    autoSessionTracking: true,

    // 에러 무시 목록
    ignoreErrors: [
      // 브라우저 관련 에러
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',

      // 확장 프로그램 관련
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',

      // 네트워크 관련
      'Network request failed',
      'NetworkError',
      'Failed to fetch',

      // 사용자 행동 관련
      'AbortError',
      'cancelled',
    ],

    // 포함할 URL 패턴
    allowUrls: [
      /https?:\/\/(www\.)?yourdomain\.com/,
      /https?:\/\/localhost:\d+/,
    ],

    // 제외할 URL 패턴
    denyUrls: [
      /extensions\//i,
      /^chrome:\/\//i,
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
    ],
  });

  console.log('Sentry 에러 트래킹이 초기화되었습니다');
}

/**
 * 사용자 컨텍스트 설정
 * 로그인 시 호출하여 에러와 사용자를 연결
 */
export function setUserContext(user) {
  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
    // 추가 사용자 정보
    businessId: user.businessId,
    role: user.role,
    // 세그먼트 정보
    segment: getUserSegment(user),
  });
}

/**
 * 사용자 세그먼트 결정
 */
function getUserSegment(user) {
  if (user.role === 'admin') return 'admin';
  if (user.role === 'manager') return 'manager';
  if (user.employmentType === 'full-time') return 'full-time-employee';
  if (user.employmentType === 'part-time') return 'part-time-employee';
  return 'general';
}

/**
 * 커스텀 에러 캡처
 */
export function captureError(error, context = {}) {
  console.error('에러 발생:', error);

  // 개발 환경에서는 콘솔에만 출력
  if (isDevelopment) {
    console.error('에러 컨텍스트:', context);
    return;
  }

  // Sentry로 에러 전송
  Sentry.captureException(error, {
    contexts: {
      custom: context,
    },
    level: getSeverityLevel(error),
  });
}

/**
 * 에러 심각도 레벨 결정
 */
function getSeverityLevel(error) {
  // 인증 관련 에러
  if (error.code === 401 || error.code === 403) {
    return 'warning';
  }

  // 서버 에러
  if (error.code >= 500) {
    return 'error';
  }

  // 클라이언트 에러
  if (error.code >= 400) {
    return 'warning';
  }

  // 네트워크 에러
  if (error.name === 'NetworkError' || error.message?.includes('fetch')) {
    return 'warning';
  }

  // 기본값
  return 'error';
}

/**
 * 메시지 캡처 (에러가 아닌 이벤트)
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (isDevelopment) {
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  Sentry.captureMessage(message, {
    level,
    contexts: {
      custom: context,
    },
  });
}

/**
 * 브레드크럼 추가 (사용자 행동 추적)
 */
export function addBreadcrumb(message, category = 'custom', data = {}) {
  Sentry.addBreadcrumb({
    message,
    category,
    level: 'info',
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * 트랜잭션 시작 (성능 모니터링)
 */
export function startTransaction(name, operation = 'navigation') {
  return Sentry.startTransaction({
    name,
    op: operation,
  });
}

/**
 * API 호출 추적
 */
export function trackAPICall(url, method, status, duration) {
  if (isDevelopment) return;

  const transaction = Sentry.getCurrentHub().getScope().getTransaction();
  if (transaction) {
    const span = transaction.startChild({
      op: 'http',
      description: `${method} ${url}`,
    });

    span.setTag('http.method', method);
    span.setTag('http.status_code', status);
    span.setData('http.url', url);
    span.setData('http.response_time', duration);

    span.finish();
  }
}

/**
 * 에러 경계 컴포넌트
 */
export const ErrorBoundary = Sentry.ErrorBoundary;

/**
 * 에러 경계 Fallback 컴포넌트
 */
export function ErrorFallback({ error, resetError }) {
  return (
    <div className="error-fallback">
      <h2>문제가 발생했습니다</h2>
      <p>죄송합니다. 예기치 않은 오류가 발생했습니다.</p>
      {isDevelopment && (
        <details style={{ whiteSpace: 'pre-wrap' }}>
          <summary>에러 상세정보 (개발 환경에서만 표시)</summary>
          {error.toString()}
          <br />
          {error.stack}
        </details>
      )}
      <button onClick={resetError}>다시 시도</button>
    </div>
  );
}

/**
 * 프로파일링 시작/종료
 */
export const Profiler = Sentry.Profiler;

/**
 * 에러 리포팅 HOC
 */
export function withErrorTracking(Component) {
  return Sentry.withProfiler(Component);
}

/**
 * 에러 트래킹 훅
 */
export function useErrorTracking() {
  return {
    captureError,
    captureMessage,
    addBreadcrumb,
    startTransaction,
    trackAPICall,
  };
}

// 전역 에러 핸들러 등록
if (!isDevelopment) {
  window.addEventListener('error', (event) => {
    captureError(event.error, {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureError(new Error(event.reason), {
      type: 'unhandledRejection',
      promise: event.promise,
    });
  });
}

export default {
  init: initErrorTracking,
  setUser: setUserContext,
  captureError,
  captureMessage,
  addBreadcrumb,
  startTransaction,
  trackAPICall,
  ErrorBoundary,
  ErrorFallback,
  Profiler,
  withErrorTracking,
  useErrorTracking,
};