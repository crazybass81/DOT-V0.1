/**
 * T068: 로그아웃 라우트 정의
 * POST /api/v1/auth/logout
 *
 * 세션 및 리프레시 토큰 삭제
 * 인증된 사용자만 로그아웃 가능
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../../services/auth.service');
const { verifyToken } = require('../../lib/auth-lib/token');

/**
 * POST /api/v1/auth/logout
 * 로그아웃 엔드포인트
 */
router.post('/logout', async (req, res, next) => {
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

      // 3. AuthService를 통한 로그아웃 처리
      const authService = new AuthService(
        req.app.get('pgPool'),
        req.app.get('redisClient')
      );

      await authService.logout(userId);

      // 4. 성공 응답
      res.status(200).json({
        success: true,
        message: '로그아웃되었습니다'
      });

    } catch (tokenError) {
      // 토큰 검증 실패
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('로그아웃 에러:', error);

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '로그아웃 처리 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;