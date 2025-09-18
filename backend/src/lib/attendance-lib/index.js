/**
 * 근태 관리 라이브러리
 * GPS 위치 검증, QR 코드 생성/검증, 근태 기록 관리
 */

const gps = require('./gps');
const qr = require('./qr');
const validation = require('./validation');

module.exports = {
  // GPS 관련
  calculateDistance: gps.calculateDistance,
  isWithinRadius: gps.isWithinRadius,

  // QR 코드 관련
  generateQRCode: qr.generateQRCode,
  verifyQRCode: qr.verifyQRCode,

  // 검증 관련
  validateCheckIn: validation.validateCheckIn,
  validateCheckOut: validation.validateCheckOut,
  calculateWorkHours: validation.calculateWorkHours,

  // CLI 명령어용
  cli: require('./cli')
};