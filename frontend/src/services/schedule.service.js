/**
 * DOT Platform Frontend - 스케줄 서비스
 * 근무 스케줄 관리 API와 통신하는 서비스 모듈
 */

import api, { API_ENDPOINTS } from './api';

// 스케줄 서비스
const scheduleService = {
  /**
   * 스케줄 목록 조회
   * @param {Object} params - 조회 조건
   * @param {string} params.businessId - 사업장 ID
   * @param {string} params.startDate - 시작일
   * @param {string} params.endDate - 종료일
   * @param {string} params.userId - 사용자 ID (선택)
   * @returns {Promise} 스케줄 목록
   */
  getSchedules: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.SCHEDULE.LIST, params);
    return response.data;
  },

  /**
   * 특정 스케줄 조회
   * @param {string} scheduleId - 스케줄 ID
   * @returns {Promise} 스케줄 정보
   */
  getSchedule: async (scheduleId) => {
    const response = await api.get(API_ENDPOINTS.SCHEDULE.GET(scheduleId));
    return response.data;
  },

  /**
   * 스케줄 생성
   * @param {Object} scheduleData - 스케줄 정보
   * @param {string} scheduleData.businessId - 사업장 ID
   * @param {string} scheduleData.date - 날짜
   * @param {string} scheduleData.startTime - 시작 시간
   * @param {string} scheduleData.endTime - 종료 시간
   * @param {Array} scheduleData.requiredPositions - 필요 포지션
   * @returns {Promise} 생성된 스케줄
   */
  createSchedule: async (scheduleData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.CREATE, scheduleData);
    return response.data;
  },

  /**
   * 스케줄 수정
   * @param {string} scheduleId - 스케줄 ID
   * @param {Object} updateData - 수정할 정보
   * @returns {Promise} 수정된 스케줄
   */
  updateSchedule: async (scheduleId, updateData) => {
    const response = await api.put(API_ENDPOINTS.SCHEDULE.UPDATE(scheduleId), updateData);
    return response.data;
  },

  /**
   * 스케줄 삭제
   * @param {string} scheduleId - 스케줄 ID
   * @returns {Promise} 삭제 응답
   */
  deleteSchedule: async (scheduleId) => {
    const response = await api.delete(API_ENDPOINTS.SCHEDULE.DELETE(scheduleId));
    return response.data;
  },

  /**
   * 스케줄 할당
   * @param {Object} assignmentData - 할당 정보
   * @param {string} assignmentData.scheduleId - 스케줄 ID
   * @param {Array} assignmentData.assignments - 할당 목록
   * @returns {Promise} 할당 결과
   */
  assignSchedule: async (assignmentData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.ASSIGN, assignmentData);
    return response.data;
  },

  /**
   * 스케줄 교대 요청
   * @param {Object} swapData - 교대 요청 정보
   * @param {string} swapData.fromScheduleId - 원래 스케줄 ID
   * @param {string} swapData.toScheduleId - 대상 스케줄 ID
   * @param {string} swapData.reason - 교대 사유
   * @returns {Promise} 교대 요청 결과
   */
  requestSwap: async (swapData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.SWAP, swapData);
    return response.data;
  },

  /**
   * 스케줄 변경 요청
   * @param {Object} changeData - 변경 요청 정보
   * @param {string} changeData.scheduleId - 스케줄 ID
   * @param {string} changeData.requestType - 요청 유형 (absence, late, early-leave)
   * @param {string} changeData.reason - 변경 사유
   * @returns {Promise} 변경 요청 결과
   */
  requestChange: async (changeData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.REQUEST_CHANGE, changeData);
    return response.data;
  },

  /**
   * 주간 스케줄 조회
   * @param {Date} date - 기준 날짜
   * @param {string} businessId - 사업장 ID
   * @returns {Promise} 주간 스케줄
   */
  getWeeklySchedule: async (date, businessId) => {
    // 주의 시작일과 종료일 계산
    const startOfWeek = new Date(date);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    return scheduleService.getSchedules({
      businessId,
      startDate: startOfWeek.toISOString().split('T')[0],
      endDate: endOfWeek.toISOString().split('T')[0]
    });
  },

  /**
   * 월간 스케줄 조회
   * @param {number} year - 년도
   * @param {number} month - 월 (1-12)
   * @param {string} businessId - 사업장 ID
   * @returns {Promise} 월간 스케줄
   */
  getMonthlySchedule: async (year, month, businessId) => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // 마지막 날

    return scheduleService.getSchedules({
      businessId,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
  },

  /**
   * 스케줄 통계 조회
   * @param {Object} params - 통계 조회 조건
   * @param {string} params.businessId - 사업장 ID
   * @param {string} params.period - 기간 (week, month, year)
   * @returns {Promise} 스케줄 통계
   */
  getStatistics: async (params) => {
    const response = await api.get('/schedules/statistics', params);
    return response.data;
  },

  /**
   * 스케줄 충돌 확인
   * @param {Array} schedules - 스케줄 목록
   * @param {Object} newSchedule - 새 스케줄
   * @returns {boolean} 충돌 여부
   */
  checkConflict: (schedules, newSchedule) => {
    const newStart = new Date(`${newSchedule.date} ${newSchedule.startTime}`);
    const newEnd = new Date(`${newSchedule.date} ${newSchedule.endTime}`);

    return schedules.some(schedule => {
      const existingStart = new Date(`${schedule.date} ${schedule.startTime}`);
      const existingEnd = new Date(`${schedule.date} ${schedule.endTime}`);

      return (newStart < existingEnd && newEnd > existingStart);
    });
  },

  /**
   * 근무 시간 계산
   * @param {string} startTime - 시작 시간
   * @param {string} endTime - 종료 시간
   * @returns {number} 근무 시간 (분)
   */
  calculateDuration: (startTime, endTime) => {
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);

    let duration = (end - start) / 1000 / 60; // 분 단위

    // 자정을 넘는 경우 처리
    if (duration < 0) {
      duration += 24 * 60;
    }

    return duration;
  },

  /**
   * 스케줄 상태 텍스트 변환
   * @param {string} status - 스케줄 상태
   * @returns {string} 한글 상태
   */
  getStatusText: (status) => {
    const statusMap = {
      'pending': '대기',
      'confirmed': '확정',
      'in-progress': '진행 중',
      'completed': '완료',
      'cancelled': '취소',
      'swap-requested': '교대 요청',
      'change-requested': '변경 요청'
    };

    return statusMap[status] || status;
  },

  /**
   * 포지션 텍스트 변환
   * @param {string} position - 포지션 코드
   * @returns {string} 한글 포지션명
   */
  getPositionText: (position) => {
    const positionMap = {
      'manager': '매니저',
      'cook': '주방',
      'hall': '홀',
      'cashier': '계산대',
      'delivery': '배달',
      'part-time': '아르바이트',
      'full-time': '정직원'
    };

    return positionMap[position] || position;
  }
};

export default scheduleService;