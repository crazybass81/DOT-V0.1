/**
 * T067: 토큰 갱신 라우트 정의
 * POST /api/v1/auth/refresh
 *
 * 리프레시 토큰을 사용한 액세스 토큰 갱신
 * 새로운 액세스 토큰과 리프레시 토큰 쌍 발급
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const AuthService = require('../../services/auth.service');

// 유효성 검사 규칙
const refreshValidationRules = [
  body('refreshToken')
    .notEmpty()
    .withMessage('리프레시 토큰을 입력해주세요')
    .isString()
    .withMessage('올바른 토큰 형식이 아닙니다')
];

/**
 * POST /api/v1/auth/refresh
 * 토큰 갱신 엔드포인트
 */
router.post('/refresh', refreshValidationRules, async (req, res, next) => {
  try {
    // 1. 입력 유효성 검사
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({
        success: false,
        error: firstError.msg
      });
    }

    const { refreshToken } = req.body;

    // 2. AuthService를 통한 토큰 갱신
    const authService = new AuthService(
      req.app.get('pgPool'),
      req.app.get('redisClient')
    );

    try {
      const result = await authService.refreshTokens(refreshToken);

      // 3. 성공 응답
      res.status(200).json({
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });

    } catch (refreshError) {
      // refreshTokens 메서드의 에러를 그대로 전달
      throw refreshError;
    }

  } catch (error) {
    console.error('토큰 갱신 에러:', error);

    // 에러 종류별 응답
    if (error.message.includes('유효하지 않은')) {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('활성')) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('사용자를 찾을 수 없습니다')) {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '토큰 갱신 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;