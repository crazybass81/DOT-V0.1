/**
 * T122: JWT 인증 미들웨어
 * Bearer 토큰 검증 및 사용자 인증 처리
 * Mock 사용 없이 실제 JWT 라이브러리 사용
 */

const { verifyToken } = require('../lib/auth-lib/token');
const { query } = require('../config/database');

/**
 * JWT Bearer 토큰 인증 미들웨어
 * Authorization: Bearer <token> 헤더에서 토큰 추출 및 검증
 */
async function authenticate(req, res, next) {
  try {
    // Authorization 헤더 확인
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Bearer 토큰 추출
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization format. Use: Bearer <token>',
        code: 'INVALID_AUTH_FORMAT'
      });
    }

    const token = parts[1];

    // 토큰 검증
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      // 토큰 만료
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      // 유효하지 않은 토큰
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      throw error;
    }

    // 사용자 정보 조회 (실제 DB에서)
    const userResult = await query(
      `SELECT id, email, name, status
       FROM users
       WHERE id = $1 AND status = 'active'`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    // req.user 객체 설정
    req.user = {
      id: userResult.rows[0].id,
      email: userResult.rows[0].email,
      name: userResult.rows[0].name,
      tokenData: decoded
    };

    // 다음 미들웨어로 진행
    next();
  } catch (error) {
    console.error('인증 미들웨어 에러:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during authentication',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * 선택적 인증 미들웨어
 * 토큰이 있으면 검증하고, 없으면 그냥 통과
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // 인증 없이 진행
    req.user = null;
    return next();
  }

  // 인증 시도
  return authenticate(req, res, next);
}

/**
 * 역할 기반 접근 제어 미들웨어
 * @param {Array<string>} allowedRoles - 허용된 역할 목록
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      // 인증되지 않은 경우
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // businessId 확인 (쿼리 또는 바디에서)
      const businessId = req.query.businessId || req.body?.businessId || req.params?.businessId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          error: 'Business ID required for role check',
          code: 'BUSINESS_ID_REQUIRED'
        });
      }

      // 사용자 역할 조회
      const roleResult = await query(
        `SELECT role_type, is_active
         FROM user_roles
         WHERE user_id = $1 AND business_id = $2 AND is_active = true`,
        [req.user.id, businessId]
      );

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'No active role in this business',
          code: 'NO_ROLE'
        });
      }

      const userRole = roleResult.rows[0].role_type;

      // 역할 확인
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          code: 'INSUFFICIENT_ROLE'
        });
      }

      // 역할 정보를 req.user에 추가
      req.user.role = userRole;
      req.user.businessId = parseInt(businessId);

      next();
    } catch (error) {
      console.error('역할 확인 에러:', error);
      return res.status(500).json({
        success: false,
        error: 'Error checking user role',
        code: 'ROLE_CHECK_ERROR'
      });
    }
  };
}

/**
 * API 키 인증 미들웨어 (선택적)
 * X-API-Key 헤더로 인증
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      code: 'API_KEY_REQUIRED'
    });
  }

  // API 키 검증 (실제 구현시 DB에서 확인)
  const validApiKey = process.env.API_KEY || 'test-api-key';

  if (apiKey !== validApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_API_KEY'
    });
  }

  next();
}

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  authenticateApiKey
};