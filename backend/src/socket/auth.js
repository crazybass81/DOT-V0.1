/**
 * T292: 소켓 인증 미들웨어
 * WebSocket 연결 시 JWT 토큰 검증
 *
 * 인증 방식:
 * 1. Authorization 헤더의 Bearer 토큰
 * 2. 쿼리 파라미터의 token
 * 3. auth 핸드셰이크 데이터의 token
 *
 * 검증 내용:
 * - JWT 토큰 유효성
 * - 세션 활성 상태
 * - 사용자 권한
 */

const jwt = require('jsonwebtoken');
const pool = require('../db');
const redis = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Socket.io 인증 미들웨어
 * @param {Socket} socket - Socket.io 소켓
 * @param {Function} next - 다음 미들웨어
 */
async function authenticateSocket(socket, next) {
  try {
    // 토큰 추출 (여러 위치에서 시도)
    let token = null;

    // 1. Authorization 헤더에서 추출
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // 2. 쿼리 파라미터에서 추출
    if (!token && socket.handshake.query.token) {
      token = socket.handshake.query.token;
    }

    // 3. auth 데이터에서 추출
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }

    // 토큰이 없는 경우
    if (!token) {
      logger.warn(`소켓 인증 실패: 토큰 없음, IP=${socket.handshake.address}`);
      return next(new Error('인증 토큰이 필요합니다.'));
    }

    // JWT 토큰 검증
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
      logger.warn(`소켓 인증 실패: JWT 검증 실패, error=${error.message}`);
      if (error.name === 'TokenExpiredError') {
        return next(new Error('토큰이 만료되었습니다.'));
      }
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('유효하지 않은 토큰입니다.'));
      }
      return next(new Error('토큰 검증에 실패했습니다.'));
    }

    const userId = decoded.id || decoded.userId;
    const sessionId = decoded.sessionId;

    // 세션 확인 (Redis)
    if (sessionId && redis) {
      try {
        const sessionKey = `session:${sessionId}`;
        const sessionData = await redis.get(sessionKey);

        if (!sessionData) {
          logger.warn(`소켓 인증 실패: 세션 없음, userId=${userId}`);
          return next(new Error('세션이 만료되었습니다.'));
        }

        const session = JSON.parse(sessionData);

        // 세션 사용자 일치 확인
        if (session.userId !== userId) {
          logger.warn(`소켓 인증 실패: 세션 불일치, userId=${userId}`);
          return next(new Error('세션 정보가 일치하지 않습니다.'));
        }

        // 세션 만료 시간 업데이트
        const ttl = 60 * 60 * 24; // 24시간
        await redis.expire(sessionKey, ttl);
      } catch (error) {
        logger.error('세션 확인 중 오류:', error);
        // Redis 오류는 인증 실패로 처리하지 않음
      }
    }

    // 데이터베이스에서 사용자 정보 조회
    const client = await pool.connect();
    try {
      // 사용자 정보 조회
      const userQuery = `
        SELECT
          u.id,
          u.email,
          u.name,
          u.phone,
          u.status,
          u.last_active_at
        FROM users u
        WHERE u.id = $1
      `;
      const userResult = await client.query(userQuery, [userId]);

      if (userResult.rows.length === 0) {
        logger.warn(`소켓 인증 실패: 사용자 없음, userId=${userId}`);
        return next(new Error('사용자를 찾을 수 없습니다.'));
      }

      const user = userResult.rows[0];

      // 사용자 상태 확인
      if (user.status !== 'active') {
        logger.warn(`소켓 인증 실패: 비활성 사용자, userId=${userId}, status=${user.status}`);
        return next(new Error('비활성화된 계정입니다.'));
      }

      // 현재 활성 사업장 및 역할 조회
      const roleQuery = `
        SELECT
          ur.business_id,
          ur.role_type,
          b.name as business_name
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.is_active = true
        ORDER BY ur.is_primary DESC, ur.created_at DESC
        LIMIT 1
      `;
      const roleResult = await client.query(roleQuery, [userId]);

      let currentBusinessId = null;
      let currentRole = null;
      let businessName = null;

      if (roleResult.rows.length > 0) {
        currentBusinessId = roleResult.rows[0].business_id;
        currentRole = roleResult.rows[0].role_type;
        businessName = roleResult.rows[0].business_name;
      }

      // 마지막 활동 시간 업데이트
      await client.query(
        'UPDATE users SET last_active_at = NOW() WHERE id = $1',
        [userId]
      );

      // 소켓에 사용자 정보 저장
      socket.user = {
        id: userId,
        email: user.email,
        name: user.name,
        phone: user.phone,
        currentBusinessId,
        currentRole,
        businessName,
        sessionId
      };

      // 인증 성공 로그
      logger.info(`소켓 인증 성공: userId=${userId}, businessId=${currentBusinessId}, role=${currentRole}`);

      next();

    } catch (error) {
      logger.error('소켓 인증 중 DB 오류:', error);
      next(new Error('인증 처리 중 오류가 발생했습니다.'));
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('소켓 인증 미들웨어 오류:', error);
    next(new Error('인증에 실패했습니다.'));
  }
}

