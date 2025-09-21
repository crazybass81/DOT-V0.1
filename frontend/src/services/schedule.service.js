/**
 * DOT Platform Frontend - 스케줄 서비스
 * 근무 스케줄 관리 API와 통신하는 서비스 모듈
 */

import api, { API_ENDPOINTS } from './api-client';

// 스케줄 서비스
const scheduleService = {
  /**
   * 스케줄 목록 조회
   * @param {Object} params - 조회 조건
   * @param {string} params.startDate - 시작일 (YYYY-MM-DD)
   * @param {string} params.endDate - 종료일 (YYYY-MM-DD)
   * @param {string} params.businessId - 사업장 ID
   * @param {string} params.userId - 사용자 ID (선택)
   * @returns {Promise} 스케줄 목록
   */
  getSchedules: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.SCHEDULE.LIST, params);
    return response.data;
  },

  /**
   * 스케줄 상세 조회
   * @param {string} scheduleId - 스케줄 ID
   * @returns {Promise} 스케줄 상세 정보
   */
  getSchedule: async (scheduleId) => {
    const response = await api.get(API_ENDPOINTS.SCHEDULE.GET(scheduleId));
    return response.data;
  },

  /**
   * 스케줄 생성
   * @param {Object} scheduleData - 스케줄 정보
   * @param {string} scheduleData.title - 스케줄 제목
   * @param {string} scheduleData.startTime - 시작 시간
   * @param {string} scheduleData.endTime - 종료 시간
   * @param {string} scheduleData.date - 날짜
   * @param {string} scheduleData.userId - 담당자 ID
   * @param {string} scheduleData.businessId - 사업장 ID
   * @returns {Promise} 생성된 스케줄 정보
   */
  createSchedule: async (scheduleData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.CREATE, scheduleData);
    return response.data;
  },

  /**
   * 스케줄 수정
   * @param {string} scheduleId - 스케줄 ID
   * @param {Object} scheduleData - 수정할 스케줄 정보
   * @returns {Promise} 수정된 스케줄 정보
   */
  updateSchedule: async (scheduleId, scheduleData) => {
    const response = await api.put(API_ENDPOINTS.SCHEDULE.UPDATE(scheduleId), scheduleData);
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
   * @param {Object} assignData - 할당 정보
   * @param {string} assignData.scheduleId - 스케줄 ID
   * @param {string} assignData.userId - 사용자 ID
   * @param {string} assignData.role - 역할
   * @returns {Promise} 할당 응답
   */
  assignSchedule: async (assignData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.ASSIGN, assignData);
    return response.data;
  },

  /**
   * 스케줄 교체 요청
   * @param {Object} swapData - 교체 요청 정보
   * @param {string} swapData.fromScheduleId - 원래 스케줄 ID
   * @param {string} swapData.toScheduleId - 교체할 스케줄 ID
   * @param {string} swapData.reason - 교체 사유
   * @returns {Promise} 교체 요청 응답
   */
  requestSwap: async (swapData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.SWAP, swapData);
    return response.data;
  },

  /**
   * 스케줄 변경 요청
   * @param {Object} changeData - 변경 요청 정보
   * @param {string} changeData.scheduleId - 스케줄 ID
   * @param {string} changeData.newStartTime - 새 시작 시간
   * @param {string} changeData.newEndTime - 새 종료 시간
   * @param {string} changeData.reason - 변경 사유
   * @returns {Promise} 변경 요청 응답
   */
  requestChange: async (changeData) => {
    const response = await api.post(API_ENDPOINTS.SCHEDULE.REQUEST_CHANGE, changeData);
    return response.data;
  },

  /**
   * 주간 스케줄 조회
   * @param {Object} params - 조회 조건
   * @param {string} params.weekStart - 주 시작일 (YYYY-MM-DD)
   * @param {string} params.businessId - 사업장 ID
   * @returns {Promise} 주간 스케줄 정보
   */
  getWeeklySchedule: async (params) => {
    const response = await api.get('/schedules/weekly', params);
    return response.data;
  },

  /**
   * 월간 스케줄 조회
   * @param {Object} params - 조회 조건
   * @param {string} params.month - 월 (YYYY-MM)
   * @param {string} params.businessId - 사업장 ID
   * @returns {Promise} 월간 스케줄 정보
   */
  getMonthlySchedule: async (params) => {
    const response = await api.get('/schedules/monthly', params);
    return response.data;
  },

  /**
   * 스케줄 템플릿 조회
   * @param {string} businessId - 사업장 ID
   * @returns {Promise} 스케줄 템플릿 목록
   */
  getScheduleTemplates: async (businessId) => {
    const response = await api.get('/schedules/templates', { businessId });
    return response.data;
  },

  /**
   * 스케줄 템플릿 생성
   * @param {Object} templateData - 템플릿 정보
   * @param {string} templateData.name - 템플릿 이름
   * @param {Object} templateData.schedule - 스케줄 설정
   * @param {string} templateData.businessId - 사업장 ID
   * @returns {Promise} 생성된 템플릿 정보
   */
  createTemplate: async (templateData) => {
    const response = await api.post('/schedules/templates', templateData);
    return response.data;
  },

  /**
   * 템플릿으로 스케줄 생성
   * @param {Object} data - 템플릿 적용 정보
   * @param {string} data.templateId - 템플릿 ID
   * @param {string} data.startDate - 적용 시작일
   * @param {string} data.endDate - 적용 종료일
   * @returns {Promise} 생성된 스케줄 목록
   */
  applyTemplate: async (data) => {
    const response = await api.post('/schedules/apply-template', data);
    return response.data;
  },

  /**
   * 근무 가능 시간 조회
   * @param {Object} params - 조회 조건
   * @param {string} params.userId - 사용자 ID
   * @param {string} params.date - 날짜
   * @returns {Promise} 근무 가능 시간 정보
   */
  getAvailableHours: async (params) => {
    const response = await api.get('/schedules/available-hours', params);
    return response.data;
  },

  /**
   * 스케줄 충돌 검사
   * @param {Object} scheduleData - 검사할 스케줄 정보
   * @returns {Promise} 충돌 검사 결과
   */
  checkConflicts: async (scheduleData) => {
    const response = await api.post('/schedules/check-conflicts', scheduleData);
    return response.data;
  },

  /**
   * 자동 스케줄 생성
   * @param {Object} autoData - 자동 생성 설정
   * @param {string} autoData.businessId - 사업장 ID
   * @param {string} autoData.startDate - 시작일
   * @param {string} autoData.endDate - 종료일
   * @param {Array} autoData.constraints - 제약 조건들
   * @returns {Promise} 자동 생성된 스케줄
   */
  generateAutoSchedule: async (autoData) => {
    const response = await api.post('/schedules/auto-generate', autoData);
    return response.data;
  },

  /**
   * 스케줄 통계 조회
   * @param {Object} params - 통계 조회 조건
   * @param {string} params.businessId - 사업장 ID
   * @param {string} params.period - 기간 (week, month, year)
   * @returns {Promise} 스케줄 통계 데이터
   */
  getStatistics: async (params) => {
    const response = await api.get('/schedules/statistics', params);
    return response.data;
  },

  /**
   * 근무 시간 계산 유틸리티
   * @param {string} startTime - 시작 시간 (HH:mm)
   * @param {string} endTime - 종료 시간 (HH:mm)
   * @param {number} breakMinutes - 휴게 시간 (분)
   * @returns {Object} 계산된 근무 시간 정보
   */
  calculateWorkHours: (startTime, endTime, breakMinutes = 0) => {
    if (!startTime || !endTime) {
      return {
        totalMinutes: 0,
        workMinutes: 0,
        hours: 0,
        formatted: '0시간 0분'
      };
    }

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startTotalMin = startHour * 60 + startMin;
    let endTotalMin = endHour * 60 + endMin;

    // 종료 시간이 시작 시간보다 작으면 다음 날로 간주
    if (endTotalMin <= startTotalMin) {
      endTotalMin += 24 * 60;
    }

    const totalMinutes = endTotalMin - startTotalMin;
    const workMinutes = totalMinutes - breakMinutes;

    const hours = Math.floor(workMinutes / 60);
    const minutes = workMinutes % 60;

    return {
      totalMinutes,
      workMinutes,
      hours,
      minutes,
      formatted: `${hours}시간 ${minutes}분`
    };
  },

  /**
   * 날짜 범위 생성 유틸리티
   * @param {string} startDate - 시작일 (YYYY-MM-DD)
   * @param {string} endDate - 종료일 (YYYY-MM-DD)
   * @returns {Array} 날짜 배열
   */
  generateDateRange: (startDate, endDate) => {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0]);
    }

    return dates;
  }
};

export default scheduleService;