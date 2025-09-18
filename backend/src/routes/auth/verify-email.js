/**
 * T244: 이메일 인증 API 엔드포인트
 * 이메일 인증 토큰 검증 및 계정 활성화
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const logger = require('../../utils/logger');
const { verifyToken } = require('../../lib/auth-lib/token');
const { ValidationError } = require('../../middleware/errorHandler');

/**
 * POST /api/v1/auth/verify-email
 * 이메일 인증 토큰 검증
 */
router.post('/verify-email', async (req, res) => {
  const client = await pool.connect();

  try {
    const { token } = req.body;

    // 토큰 필수 확인
    if (!token) {
      throw new ValidationError('인증 토큰이 필요합니다');
    }

    // 토큰 검증
    let decoded;
    try {
      decoded = await verifyToken(token);
    } catch (error) {
      if (error.message.includes('expired')) {
        return res.status(400).json({
          success: false,
          error: '인증 토큰이 만료되었습니다. 새로운 인증 메일을 요청해주세요.'
        });
      }
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 인증 토큰입니다'
      });
    }

    // 토큰 타입 확인
    if (decoded.type !== 'email-verification') {
      return res.status(400).json({
        success: false,
        error: '올바른 인증 토큰이 아닙니다'
      });
    }

    // 트랜잭션 시작
    await client.query('BEGIN');

    // 사용자 조회
    const userQuery = `
      SELECT id, email, email_verified, status
      FROM users
      WHERE id = $1
    `;
    const userResult = await client.query(userQuery, [decoded.userId]);

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다'
      });
    }

    const user = userResult.rows[0];

    // 이미 인증된 경우
    if (user.email_verified) {
      await client.query('ROLLBACK');
      return res.status(200).json({
        success: true,
        message: '이미 인증된 이메일입니다'
      });
    }

    // 이메일 일치 확인
    if (user.email !== decoded.email) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: '토큰의 이메일과 사용자 이메일이 일치하지 않습니다'
      });
    }

    // 이메일 인증 처리
    const updateQuery = `
      UPDATE users
      SET
        email_verified = true,
        status = CASE
          WHEN status = 'inactive' THEN 'active'
          ELSE status
        END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, email_verified, status
    `;
    const updateResult = await client.query(updateQuery, [decoded.userId]);

    // 인증 이력 저장
    const historyQuery = `
      INSERT INTO user_verifications (
        user_id,
        verification_type,
        verified_at,
        token_hash,
        ip_address,
        user_agent
      ) VALUES ($1, 'email', NOW(), $2, $3, $4)
      ON CONFLICT (user_id, verification_type)
      DO UPDATE SET
        verified_at = NOW(),
        token_hash = EXCLUDED.token_hash
    `;

    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex');

    await client.query(historyQuery, [
      decoded.userId,
      tokenHash,
      req.ip,
      req.headers['user-agent']
    ]);

    await client.query('COMMIT');

    logger.info(`이메일 인증 완료: userId=${decoded.userId}, email=${decoded.email}`);

    res.json({
      success: true,
      message: '이메일 인증이 완료되었습니다',
      data: {
        email: updateResult.rows[0].email,
        emailVerified: updateResult.rows[0].email_verified,
        status: updateResult.rows[0].status
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');

    logger.error('이메일 인증 오류:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: '이메일 인증 처리 중 오류가 발생했습니다'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/auth/resend-verification
 * 인증 메일 재발송
 */
router.post('/resend-verification', async (req, res) => {
  const client = await pool.connect();

  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('이메일이 필요합니다');
    }

    // 사용자 조회
    const userQuery = `
      SELECT id, email, email_verified, name
      FROM users
      WHERE email = $1
    `;
    const userResult = await client.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      // 보안상 이유로 사용자 존재 여부를 노출하지 않음
      return res.json({
        success: true,
        message: '인증 메일이 발송되었습니다. 이메일을 확인해주세요.'
      });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        error: '이미 인증된 이메일입니다'
      });
    }

    // Rate limiting 체크 (1시간에 3번)
    const rateLimitQuery = `
      SELECT COUNT(*) as count
      FROM email_verification_requests
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '1 hour'
    `;
    const rateLimitResult = await client.query(rateLimitQuery, [user.id]);

    if (rateLimitResult.rows[0].count >= 3) {
      return res.status(429).json({
        success: false,
        error: '너무 많은 요청입니다. 1시간 후에 다시 시도해주세요.'
      });
    }

    // 새 인증 토큰 생성
    const verificationToken = await require('../../lib/auth-lib/token').generateToken(
      {
        userId: user.id,
        email: user.email,
        type: 'email-verification'
      },
      { expiresIn: '24h' }
    );

    // 요청 기록
    await client.query(`
      INSERT INTO email_verification_requests (
        user_id,
        requested_at,
        ip_address
      ) VALUES ($1, NOW(), $2)
    `, [user.id, req.ip]);

    // TODO: 실제 이메일 발송 로직
    // 여기서는 개발 환경이므로 토큰을 응답에 포함 (실제로는 이메일로만 발송)
    const isDevelopment = process.env.NODE_ENV === 'development';

    logger.info(`인증 메일 재발송: userId=${user.id}, email=${user.email}`);

    res.json({
      success: true,
      message: '인증 메일이 발송되었습니다. 이메일을 확인해주세요.',
      ...(isDevelopment && { verificationToken }) // 개발 환경에서만 토큰 반환
    });

  } catch (error) {
    logger.error('인증 메일 재발송 오류:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: '인증 메일 발송 중 오류가 발생했습니다'
    });
  } finally {
    client.release();
  }
});

module.exports = router;