/**
 * 역할 기반 권한 확인 미들웨어 생성
 * @param {Array<string>} allowedRoles - 허용된 역할 목록
 * @returns {Function} 미들웨어 함수
 */
function authorizeSocket(allowedRoles = []) {
  return (socket, next) => {
    try {
      // 인증되지 않은 사용자
      if (!socket.user) {
        return next(new Error('인증이 필요합니다.'));
      }

      // 역할 확인
      const userRole = socket.user.currentRole;

      if (!userRole) {
        return next(new Error('역할이 할당되지 않았습니다.'));
      }

      if (!allowedRoles.includes(userRole)) {
        logger.warn(`소켓 권한 실패: userId=${socket.user.id}, role=${userRole}, required=${allowedRoles}`);
        return next(new Error(`권한이 없습니다. 필요한 역할: ${allowedRoles.join(', ')}`));
      }

      next();

    } catch (error) {
      logger.error('소켓 권한 확인 오류:', error);
      next(new Error('권한 확인에 실패했습니다.'));
    }
  };
}

/**
 * 사업장 소속 확인 미들웨어
 * @param {Socket} socket - Socket.io 소켓
 * @param {Function} next - 다음 미들웨어
 */
async function requireBusinessMembership(socket, next) {
  try {
    if (!socket.user) {
      return next(new Error('인증이 필요합니다.'));
    }

    if (!socket.user.currentBusinessId) {
      return next(new Error('사업장에 소속되어 있지 않습니다.'));
    }

    // 사업장 활성 상태 확인
    const client = await pool.connect();
    try {
      const businessQuery = `
        SELECT status
        FROM businesses
        WHERE id = $1
      `;
      const result = await client.query(businessQuery, [socket.user.currentBusinessId]);

      if (result.rows.length === 0) {
        return next(new Error('사업장을 찾을 수 없습니다.'));
      }

      if (result.rows[0].status !== 'active') {
        return next(new Error('비활성화된 사업장입니다.'));
      }

      next();

    } catch (error) {
      logger.error('사업장 확인 중 오류:', error);
      next(new Error('사업장 확인에 실패했습니다.'));
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('사업장 멤버십 확인 오류:', error);
    next(new Error('사업장 확인에 실패했습니다.'));
  }
}

/**
 * 소켓 재인증
 * 토큰 갱신 시 호출
 * @param {Socket} socket - Socket.io 소켓
 * @param {string} newToken - 새 토큰
 */
async function reauthenticateSocket(socket, newToken) {
  try {
    // 임시로 새 토큰 설정
    socket.handshake.auth = { token: newToken };

    // 재인증 수행
    await new Promise((resolve, reject) => {
      authenticateSocket(socket, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    logger.info(`소켓 재인증 성공: userId=${socket.user.id}`);
    return { success: true };

  } catch (error) {
    logger.error('소켓 재인증 실패:', error);

    // 재인증 실패 시 연결 종료
    socket.disconnect(true);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 소켓 권한 확인 헬퍼
 * @param {Socket} socket - Socket.io 소켓
 * @param {string} permission - 확인할 권한
 * @returns {boolean} 권한 보유 여부
 */
function hasPermission(socket, permission) {
  if (!socket.user) {
    return false;
  }

  const role = socket.user.currentRole;

  // 역할별 권한 매핑
  const permissions = {
    owner: ['all'],
    manager: ['manage_users', 'manage_schedules', 'view_reports', 'manage_attendance'],
    worker: ['view_own_schedule', 'check_in_out', 'view_own_reports'],
    seeker: ['view_public_schedules', 'apply_jobs']
  };

  const rolePermissions = permissions[role] || [];

  // 'all' 권한은 모든 권한 포함
  if (rolePermissions.includes('all')) {
    return true;
  }

  return rolePermissions.includes(permission);
}

module.exports = {
  authenticateSocket,
  authorizeSocket,
  requireBusinessMembership,
  reauthenticateSocket,
  hasPermission
};