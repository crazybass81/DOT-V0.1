/**
 * T156-T160: 스케줄 컨트롤러
 * 스케줄 관련 비즈니스 로직 처리
 */

const ScheduleManager = require('../lib/schedule-lib/src');
const { getPool } = require('../config/database');

class ScheduleController {
  constructor() {
    this.pool = getPool();
    this.scheduleManager = new ScheduleManager(this.pool);
  }

  /**
   * 주간 스케줄 생성
   */
  createWeeklySchedule = async (req, res) => {
    try {
      const scheduleData = {
        ...req.body,
        createdBy: req.user.id
      };

      // 유효성 검증
      const validation = await this.scheduleManager.validateSchedule(scheduleData);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors
        });
      }

      // 스케줄 생성
      const result = await this.scheduleManager.createWeeklySchedule(scheduleData);

      res.status(201).json({
        success: true,
        data: result,
        message: '주간 스케줄이 생성되었습니다'
      });

    } catch (error) {
      console.error('주간 스케줄 생성 오류:', error);

      if (error.message && error.message.includes('충돌')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: '스케줄 생성 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 월간 스케줄 생성
   */
  createMonthlySchedule = async (req, res) => {
    try {
      const scheduleData = {
        ...req.body,
        createdBy: req.user.id
      };

      const result = await this.scheduleManager.createMonthlySchedule(scheduleData);

      res.status(201).json({
        success: true,
        data: result,
        message: '월간 스케줄이 생성되었습니다'
      });

    } catch (error) {
      console.error('월간 스케줄 생성 오류:', error);
      res.status(500).json({
        success: false,
        message: '스케줄 생성 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 패턴을 사용한 스케줄 생성
   */
  createFromPattern = async (req, res) => {
    try {
      const result = await this.scheduleManager.createScheduleFromPattern(req.body);

      res.status(201).json({
        success: true,
        data: result,
        message: '패턴 기반 스케줄이 생성되었습니다'
      });

    } catch (error) {
      console.error('패턴 기반 스케줄 생성 오류:', error);
      res.status(500).json({
        success: false,
        message: error.message || '스케줄 생성 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 특정 날짜 스케줄 조회
   */
  getScheduleByDate = async (req, res) => {
    try {
      const { businessId, date } = req.query;

      if (!businessId || !date) {
        return res.status(400).json({
          success: false,
          message: 'businessId와 date는 필수입니다'
        });
      }

      const result = await this.scheduleManager.getScheduleByDate({
        businessId: parseInt(businessId),
        date
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('스케줄 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '스케줄 조회 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 주간 스케줄 조회
   */
  getWeeklySchedule = async (req, res) => {
    try {
      const { businessId, startDate, endDate } = req.query;

      if (!businessId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'businessId, startDate, endDate는 필수입니다'
        });
      }

      const result = await this.scheduleManager.getWeeklySchedule({
        businessId: parseInt(businessId),
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('주간 스케줄 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '스케줄 조회 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 직원별 스케줄 조회
   */
  getEmployeeSchedule = async (req, res) => {
    try {
      const { employeeId, startDate, endDate } = req.query;

      if (!employeeId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'employeeId, startDate, endDate는 필수입니다'
        });
      }

      const result = await this.scheduleManager.getEmployeeSchedule({
        employeeId: parseInt(employeeId),
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('직원 스케줄 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '스케줄 조회 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 스케줄 충돌 체크
   */
  checkConflicts = async (req, res) => {
    try {
      const { employeeId, date, startTime, endTime } = req.query;

      const result = await this.scheduleManager.checkConflicts({
        employeeId: parseInt(employeeId),
        date,
        startTime,
        endTime
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('충돌 체크 오류:', error);
      res.status(500).json({
        success: false,
        message: '충돌 체크 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 근무 시간 계산
   */
  calculateWorkHours = async (req, res) => {
    try {
      const { employeeId, startDate, endDate } = req.query;

      const result = await this.scheduleManager.calculateWorkHours({
        employeeId: parseInt(employeeId),
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('근무 시간 계산 오류:', error);
      res.status(500).json({
        success: false,
        message: '근무 시간 계산 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 초과 근무 계산
   */
  calculateOvertimeHours = async (req, res) => {
    try {
      const { employeeId, date, standardHours } = req.query;

      const result = await this.scheduleManager.calculateOvertimeHours({
        employeeId: parseInt(employeeId),
        date,
        standardHours: parseInt(standardHours) || 8
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('초과 근무 계산 오류:', error);
      res.status(500).json({
        success: false,
        message: '초과 근무 계산 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 스케줄 수정
   */
  updateSchedule = async (req, res) => {
    try {
      const scheduleId = req.params.id;
      const updateData = {
        ...req.body,
        scheduleId: parseInt(scheduleId),
        userId: req.user.id
      };

      const result = await this.scheduleManager.updateSchedule(updateData);

      res.json({
        success: true,
        data: result,
        message: '스케줄이 수정되었습니다'
      });

    } catch (error) {
      console.error('스케줄 수정 오류:', error);
      res.status(500).json({
        success: false,
        message: '스케줄 수정 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 스케줄 삭제
   */
  deleteSchedule = async (req, res) => {
    try {
      const scheduleId = req.params.id;
      const { reason } = req.body;

      const result = await this.scheduleManager.deleteSchedule({
        scheduleId: parseInt(scheduleId),
        reason,
        userId: req.user.id
      });

      res.json({
        success: true,
        data: result,
        message: '스케줄이 취소되었습니다'
      });

    } catch (error) {
      console.error('스케줄 삭제 오류:', error);
      res.status(500).json({
        success: false,
        message: '스케줄 삭제 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 스케줄 변경 이력 조회
   */
  getScheduleHistory = async (req, res) => {
    try {
      const scheduleId = req.params.id;

      const result = await this.scheduleManager.getScheduleHistory({
        scheduleId: parseInt(scheduleId)
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('이력 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '이력 조회 중 오류가 발생했습니다'
      });
    }
  };

  /**
   * 권한 체크 헬퍼 - Manager 권한
   */
  async checkManagerPermission(userId, businessId) {
    try {
      const result = await this.pool.query(`
        SELECT 1 FROM user_roles
        WHERE user_id = $1
          AND business_id = $2
          AND role_type IN ('Manager', 'Owner')
          AND is_active = true
        LIMIT 1
      `, [userId, businessId]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('권한 체크 오류:', error);
      return false;
    }
  }

  /**
   * 권한 체크 헬퍼 - 스케줄 수정 권한
   */
  async checkSchedulePermission(userId, scheduleId) {
    try {
      const result = await this.pool.query(`
        SELECT 1 FROM schedule_shifts ss
        JOIN schedules s ON s.id = ss.schedule_id
        JOIN user_roles ur ON ur.business_id = s.business_id
        WHERE ss.id = $1
          AND ur.user_id = $2
          AND ur.role_type IN ('Manager', 'Owner')
          AND ur.is_active = true
        LIMIT 1
      `, [scheduleId, userId]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('스케줄 권한 체크 오류:', error);
      return false;
    }
  }

  /**
   * 스케줄 교환 요청
   */
  requestSwap = async (req, res) => {
    // T161-T165에서 구현
    res.status(501).json({
      success: false,
      message: '아직 구현되지 않은 기능입니다'
    });
  };

  /**
   * 요청 승인
   */
  approveRequest = async (req, res) => {
    // T161-T165에서 구현
    res.status(501).json({
      success: false,
      message: '아직 구현되지 않은 기능입니다'
    });
  };

  /**
   * 요청 거절
   */
  rejectRequest = async (req, res) => {
    // T161-T165에서 구현
    res.status(501).json({
      success: false,
      message: '아직 구현되지 않은 기능입니다'
    });
  };
}

module.exports = new ScheduleController();