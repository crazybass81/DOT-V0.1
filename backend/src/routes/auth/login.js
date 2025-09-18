/**
 * T062: 로그인 라우트 정의
 * POST /api/v1/auth/login
 *
 * 실제 PostgreSQL과 Redis를 사용한 로그인 처리
 * Brute force 공격 방어 포함
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const AuthService = require('../../services/auth.service');

// 유효성 검사 규칙
const loginValidationRules = [
  body('email')
    .isEmail()
    .withMessage('올바른 이메일 형식이 아닙니다')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('비밀번호를 입력해주세요')
];

/**
 * POST /api/v1/auth/login
 * 로그인 엔드포인트
 */
router.post('/login', loginValidationRules, async (req, res, next) => {
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

    const { email, password } = req.body;
    const redisClient = req.app.get('redisClient');

    // 2. Brute force 공격 방어 - 로그인 시도 횟수 확인
    const failKey = `login_fail:${email}`;
    const failCount = await redisClient.get(failKey);

    if (failCount && parseInt(failCount) >= 5) {
      return res.status(429).json({
        success: false,
        error: '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.'
      });
    }

    // 3. AuthService를 통한 로그인 처리
    const authService = new AuthService(
      req.app.get('pgPool'),
      req.app.get('redisClient')
    );

    try {
      const result = await authService.login(email, password);

      // 로그인 성공 시 실패 카운터 초기화
      await redisClient.del(failKey);

      // 4. 세션 저장
      const sessionKey = `session:${result.user.id}`;
      await redisClient.setEx(
        sessionKey,
        86400 * 7, // 7일
        JSON.stringify({
          userId: result.user.id,
          email: result.user.email,
          roles: result.user.roles
        })
      );

      // 5. 성공 응답
      res.status(200).json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });

    } catch (loginError) {
      // 로그인 실패 시 카운터 증가
      if (loginError.message.includes('올바르지 않습니다')) {
        const currentCount = failCount ? parseInt(failCount) : 0;
        await redisClient.setEx(
          failKey,
          900, // 15분 유지
          String(currentCount + 1)
        );
      }
      throw loginError;
    }

  } catch (error) {
    console.error('로그인 에러:', error);

    // 에러 종류별 응답
    if (error.message.includes('올바르지 않습니다')) {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('비활성화') || error.message.includes('정지')) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '로그인 처리 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;