/**
 * 로거 유틸리티
 * 애플리케이션 전반의 로깅 처리
 * Winston 로거를 나중에 통합할 때까지 콘솔 로거 사용
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

/**
 * 로그 레벨 정의
 */
const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * 현재 로그 레벨 설정
 */
const currentLogLevel = process.env.LOG_LEVEL ?
  LogLevel[process.env.LOG_LEVEL.toUpperCase()] :
  (isDevelopment ? LogLevel.DEBUG : LogLevel.INFO);

/**
 * 로그 포맷터
 */
function formatLog(level, message, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message
  };

  if (data) {
    logEntry.data = data;
  }

  return logEntry;
}

/**
 * 로그 출력
 */
function log(level, message, data) {
  // 테스트 환경에서는 로깅 최소화
  if (isTest && level !== 'ERROR') {
    return;
  }

  const levelValue = LogLevel[level.toUpperCase()];
  if (levelValue === undefined || levelValue > currentLogLevel) {
    return;
  }

  const logEntry = formatLog(level, message, data);

  switch (level.toUpperCase()) {
    case 'ERROR':
      console.error(JSON.stringify(logEntry));
      break;
    case 'WARN':
      console.warn(JSON.stringify(logEntry));
      break;
    case 'INFO':
      console.info(JSON.stringify(logEntry));
      break;
    case 'DEBUG':
      console.log(JSON.stringify(logEntry));
      break;
    default:
      console.log(JSON.stringify(logEntry));
  }
}

/**
 * 로거 객체
 */
const logger = {
  error(message, data) {
    log('ERROR', message, data);
  },

  warn(message, data) {
    log('WARN', message, data);
  },

  info(message, data) {
    log('INFO', message, data);
  },

  debug(message, data) {
    log('DEBUG', message, data);
  },

  // 구조화된 로깅을 위한 헬퍼
  logRequest(req, message) {
    this.info(message, {
      method: req.method,
      path: req.path,
      query: req.query,
      userId: req.user?.id,
      ip: req.ip
    });
  },

  logError(error, context) {
    this.error(error.message, {
      stack: error.stack,
      code: error.code,
      ...context
    });
  },

  // 성능 측정을 위한 헬퍼
  startTimer() {
    return Date.now();
  },

  endTimer(startTime, message) {
    const duration = Date.now() - startTime;
    this.info(message, { duration: `${duration}ms` });
    return duration;
  }
};

module.exports = logger;