/**
 * T057: 회원가입 라우트 정의
 * POST /api/v1/auth/register
 *
 * 실제 PostgreSQL과 Redis를 사용한 회원가입 처리
 * Mock 사용 금지 - 모든 작업은 실제 DB에서 수행
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const UserService = require('../../services/user.service');
const { hashPassword } = require('../../lib/auth-lib/password');

// 유효성 검사 규칙
const registerValidationRules = [
  body('email')
    .isEmail()
    .withMessage('올바른 이메일 형식이 아닙니다')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 8 })
    .withMessage('비밀번호는 최소 8자 이상이어야 합니다')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('비밀번호는 대문자, 소문자, 숫자, 특수문자를 포함해야 합니다'),

  body('name')
    .isLength({ min: 2, max: 50 })
    .withMessage('이름은 최소 2자, 최대 50자여야 합니다')
    .trim(),

  body('phone')
    .matches(/^010-\d{4}-\d{4}$/)
    .withMessage('전화번호 형식은 010-XXXX-XXXX여야 합니다')
];

/**
 * POST /api/v1/auth/register
 * 회원가입 엔드포인트
 */
router.post('/register', registerValidationRules, async (req, res, next) => {
  try {
    // 1. 입력 유효성 검사
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // 첫 번째 오류만 반환 (사용자 친화적)
      const firstError = errors.array()[0];
      return res.status(400).json({
        success: false,
        error: firstError.msg
      });
    }

    const { email, password, name, phone } = req.body;

    // 2. UserService 인스턴스 가져오기
    const userService = req.app.get('userService');
    if (!userService) {
      throw new Error('UserService가 초기화되지 않았습니다');
    }

    // 3. 이메일 중복 확인
    const existingUserByEmail = await userService.findByEmail(email);
    if (existingUserByEmail) {
      return res.status(409).json({
        success: false,
        error: '이미 사용 중인 이메일입니다'
      });
    }

    // 4. 전화번호 중복 확인
    const existingUserByPhone = await userService.findByPhone(phone);
    if (existingUserByPhone) {
      return res.status(409).json({
        success: false,
        error: '이미 사용 중인 전화번호입니다'
      });
    }

    // 5. 비밀번호 해싱 (auth-lib 사용)
    const passwordHash = await hashPassword(password);

    // 6. 트랜잭션 내에서 사용자 생성과 역할 부여
    const pgPool = req.app.get('pgPool');
    const client = await pgPool.connect();

    try {
      await client.query('BEGIN');

      // 사용자 생성
      const createUserQuery = `
        INSERT INTO users (email, password_hash, name, phone, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
        RETURNING id, email, name, phone, status, created_at
      `;

      const userResult = await client.query(createUserQuery, [
        email,
        passwordHash,
        name,
        phone
      ]);

      const newUser = userResult.rows[0];

      // Seeker 역할 자동 부여
      const createRoleQuery = `
        INSERT INTO user_roles (user_id, role_type, is_active, created_at, updated_at)
        VALUES ($1, 'seeker', true, NOW(), NOW())
      `;

      await client.query(createRoleQuery, [newUser.id]);

      await client.query('COMMIT');

      // 7. 성공 응답 (비밀번호 해시 제외)
      res.status(201).json({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          phone: newUser.phone,
          status: newUser.status,
          createdAt: newUser.created_at
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    // 에러 로깅 (프로덕션에서는 더 정교한 로깅 필요)
    console.error('회원가입 에러:', error);

    // 데이터베이스 제약 조건 위반 처리
    if (error.code === '23505') {  // unique_violation
      if (error.constraint === 'users_email_key') {
        return res.status(409).json({
          success: false,
          error: '이미 사용 중인 이메일입니다'
        });
      }
      if (error.constraint === 'users_phone_key') {
        return res.status(409).json({
          success: false,
          error: '이미 사용 중인 전화번호입니다'
        });
      }
    }

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '회원가입 처리 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;