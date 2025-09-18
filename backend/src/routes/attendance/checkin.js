/**
 * T131: POST /api/v1/attendance/checkin 라우트
 * GPS 및 QR 방식 체크인 API
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { validateCheckInRequest, requireJSON } = require('../../middleware/validation');
const { apiLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const attendanceController = require('../../controllers/attendance.controller');

/**
 * @route   POST /api/v1/attendance/checkin
 * @desc    출근 체크인
 * @access  Private
 * @body    {
 *   businessId: number (required),
 *   method: 'gps' | 'qr' (required),
 *   location: { latitude: number, longitude: number } (GPS 방식 시 필수),
 *   qrToken: string (QR 방식 시 필수)
 * }
 */
router.post('/checkin',
  // Rate Limiting 적용 (체크인은 좀 더 엄격하게)
  apiLimiter,

  // Content-Type 검증
  requireJSON,

  // JWT 인증 필요
  authenticate,

  // 요청 데이터 검증
  validateCheckInRequest,

  // 컨트롤러 호출
  asyncHandler(attendanceController.checkIn)
);

/**
 * @route   POST /api/v1/attendance/checkin/validate
 * @desc    체크인 가능 여부 사전 검증 (UI에서 버튼 활성화용)
 * @access  Private
 * @body    {
 *   businessId: number,
 *   location: { latitude: number, longitude: number }
 * }
 */
router.post('/checkin/validate',
  // Rate Limiting
  apiLimiter,

  // Content-Type 검증
  requireJSON,

  // JWT 인증
  authenticate,

  // 검증 컨트롤러
  asyncHandler(attendanceController.validateCheckIn)
);

/**
 * @route   POST /api/v1/attendance/checkin/cancel
 * @desc    잘못된 체크인 취소 (5분 이내만 가능)
 * @access  Private
 * @body    {
 *   businessId: number,
 *   attendanceId: number,
 *   reason: string
 * }
 */
router.post('/checkin/cancel',
  // Rate Limiting
  apiLimiter,

  // Content-Type 검증
  requireJSON,

  // JWT 인증
  authenticate,

  // 체크인 취소 컨트롤러
  asyncHandler(attendanceController.cancelCheckIn)
);

module.exports = router;