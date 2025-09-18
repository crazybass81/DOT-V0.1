/**
 * 인증 관련 유틸리티 함수
 * JWT 토큰 생성 및 검증
 */

const jwt = require('jsonwebtoken');
const logger = require('./logger');

// JWT 시크릿 (환경 변수에서 가져오거나 기본값 사용)
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * JWT 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터
 * @param {Object} options - 토큰 옵션
 * @returns {Promise<string>} JWT 토큰
 */
async function generateToken(payload, options = {}) {
  try {
    const tokenOptions = {
      expiresIn: options.expiresIn || JWT_EXPIRES_IN,
      issuer: 'dot-platform',
      audience: 'dot-platform-api'
    };

    const token = jwt.sign(payload, JWT_SECRET, tokenOptions);

    logger.debug('JWT 토큰 생성 완료', { userId: payload.id });

    return token;
  } catch (error) {
    logger.error('JWT 토큰 생성 실패:', error);
    throw new Error('토큰 생성에 실패했습니다');
  }
}

/**
 * Refresh 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터
 * @returns {Promise<string>} Refresh 토큰
 */
async function generateRefreshToken(payload) {
  try {
    const tokenOptions = {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'dot-platform',
      audience: 'dot-platform-api'
    };

    const token = jwt.sign(
      { ...payload, type: 'refresh' },
      JWT_SECRET,
      tokenOptions
    );

    logger.debug('Refresh 토큰 생성 완료', { userId: payload.id });

    return token;
  } catch (error) {
    logger.error('Refresh 토큰 생성 실패:', error);
    throw new Error('Refresh 토큰 생성에 실패했습니다');
  }
}

/**
 * JWT 토큰 검증
 * @param {string} token - 검증할 토큰
 * @returns {Promise<Object>} 디코드된 토큰 페이로드
 */
async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'dot-platform',
      audience: 'dot-platform-api'
    });

    logger.debug('JWT 토큰 검증 성공', { userId: decoded.id });

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('만료된 토큰', { error: error.message });
      throw new Error('토큰이 만료되었습니다');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('유효하지 않은 토큰', { error: error.message });
      throw new Error('유효하지 않은 토큰입니다');
    }

    logger.error('JWT 토큰 검증 실패:', error);
    throw new Error('토큰 검증에 실패했습니다');
  }
}

/**
 * 토큰에서 Bearer 제거
 * @param {string} authHeader - Authorization 헤더 값
 * @returns {string|null} 토큰 또는 null
 */
function extractToken(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * 비밀번호 해시 생성 (bcrypt 사용)
 * @param {string} password - 평문 비밀번호
 * @returns {Promise<string>} 해시된 비밀번호
 */
async function hashPassword(password) {
  const bcrypt = require('bcrypt');
  const saltRounds = 10;

  try {
    const hash = await bcrypt.hash(password, saltRounds);
    return hash;
  } catch (error) {
    logger.error('비밀번호 해싱 실패:', error);
    throw new Error('비밀번호 처리에 실패했습니다');
  }
}

/**
 * 비밀번호 검증
 * @param {string} password - 평문 비밀번호
 * @param {string} hash - 해시된 비밀번호
 * @returns {Promise<boolean>} 일치 여부
 */
async function verifyPassword(password, hash) {
  const bcrypt = require('bcrypt');

  try {
    const match = await bcrypt.compare(password, hash);
    return match;
  } catch (error) {
    logger.error('비밀번호 검증 실패:', error);
    throw new Error('비밀번호 검증에 실패했습니다');
  }
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  extractToken,
  hashPassword,
  verifyPassword,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN
};