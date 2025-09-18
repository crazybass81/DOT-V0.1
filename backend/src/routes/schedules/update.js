/**
 * T159: PUT/DELETE /api/v1/schedules 수정/삭제 라우트
 * 스케줄 수정 및 삭제 API
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requireJSON } = require('../../middleware/validation');
const { apiLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const scheduleController = require('../../controllers/schedule.controller');

/**
 * @route   PUT /api/v1/schedules/:id
 * @desc    스케줄 수정
 * @access  Private (Manager, Owner)
 * @body    {
 *   startTime: string (HH:MM),
 *   endTime: string (HH:MM),
 *   breakMinutes: number,
 *   notes: string
 * }
 */
router.put('/:id',
  apiLimiter,
  requireJSON,
  authenticate,

  // 권한 검증
  asyncHandler(async (req, res, next) => {
    const scheduleId = req.params.id;
    const userId = req.user.id;

    const hasPermission = await scheduleController.checkSchedulePermission(userId, scheduleId);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '스케줄 수정 권한이 없습니다'
      });
    }
    next();
  }),

  asyncHandler(scheduleController.updateSchedule)
);

/**
 * @route   DELETE /api/v1/schedules/:id
 * @desc    스케줄 삭제 (소프트 삭제)
 * @access  Private (Manager, Owner)
 */
router.delete('/:id',
  apiLimiter,
  authenticate,

  // 권한 검증
  asyncHandler(async (req, res, next) => {
    const scheduleId = req.params.id;
    const userId = req.user.id;

    const hasPermission = await scheduleController.checkSchedulePermission(userId, scheduleId);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '스케줄 삭제 권한이 없습니다'
      });
    }
    next();
  }),

  asyncHandler(scheduleController.deleteSchedule)
);

/**
 * @route   POST /api/v1/schedules/swap
 * @desc    스케줄 교환 요청
 * @access  Private (Employee)
 * @body    {
 *   fromScheduleId: number,
 *   toScheduleId: number,
 *   reason: string
 * }
 */
router.post('/swap',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(scheduleController.requestSwap)
);

/**
 * @route   PUT /api/v1/schedules/approve/:requestId
 * @desc    스케줄 변경 요청 승인
 * @access  Private (Manager, Owner)
 */
router.put('/approve/:requestId',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(scheduleController.approveRequest)
);

/**
 * @route   PUT /api/v1/schedules/reject/:requestId
 * @desc    스케줄 변경 요청 거절
 * @access  Private (Manager, Owner)
 */
router.put('/reject/:requestId',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(scheduleController.rejectRequest)
);

module.exports = router;