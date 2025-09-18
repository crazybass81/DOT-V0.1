/**
 * T237: 역할 기반 권한 체크 미들웨어
 * 특정 역할을 가진 사용자만 접근 허용
 * 사업체별 역할 관리 지원
 */

const { query } = require('../config/database');

/**
 * 역할 기반 권한 체크 미들웨어
 * @param {...string} allowedRoles - 허용된 역할 목록 (예: 'owner', 'manager', 'employee')
 * @returns {Function} Express 미들웨어 함수
 */
function authorize(...allowedRoles) {
  return async (req, res, next) => {
    try {
      // 인증된 사용자 확인
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '인증이 필요합니다',
          code: 'AUTH_REQUIRED'
        });
      }

      // businessId 확인 (여러 소스에서 추출)
      const businessId = req.params.businessId ||
                        req.query.businessId ||
                        req.body?.businessId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          error: '사업체 ID가 필요합니다',
          code: 'BUSINESS_ID_REQUIRED'
        });
      }

      // 사용자의 역할 정보 조회
      const roleQuery = `
        SELECT
          ur.role_type,
          ur.business_id,
          ur.is_active,
          ur.assigned_at,
          b.name as business_name
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;

      const result = await query(roleQuery, [req.user.id, businessId]);

      if (result.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업체에 대한 활성화된 역할이 없습니다',
          code: 'NO_ACTIVE_ROLE'
        });
      }

      const userRole = result.rows[0];

      // 허용된 역할 확인
      const hasPermission = allowedRoles.includes(userRole.role_type);

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `접근 권한이 없습니다. 필요한 역할: ${allowedRoles.join(', ')}`,
          code: 'INSUFFICIENT_ROLE',
          details: {
            userRole: userRole.role_type,
            requiredRoles: allowedRoles
          }
        });
      }

      // 권한 확인 성공 - 사용자 정보에 역할 정보 추가
      req.user.currentRole = {
        type: userRole.role_type,
        businessId: parseInt(businessId),
        businessName: userRole.business_name,
        assignedAt: userRole.assigned_at
      };

      // 다음 미들웨어로 진행
      next();

    } catch (error) {
      console.error('권한 체크 오류:', error);
      res.status(500).json({
        success: false,
        error: '권한 확인 중 오류가 발생했습니다',
        code: 'AUTHORIZATION_ERROR'
      });
    }
  };
}

/**
 * 소유자 권한 체크 (편의 함수)
 * 사업체 소유자만 접근 가능
 */
function requireOwner() {
  return authorize('owner');
}

/**
 * 관리자 이상 권한 체크 (편의 함수)
 * 소유자 또는 관리자만 접근 가능
 */
function requireManager() {
  return authorize('owner', 'manager');
}

/**
 * 직원 이상 권한 체크 (편의 함수)
 * 모든 활성 역할 사용자 접근 가능
 */
function requireEmployee() {
  return authorize('owner', 'manager', 'employee');
}

/**
 * 다중 사업체 권한 체크
 * 사용자가 여러 사업체에 대한 권한을 가지고 있는지 확인
 * @param {Array<string>} allowedRoles - 허용된 역할 목록
 * @param {Array<number>} businessIds - 확인할 사업체 ID 목록
 */
function authorizeMultipleBusiness(allowedRoles, businessIds) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '인증이 필요합니다',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!businessIds || businessIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: '사업체 ID 목록이 필요합니다',
          code: 'BUSINESS_IDS_REQUIRED'
        });
      }

      // 사용자의 모든 활성 역할 조회
      const roleQuery = `
        SELECT
          ur.role_type,
          ur.business_id,
          b.name as business_name
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.business_id = ANY($2)
          AND ur.is_active = true
      `;

      const result = await query(roleQuery, [req.user.id, businessIds]);

      // 모든 사업체에 대한 권한 확인
      const authorizedBusinesses = [];
      const missingPermissions = [];

      for (const businessId of businessIds) {
        const userRole = result.rows.find(r => r.business_id === businessId);

        if (!userRole) {
          missingPermissions.push({
            businessId,
            reason: '활성화된 역할 없음'
          });
          continue;
        }

        if (!allowedRoles.includes(userRole.role_type)) {
          missingPermissions.push({
            businessId,
            reason: `권한 부족 (현재: ${userRole.role_type}, 필요: ${allowedRoles.join(', ')})`
          });
          continue;
        }

        authorizedBusinesses.push({
          businessId: userRole.business_id,
          businessName: userRole.business_name,
          role: userRole.role_type
        });
      }

      if (missingPermissions.length > 0) {
        return res.status(403).json({
          success: false,
          error: '일부 사업체에 대한 권한이 없습니다',
          code: 'PARTIAL_AUTHORIZATION_FAILED',
          details: {
            authorized: authorizedBusinesses,
            missing: missingPermissions
          }
        });
      }

      // 모든 권한 확인 성공
      req.user.authorizedBusinesses = authorizedBusinesses;
      next();

    } catch (error) {
      console.error('다중 사업체 권한 체크 오류:', error);
      res.status(500).json({
        success: false,
        error: '권한 확인 중 오류가 발생했습니다',
        code: 'AUTHORIZATION_ERROR'
      });
    }
  };
}

module.exports = {
  authorize,
  requireOwner,
  requireManager,
  requireEmployee,
  authorizeMultipleBusiness
};