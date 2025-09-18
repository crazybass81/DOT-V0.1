/**
 * T069: 현재 사용자 정보 라우트 정의
 * GET /api/v1/auth/me
 *
 * 토큰으로 인증된 사용자의 정보 조회
 * 역할 정보 포함
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../../services/auth.service');
const { verifyToken } = require('../../lib/auth-lib/token');

/**
 * GET /api/v1/auth/me
 * 현재 사용자 정보 조회 엔드포인트
 */
router.get('/me', async (req, res, next) => {
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

      // 3. AuthService를 통한 사용자 정보 조회
      const authService = new AuthService(
        req.app.get('pgPool'),
        req.app.get('redisClient')
      );

      const user = await authService.getCurrentUser(userId);

      // 사용자 상태 확인
      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: `계정이 ${user.status === 'inactive' ? '비활성화' : '정지'}되었습니다`
        });
      }

      // 4. 성공 응답
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          status: user.status,
          roles: user.roles,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at
        }
      });

    } catch (tokenError) {
      // 토큰 검증 실패 또는 사용자 조회 실패
      if (tokenError.message.includes('사용자를 찾을 수 없습니다')) {
        return res.status(404).json({
          success: false,
          error: '사용자를 찾을 수 없습니다'
        });
      }

      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('사용자 정보 조회 에러:', error);

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '사용자 정보 조회 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;