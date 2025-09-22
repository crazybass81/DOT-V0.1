/**
 * DOT Platform Frontend - 인증 서비스
 * 백엔드 인증 API와 통신하는 서비스 모듈
 * 순환 종속성 해결을 위해 Redux 의존성 제거 - 순수 서비스 레이어로 구현
 */

import api, { API_ENDPOINTS } from './api-client';

// 인증 서비스
const authService = {
  /**
   * 로그인
   * @param {Object} credentials - 로그인 정보
   * @param {string} credentials.email - 이메일
   * @param {string} credentials.password - 비밀번호
   * @param {boolean} credentials.rememberMe - 자동 로그인 여부
   * @returns {Promise} 로그인 응답
   */
  login: async (credentials) => {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, credentials);

      const { token, refreshToken } = response.data;

      // API 클라이언트 헤더 설정
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      return response.data;
    } catch (error) {
      throw authService.handleError(error);
    }
  },

  /**
   * 회원가입
   * @param {Object} userData - 사용자 정보
   * @returns {Promise} 회원가입 응답
   */
  register: async (userData) => {
    const response = await api.post(API_ENDPOINTS.AUTH.REGISTER, userData);
    return response.data;
  },

  /**
   * 로그아웃
   * @returns {Promise} 로그아웃 응답
   */
  logout: async () => {
    try {
      await api.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error) {
      // 로그아웃은 실패해도 클라이언트에서는 성공으로 처리
      console.warn('Logout API failed:', error);
    } finally {
      // API 헤더 정리
      delete api.defaults.headers.common['Authorization'];
    }
  },

  /**
   * 토큰으로 사용자 정보 조회
   * @param {string} token - JWT 토큰
   * @returns {Promise} 사용자 정보 응답
   */
  verifyToken: async (token) => {
    const response = await api.get(API_ENDPOINTS.AUTH.VERIFY, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  },

  /**
   * 토큰 갱신
   * @param {string} refreshToken - 갱신 토큰
   * @returns {Promise} 새 토큰
   */
  refreshToken: async (refreshToken) => {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await api.post(API_ENDPOINTS.AUTH.REFRESH, {
        refreshToken
      });

      const { token } = response.data;

      // API 헤더 업데이트
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      return response.data;
    } catch (error) {
      throw authService.handleError(error);
    }
  },

  /**
   * 역할 전환
   * @param {string} businessId - 사업장 ID
   * @param {string} role - 전환할 역할
   * @returns {Promise} 역할 전환 응답
   */
  switchRole: async (businessId, role) => {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.SWITCH_ROLE, {
        businessId,
        role
      });

      return response.data;
    } catch (error) {
      throw authService.handleError(error);
    }
  },

  /**
   * 현재 사용자 정보 가져오기
   * @returns {Promise} 사용자 정보
   */
  getCurrentUser: async () => {
    try {
      const response = await api.get(API_ENDPOINTS.AUTH.ME);
      return response.data.user;
    } catch (error) {
      throw authService.handleError(error);
    }
  },

  /**
   * 비밀번호 찾기
   * @param {string} email - 이메일
   * @returns {Promise} 비밀번호 찾기 응답
   */
  forgotPassword: async (email) => {
    const response = await api.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
      email,
    });
    return response.data;
  },

  /**
   * 비밀번호 재설정
   * @param {string} token - 재설정 토큰
   * @param {string} password - 새 비밀번호
   * @returns {Promise} 비밀번호 재설정 응답
   */
  resetPassword: async (token, password) => {
    const response = await api.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
      token,
      password,
    });
    return response.data;
  },

  /**
   * 비밀번호 변경
   * @param {string} currentPassword - 현재 비밀번호
   * @param {string} newPassword - 새 비밀번호
   * @returns {Promise} 비밀번호 변경 응답
   */
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post(API_ENDPOINTS.USER.CHANGE_PASSWORD, {
      currentPassword,
      newPassword,
    });
    return response.data;
  },

  /**
   * 비밀번호 재설정 요청
   * @param {string} email - 이메일
   * @returns {Promise} 응답
   */
  requestPasswordReset: async (email) => {
    const response = await api.post('/auth/reset-password-request', {
      email
    });
    return response.data;
  },

  /**
   * 에러 처리 헬퍼
   * @param {Error} error - 에러 객체
   * @returns {Error} 처리된 에러
   */
  handleError: (error) => {
    if (error.response) {
      // 서버 응답 에러
      return new Error(error.response.data.message || error.response.data.error?.message || '인증 오류가 발생했습니다');
    }
    if (error.request) {
      // 네트워크 에러
      return new Error('네트워크 오류가 발생했습니다');
    }
    // 기타 에러
    return error;
  }
};

export default authService;