/**
 * DOT Platform Frontend - Axios 인스턴스 설정
 * API 요청을 위한 중앙화된 HTTP 클라이언트 구성
 */

import axios from 'axios';
import { store } from '../store';
import { logout, refreshToken } from '../store/slices/authSlice';
import { addToast } from '../store/slices/uiSlice';

// API 기본 URL 설정 - Vercel Functions 프록시 사용
const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');

// Socket.io 기본 URL
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

// Axios 인스턴스 생성
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30초 타임아웃
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // 쿠키 포함
});

// 요청 인터셉터 - 토큰 자동 첨부
apiClient.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state.auth.token || localStorage.getItem('dot_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 한국어 설정
    config.headers['Accept-Language'] = 'ko-KR';

    // 개발 환경에서 요청 로깅
    if (process.env.NODE_ENV === 'development') {
      console.log('📤 API Request:', {
        method: config.method.toUpperCase(),
        url: config.url,
        data: config.data,
        params: config.params,
      });
    }

    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// 응답 인터셉터 - 에러 처리 및 토큰 갱신
apiClient.interceptors.response.use(
  (response) => {
    // 개발 환경에서 응답 로깅
    if (process.env.NODE_ENV === 'development') {
      console.log('📥 API Response:', {
        url: response.config.url,
        status: response.status,
        data: response.data,
      });
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // 개발 환경에서 에러 로깅
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ API Error:', {
        url: originalRequest?.url,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
    }

    // 401 에러 처리 - 토큰 만료
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // 리프레시 토큰으로 새 토큰 발급
        const result = await store.dispatch(refreshToken()).unwrap();

        if (result.token) {
          // 새 토큰으로 원래 요청 재시도
          originalRequest.headers.Authorization = `Bearer ${result.token}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // 리프레시 토큰도 만료된 경우 로그아웃
        store.dispatch(logout());
        store.dispatch(addToast({
          type: 'error',
          message: '세션이 만료되었습니다. 다시 로그인해주세요.',
        }));

        // 로그인 페이지로 리다이렉트
        window.location.href = '/login';
      }
    }

    // 403 에러 처리 - 권한 없음
    if (error.response?.status === 403) {
      store.dispatch(addToast({
        type: 'error',
        message: error.response.data?.message || '해당 작업에 대한 권한이 없습니다.',
      }));
    }

    // 404 에러 처리 - 리소스 없음
    if (error.response?.status === 404) {
      store.dispatch(addToast({
        type: 'warning',
        message: error.response.data?.message || '요청한 리소스를 찾을 수 없습니다.',
      }));
    }

    // 422 에러 처리 - 유효성 검사 실패
    if (error.response?.status === 422) {
      const validationErrors = error.response.data?.errors;
      if (validationErrors && typeof validationErrors === 'object') {
        // 첫 번째 유효성 검사 에러 메시지 표시
        const firstError = Object.values(validationErrors)[0];
        store.dispatch(addToast({
          type: 'error',
          message: Array.isArray(firstError) ? firstError[0] : firstError,
        }));
      }
    }

    // 500 에러 처리 - 서버 에러
    if (error.response?.status >= 500) {
      store.dispatch(addToast({
        type: 'error',
        message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      }));
    }

    // 네트워크 에러 처리
    if (!error.response && error.message === 'Network Error') {
      store.dispatch(addToast({
        type: 'error',
        message: '네트워크 연결을 확인해주세요.',
      }));
    }

    // 타임아웃 에러 처리
    if (error.code === 'ECONNABORTED') {
      store.dispatch(addToast({
        type: 'error',
        message: '요청 시간이 초과되었습니다. 다시 시도해주세요.',
      }));
    }

    return Promise.reject(error);
  }
);

// 파일 업로드용 별도 인스턴스
const fileUploadClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 파일 업로드는 60초 타임아웃
  headers: {
    'Content-Type': 'multipart/form-data',
  },
  withCredentials: true,
});

// 파일 업로드 클라이언트에도 동일한 인터셉터 적용
fileUploadClient.interceptors.request.use(apiClient.interceptors.request.handlers[0].fulfilled);
fileUploadClient.interceptors.response.use(
  apiClient.interceptors.response.handlers[0].fulfilled,
  apiClient.interceptors.response.handlers[0].rejected
);

// API 헬퍼 함수들
export const api = {
  // GET 요청
  get: (url, params = {}) => apiClient.get(url, { params }),

  // POST 요청
  post: (url, data = {}) => apiClient.post(url, data),

  // PUT 요청
  put: (url, data = {}) => apiClient.put(url, data),

  // PATCH 요청
  patch: (url, data = {}) => apiClient.patch(url, data),

  // DELETE 요청
  delete: (url) => apiClient.delete(url),

  // 파일 업로드
  upload: (url, formData, onUploadProgress) => {
    return fileUploadClient.post(url, formData, {
      onUploadProgress: onUploadProgress
        ? (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onUploadProgress(percentCompleted);
          }
        : undefined,
    });
  },

  // 파일 다운로드
  download: async (url, filename) => {
    try {
      const response = await apiClient.get(url, {
        responseType: 'blob',
      });

      // Blob을 다운로드 링크로 변환
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      return true;
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  },
};

// API 엔드포인트 상수
export const API_ENDPOINTS = {
  // 인증 관련
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REGISTER: '/auth/register',
    REFRESH: '/auth/refresh',
    VERIFY: '/auth/verify',
    SWITCH_ROLE: '/auth/switch-role',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
  },

  // 사용자 관련
  USER: {
    PROFILE: '/users/profile',
    UPDATE_PROFILE: '/users/profile',
    CHANGE_PASSWORD: '/users/change-password',
    UPLOAD_AVATAR: '/users/avatar',
  },

  // 사업장 관련
  BUSINESS: {
    LIST: '/businesses',
    GET: (id) => `/businesses/${id}`,
    CREATE: '/businesses',
    UPDATE: (id) => `/businesses/${id}`,
    DELETE: (id) => `/businesses/${id}`,
    EMPLOYEES: (id) => `/businesses/${id}/employees`,
    INVITE: (id) => `/businesses/${id}/invite`,
  },

  // 근태 관련
  ATTENDANCE: {
    CHECK_IN: '/attendance/check-in',
    CHECK_OUT: '/attendance/check-out',
    BREAK_START: '/attendance/break/start',
    BREAK_END: '/attendance/break/end',
    TODAY: '/attendance/today',
    HISTORY: '/attendance/history',
    REPORT: '/attendance/report',
  },

  // 스케줄 관련
  SCHEDULE: {
    LIST: '/schedules',
    GET: (id) => `/schedules/${id}`,
    CREATE: '/schedules',
    UPDATE: (id) => `/schedules/${id}`,
    DELETE: (id) => `/schedules/${id}`,
    ASSIGN: '/schedules/assign',
    SWAP: '/schedules/swap',
    REQUEST_CHANGE: '/schedules/request-change',
  },

  // 급여 관련
  PAYROLL: {
    STATEMENTS: '/payroll/statements',
    GET_STATEMENT: (id) => `/payroll/statements/${id}`,
    CALCULATE: '/payroll/calculate',
    DOWNLOAD: (id) => `/payroll/statements/${id}/download`,
  },

  // 알림 관련
  NOTIFICATION: {
    LIST: '/notifications',
    MARK_READ: (id) => `/notifications/${id}/read`,
    MARK_ALL_READ: '/notifications/read-all',
    DELETE: (id) => `/notifications/${id}`,
    SETTINGS: '/notifications/settings',
  },

  // 문서 관련
  DOCUMENT: {
    LIST: '/documents',
    UPLOAD: '/documents/upload',
    DOWNLOAD: (id) => `/documents/${id}/download`,
    DELETE: (id) => `/documents/${id}`,
  },
};

// Socket 이벤트 상수
export const SOCKET_EVENTS = {
  // 연결 관련
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',

  // 근태 관련
  ATTENDANCE_STATUS_CHANGE: 'attendance:status-change',
  ATTENDANCE_TIME_UPDATE: 'attendance:time-update',
  ATTENDANCE_CHECKIN: 'attendance:checkin',
  ATTENDANCE_CHECKOUT: 'attendance:checkout',

  // 스케줄 관련
  SCHEDULE_CREATED: 'schedule:created',
  SCHEDULE_UPDATED: 'schedule:updated',
  SCHEDULE_DELETED: 'schedule:deleted',
  SCHEDULE_ASSIGNED: 'schedule:assigned',
  SCHEDULE_SWAP_REQUEST: 'schedule:swap-request',

  // 알림 관련
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_UNREAD_COUNT: 'notification:unread-count',

  // 시스템 관련
  SYSTEM_MAINTENANCE: 'system:maintenance',
  SYSTEM_ANNOUNCEMENT: 'system:announcement',
};

export { apiClient, fileUploadClient, API_BASE_URL, SOCKET_URL };
export default api;