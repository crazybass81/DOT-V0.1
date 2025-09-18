/**
 * T042, T044: JWT 토큰 생성 및 검증 구현 (GREEN phase)
 * jsonwebtoken을 사용한 실제 구현
 */

const jwt = require('jsonwebtoken');

// 기본 만료 시간
const DEFAULT_ACCESS_TOKEN_EXPIRY = '1h';
const DEFAULT_REFRESH_TOKEN_EXPIRY = '7d';

/**
 * JWT 액세스 토큰 생성
 * @param {object} payload - 토큰에 포함할 데이터
 * @param {string} secret - JWT 시크릿 (옵션, 기본값: process.env.JWT_SECRET)
 * @param {string} expiresIn - 만료 시간 (옵션, 기본값: 1h)
 * @returns {Promise<string>} 생성된 JWT 토큰
 */
async function generateToken(payload, secret, expiresIn) {
  // 입력 검증
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }

  // 시크릿 설정
  const jwtSecret = secret || process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT secret is required');
  }

  // 토큰 생성 옵션
  const options = {
    expiresIn: expiresIn || DEFAULT_ACCESS_TOKEN_EXPIRY
  };

  // Promise로 래핑
  return new Promise((resolve, reject) => {
    jwt.sign(payload, jwtSecret, options, (err, token) => {
      if (err) {
        reject(new Error(`Failed to generate token: ${err.message}`));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * JWT 리프레시 토큰 생성
 * @param {object} payload - 토큰에 포함할 데이터
 * @param {string} secret - JWT 시크릿 (옵션)
 * @returns {Promise<string>} 생성된 리프레시 토큰
 */
async function generateRefreshToken(payload, secret) {
  // 리프레시 토큰 표시 추가
  const refreshPayload = {
    ...payload,
    type: 'refresh'
  };

  // 리프레시 시크릿 사용 (별도 시크릿 권장)
  const refreshSecret = secret || process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  return generateToken(refreshPayload, refreshSecret, DEFAULT_REFRESH_TOKEN_EXPIRY);
}

/**
 * JWT 토큰 검증
 * @param {string} token - 검증할 토큰
 * @param {string} secret - JWT 시크릿 (옵션)
 * @returns {Promise<object>} 디코딩된 페이로드
 */
async function verifyToken(token, secret) {
  // 입력 검증
  if (!token) {
    throw new Error('Token is required');
  }

  // 시크릿 설정
  const jwtSecret = secret || process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT secret is required');
  }

  // Promise로 래핑
  return new Promise((resolve, reject) => {
    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

/**
 * 토큰 디코딩 (검증 없이)
 * @param {string} token - 디코딩할 토큰
 * @returns {object|null} 디코딩된 페이로드 또는 null
 */
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}

/**
 * 토큰 만료 시간 확인
 * @param {string} token - 확인할 토큰
 * @returns {number|null} 만료 시간 (Unix timestamp) 또는 null
 */
function getTokenExpiry(token) {
  const decoded = decodeToken(token);
  return decoded ? decoded.exp : null;
}

/**
 * 토큰이 만료되었는지 확인
 * @param {string} token - 확인할 토큰
 * @returns {boolean} 만료 여부
 */
function isTokenExpired(token) {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;

  const now = Math.floor(Date.now() / 1000);
  return now >= expiry;
}

/**
 * 토큰 갱신 (리프레시 토큰으로 새 액세스 토큰 생성)
 * @param {string} refreshToken - 리프레시 토큰
 * @param {string} secret - JWT 시크릿 (옵션)
 * @returns {Promise<object>} 새 액세스 토큰과 페이로드
 */
async function refreshAccessToken(refreshToken, secret) {
  try {
    // 리프레시 토큰 검증
    const refreshSecret = secret || process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = await verifyToken(refreshToken, refreshSecret);

    // 리프레시 토큰인지 확인
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    // 새 액세스 토큰 생성을 위한 페이로드 준비
    const newPayload = { ...decoded };
    delete newPayload.type;
    delete newPayload.iat;
    delete newPayload.exp;

    // 새 액세스 토큰 생성
    const accessSecret = process.env.JWT_SECRET;
    const newAccessToken = await generateToken(newPayload, accessSecret);

    return {
      accessToken: newAccessToken,
      payload: newPayload
    };
  } catch (error) {
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  getTokenExpiry,
  isTokenExpired,
  refreshAccessToken,
  DEFAULT_ACCESS_TOKEN_EXPIRY,
  DEFAULT_REFRESH_TOKEN_EXPIRY
};