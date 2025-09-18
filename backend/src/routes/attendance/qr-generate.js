/**
 * T107: QR 생성 라우트 정의
 * GET /api/v1/attendance/qr/generate
 *
 * 사업장용 QR 코드 생성
 * Owner/Manager만 생성 가능
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../lib/auth-lib/token');
const { generateQRCode } = require('../../lib/attendance-lib/qr');

/**
 * GET /api/v1/attendance/qr/generate
 * QR 코드 생성 엔드포인트
 */
router.get('/generate', async (req, res, next) => {
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

      // 3. businessId 파라미터 검증
      const businessId = req.query.businessId;
      if (!businessId) {
        return res.status(400).json({
          success: false,
          error: '사업장 ID를 입력해주세요'
        });
      }

      // 4. 권한 검증 - Owner/Manager만 가능
      const pgPool = req.app.get('pgPool');
      const roleQuery = `
        SELECT ur.role_type, b.status as business_status
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;

      const roleResult = await pgPool.query(roleQuery, [userId, businessId]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다'
        });
      }

      const userRole = roleResult.rows[0];

      // Owner 또는 Manager만 QR 생성 가능
      if (!['owner', 'manager'].includes(userRole.role_type)) {
        return res.status(403).json({
          success: false,
          error: 'QR 코드 생성 권한이 없습니다'
        });
      }

      // 사업장 상태 확인
      if (userRole.business_status !== 'active') {
        return res.status(403).json({
          success: false,
          error: '비활성화된 사업장입니다'
        });
      }

      // 5. QR 코드 생성 (30초 유효)
      const qrData = await generateQRCode(businessId, 30000);

      // 6. 생성 로그 저장 (선택적)
      try {
        await pgPool.query(`
          INSERT INTO attendance_logs (
            user_id, business_id, action_type,
            action_data, created_at
          ) VALUES ($1, $2, 'qr_generated', $3, NOW())
        `, [
          userId,
          businessId,
          JSON.stringify({ expiresAt: qrData.expiresAt })
        ]);
      } catch (logError) {
        // 로그 실패는 무시 (테이블이 없을 수 있음)
        console.log('QR 생성 로그 저장 건너뜀');
      }

      // 7. 성공 응답
      res.status(200).json({
        success: true,
        businessId: parseInt(businessId),
        qrCode: qrData.qrCode,
        token: qrData.token,
        expiresAt: qrData.expiresAt,
        message: '30초 동안 유효한 QR 코드입니다'
      });

    } catch (tokenError) {
      // 토큰 검증 실패
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('QR 생성 에러:', error);

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: 'QR 코드 생성 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;