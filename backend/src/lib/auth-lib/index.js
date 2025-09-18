/**
 * T231: auth-lib 메인 진입점
 * 인증 관련 모든 모듈을 통합 export
 */

// 한글 주석 필수 - 각 모듈별 기능 설명
const password = require('./password'); // 비밀번호 해싱 및 검증
const token = require('./token');       // JWT 토큰 생성 및 검증
const session = require('./session');   // Redis 세션 관리

module.exports = {
  // 비밀번호 관련 함수들
  hashPassword: password.hashPassword,
  verifyPassword: password.verifyPassword,

  // 토큰 관련 함수들
  generateToken: token.generateToken,
  generateRefreshToken: token.generateRefreshToken,
  verifyToken: token.verifyToken,

  // 세션 관련 함수들
  createSession: session.createSession,
  getSession: session.getSession,
  deleteSession: session.deleteSession,

  // CLI 명령어용 인터페이스
  cli: require('./cli')
};