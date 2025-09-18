/**
 * T070: 역할 전환 라우트 정의
 * POST /api/v1/auth/switch-role
 *
 * 사용자가 보유한 역할 간 전환
 * seeker <-> provider <-> admin 전환
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const AuthService = require('../../services/auth.service');
const { verifyToken } = require('../../lib/auth-lib/token');

// 유효성 검사 규칙
const switchRoleValidationRules = [
  body('roleType')
    .notEmpty()
    .withMessage('역할 타입을 입력해주세요')
    .isIn(['seeker', 'provider', 'admin'])
    .withMessage('유효하지 않은 역할 타입입니다'),

  body('businessId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('올바른 사업장 ID가 아닙니다')
];

/**
 * POST /api/v1/auth/switch-role
 * 역할 전환 엔드포인트
 */
router.post('/switch-role', switchRoleValidationRules, async (req, res, next) => {
  try {
    // 1. Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: '인증 토큰이 필요합니다'
      });
    }

    // Bearer 토큰 형식 확인
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: '올바른 토큰 형식이 아닙니다'
      });
    }

    const token = parts[1];

    try {
      // 2. 토큰 검증
      const decoded = await verifyToken(token);
      const userId = decoded.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      // 3. 입력 유효성 검사
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return res.status(400).json({
          success: false,
          error: firstError.msg
        });
      }

      const { roleType, businessId } = req.body;

      // 4. AuthService를 통한 역할 전환
      const authService = new AuthService(
        req.app.get('pgPool'),
        req.app.get('redisClient')
      );

      const result = await authService.switchRole(userId, roleType, businessId);

      // 5. 성공 응답
      res.status(200).json({
        success: true,
        message: '역할이 전환되었습니다',
        currentRole: result.currentRole
      });

    } catch (tokenError) {
      // 토큰 검증 실패
      if (tokenError.message.includes('권한이 없습니다')) {
        return res.status(403).json({
          success: false,
          error: tokenError.message
        });
      }

      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('역할 전환 에러:', error);

    // 권한 관련 에러
    if (error.message.includes('권한이 없습니다')) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '역할 전환 중 오류가 발생했습니다'
    });
  }
});

/**
 * GET /api/v1/auth/roles
 * 사용자가 보유한 역할 목록 조회
 */
router.get('/roles', async (req, res, next) => {
  try {
    // 1. Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: '인증 토큰이 필요합니다'
      });
    }

    // Bearer 토큰 형식 확인
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: '올바른 토큰 형식이 아닙니다'
      });
    }

    const token = parts[1];

    try {
      // 2. 토큰 검증
      const decoded = await verifyToken(token);
      const userId = decoded.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      // 3. 사용자 역할 조회
      const pgPool = req.app.get('pgPool');
      const rolesQuery = `
        SELECT ur.role_type, ur.business_id, ur.is_active,
               b.name as business_name, b.status as business_status
        FROM user_roles ur
        LEFT JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1 AND ur.is_active = true
        ORDER BY ur.created_at DESC
      `;

      const rolesResult = await pgPool.query(rolesQuery, [userId]);

      // 4. 성공 응답
      res.status(200).json({
        success: true,
        roles: rolesResult.rows.map(role => ({
          roleType: role.role_type,
          businessId: role.business_id,
          businessName: role.business_name,
          businessStatus: role.business_status,
          isActive: role.is_active
        }))
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('역할 목록 조회 에러:', error);

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '역할 목록 조회 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;