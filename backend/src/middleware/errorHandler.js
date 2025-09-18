/**
 * 에러 핸들링 미들웨어
 * 비동기 함수 래퍼 및 중앙 집중 에러 처리
 */

const logger = require('../utils/logger');

/**
 * 비동기 라우트 핸들러 래퍼
 * Promise rejection을 자동으로 catch하여 에러 핸들러로 전달
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(next);
  };
}

/**
 * 중앙 에러 핸들링 미들웨어
 * 모든 에러를 일관된 형식으로 처리
 */
function errorHandler(err, req, res, next) {
  // 이미 응답이 전송된 경우
  if (res.headersSent) {
    return next(err);
  }

  // 로깅
  logger.error('에러 발생:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    user: req.user?.id
  });

  // 에러 타입별 처리
  let status = err.status || err.statusCode || 500;
  let message = err.message || '서버 오류가 발생했습니다';

  // 데이터베이스 에러
  if (err.code === '23505') {
    status = 409;
    message = '중복된 데이터가 존재합니다';
  } else if (err.code === '23503') {
    status = 400;
    message = '참조하는 데이터가 존재하지 않습니다';
  } else if (err.code === '23502') {
    status = 400;
    message = '필수 항목이 누락되었습니다';
  }

  // JWT 에러
  if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = '유효하지 않은 토큰입니다';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = '토큰이 만료되었습니다';
  }

  // 유효성 검증 에러
  if (err.name === 'ValidationError') {
    status = 400;
    message = err.details || '입력값 검증에 실패했습니다';
  }

  // Multer 파일 업로드 에러
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = '파일 크기가 제한을 초과했습니다 (최대 10MB)';
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    status = 400;
    message = '파일 개수가 제한을 초과했습니다';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    status = 400;
    message = '예상치 않은 필드명입니다';
  }

  // 권한 에러
  if (err.name === 'ForbiddenError') {
    status = 403;
    message = err.message || '접근 권한이 없습니다';
  }

  // Not Found 에러
  if (err.name === 'NotFoundError') {
    status = 404;
    message = err.message || '요청한 리소스를 찾을 수 없습니다';
  }

  // 개발 환경에서는 상세 에러 정보 포함
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(status).json({
    success: false,
    error: message,
    ...(isDevelopment && {
      details: err.details,
      stack: err.stack,
      originalError: err.message
    })
  });
}

/**
 * 404 에러 핸들러
 * 정의되지 않은 라우트에 대한 처리
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: '요청한 엔드포인트를 찾을 수 없습니다',
    path: req.path,
    method: req.method
  });
}

/**
 * 커스텀 에러 클래스들
 */
class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequestError';
    this.status = 400;
  }
}

/**
 * Express 앱에 에러 핸들링 설정
 */
function setupErrorHandling(app) {
  // 404 핸들러 (모든 라우트 뒤에)
  app.use(notFoundHandler);

  // 중앙 에러 핸들러 (가장 마지막에)
  app.use(errorHandler);
}

module.exports = {
  asyncHandler,
  errorHandler,
  notFoundHandler,
  setupErrorHandling,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  BadRequestError
};