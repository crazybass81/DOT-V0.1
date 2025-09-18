/**
 * T037, T039: 비밀번호 해싱 및 검증 구현 (GREEN phase)
 * bcrypt를 사용한 실제 구현
 */

const bcrypt = require('bcrypt');

// Salt rounds - 10은 적절한 보안/성능 균형
const SALT_ROUNDS = 10;

/**
 * 비밀번호를 bcrypt로 해싱
 * @param {string} password - 해싱할 비밀번호
 * @returns {Promise<string>} 해싱된 비밀번호
 */
async function hashPassword(password) {
  // 입력 검증
  if (password === null || password === undefined) {
    throw new Error('Password must be a string');
  }

  if (typeof password !== 'string') {
    throw new Error('Password must be a string');
  }

  if (password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  // bcrypt 해싱
  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    return hash;
  } catch (error) {
    throw new Error(`Failed to hash password: ${error.message}`);
  }
}

/**
 * 비밀번호가 해시와 일치하는지 검증
 * @param {string} password - 검증할 비밀번호
 * @param {string} hash - 비교할 해시
 * @returns {Promise<boolean>} 일치 여부
 */
async function verifyPassword(password, hash) {
  // 입력 검증
  if (typeof password !== 'string') {
    return false;
  }

  if (typeof hash !== 'string') {
    throw new Error('Hash must be a string');
  }

  // bcrypt 검증
  try {
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  } catch (error) {
    // bcrypt compare는 잘못된 해시 형식에도 false를 반환하는게 더 안전
    return false;
  }
}

/**
 * 비밀번호 강도 검증 (선택적 유틸리티)
 * @param {string} password - 검증할 비밀번호
 * @returns {object} 강도 검증 결과
 */
function validatePasswordStrength(password) {
  const result = {
    isValid: true,
    errors: []
  };

  if (password.length < 8) {
    result.errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    result.errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    result.errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    result.errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    result.errors.push('Password must contain at least one special character');
  }

  result.isValid = result.errors.length === 0;
  return result;
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  SALT_ROUNDS
};