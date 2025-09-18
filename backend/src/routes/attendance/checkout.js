/**
 * T136: POST /api/v1/attendance/checkout 라우트
 * 퇴근 체크아웃 API
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { validateCheckOutRequest, requireJSON } = require('../../middleware/validation');
const { apiLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const attendanceController = require('../../controllers/attendance.controller');

/**
 * @route   POST /api/v1/attendance/checkout
 * @desc    퇴근 체크아웃
 * @access  Private
 * @body    {
 *   businessId: number (required),
 *   location: { latitude: number, longitude: number } (optional - 위치 검증용)
 * }
 */
router.post('/checkout',
  // Rate Limiting 적용
  apiLimiter,

  // Content-Type 검증
  requireJSON,

  // JWT 인증 필요
  authenticate,

  // 요청 데이터 검증
  validateCheckOutRequest,

  // 컨트롤러 호출
  asyncHandler(attendanceController.checkOut)
);

/**
 * @route   GET /api/v1/attendance/today-summary
 * @desc    오늘의 근무 요약 조회 (체크아웃 전 확인용)
 * @access  Private
 * @query   businessId (required)
 */
router.get('/today-summary',
  // Rate Limiting
  apiLimiter,

  // JWT 인증
  authenticate,

  // 오늘 근무 요약 조회
  asyncHandler(attendanceController.getTodaySummary)
);

/**
 * @route   POST /api/v1/attendance/break/start
 * @desc    휴게 시작
 * @access  Private
 * @body    {
 *   businessId: number,
 *   attendanceId: number,
 *   breakType: 'normal' | 'meal' | 'personal'
 * }
 */
router.post('/break/start',
  // Rate Limiting
  apiLimiter,

  // Content-Type 검증
  requireJSON,

  // JWT 인증
  authenticate,

  // 휴게 시작 처리
  asyncHandler(attendanceController.startBreak)
);

/**
 * @route   POST /api/v1/attendance/break/end
 * @desc    휴게 종료
 * @access  Private
 * @body    {
 *   businessId: number,
 *   attendanceId: number,
 *   breakId: number
 * }
 */
router.post('/break/end',
  // Rate Limiting
  apiLimiter,

  // Content-Type 검증
  requireJSON,

  // JWT 인증
  authenticate,

  // 휴게 종료 처리
  asyncHandler(attendanceController.endBreak)
);

/**
 * @route   GET /api/v1/attendance/work-duration
 * @desc    실제 근무 시간 계산 (휴게 시간 차감)
 * @access  Private
 * @query   attendanceId (required)
 */
router.get('/work-duration/:attendanceId',
  // Rate Limiting
  apiLimiter,

  // JWT 인증
  authenticate,

  // 근무 시간 계산
  asyncHandler(attendanceController.calculateWorkDuration)
);

module.exports = router;