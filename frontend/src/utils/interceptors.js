/**
 * DOT Platform Frontend - 토큰 인터셉터
 * Axios 요청/응답 인터셉터 설정 유틸리티
 */

import { store } from '../store';
import { logout, refreshToken } from '../store/slices/authSlice';
import { addToast } from '../store/slices/uiSlice';

/**
 * 토큰 자동 첨부 인터셉터 생성
 * @returns {Function} 요청 인터셉터
 */
export const createAuthInterceptor = () => {
  return (config) => {
    const state = store.getState();
    const token = state.auth.token || localStorage.getItem('dot_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 한국어 설정
    config.headers['Accept-Language'] = 'ko-KR';

    // 요청 시간 기록 (응답 시간 측정용)
    config.metadata = { startTime: Date.now() };

    return config;
  };
};

/**
 * 토큰 갱신 인터셉터 생성
 * @param {Object} apiClient - Axios 인스턴스
 * @returns {Function} 응답 인터셉터
 */
export const createTokenRefreshInterceptor = (apiClient) => {
  return async (error) => {
    const originalRequest = error.config;

    // 401 에러이고 아직 재시도하지 않은 경우
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
        // 리프레시 실패 시 로그아웃
        store.dispatch(logout());
        store.dispatch(addToast({
          type: 'error',
          message: '세션이 만료되었습니다. 다시 로그인해주세요.',
        }));

        // 로그인 페이지로 리다이렉트
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  };
};

/**
 * 에러 처리 인터셉터
 * @returns {Function} 응답 인터셉터
 */
export const createErrorInterceptor = () => {
  return (error) => {
    const { response } = error;

    // 네트워크 에러
    if (!response && error.message === 'Network Error') {
      store.dispatch(addToast({
        type: 'error',
        message: '네트워크 연결을 확인해주세요.',
      }));
      return Promise.reject(error);
    }

    // 타임아웃 에러
    if (error.code === 'ECONNABORTED') {
      store.dispatch(addToast({
        type: 'error',
        message: '요청 시간이 초과되었습니다.',
      }));
      return Promise.reject(error);
    }

    // HTTP 에러 코드별 처리
    if (response) {
      switch (response.status) {
        case 403:
          store.dispatch(addToast({
            type: 'error',
            message: response.data?.message || '권한이 없습니다.',
          }));
          break;

        case 404:
          store.dispatch(addToast({
            type: 'warning',
            message: response.data?.message || '요청한 리소스를 찾을 수 없습니다.',
          }));
          break;

        case 422:
          // 유효성 검사 에러
          const errors = response.data?.errors;
          if (errors && typeof errors === 'object') {
            const firstError = Object.values(errors)[0];
            store.dispatch(addToast({
              type: 'error',
              message: Array.isArray(firstError) ? firstError[0] : firstError,
            }));
          }
          break;

        case 429:
          store.dispatch(addToast({
            type: 'error',
            message: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
          }));
          break;

        case 500:
        case 502:
        case 503:
          store.dispatch(addToast({
            type: 'error',
            message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
          }));
          break;

        default:
          if (response.status >= 400) {
            store.dispatch(addToast({
              type: 'error',
              message: response.data?.message || '요청 처리 중 오류가 발생했습니다.',
            }));
          }
      }
    }

    return Promise.reject(error);
  };
};

/**
 * 성능 모니터링 인터셉터
 * @returns {Function} 응답 인터셉터
 */
export const createPerformanceInterceptor = () => {
  return (response) => {
    if (response.config.metadata) {
      const duration = Date.now() - response.config.metadata.startTime;

      // 느린 요청 경고 (3초 이상)
      if (duration > 3000) {
        console.warn(`Slow API call: ${response.config.url} took ${duration}ms`);
      }

      // 개발 환경에서 성능 로깅
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚡ API Performance: ${response.config.url} - ${duration}ms`);
      }
    }

    return response;
  };
};

/**
 * 요청 재시도 인터셉터
 * @param {Object} options - 재시도 옵션
 * @param {number} options.retries - 재시도 횟수
 * @param {number} options.delay - 재시도 간격
 * @returns {Function} 에러 인터셉터
 */
export const createRetryInterceptor = (options = {}) => {
  const { retries = 3, delay = 1000 } = options;

  return async (error) => {
    const config = error.config;

    // 재시도 카운터 초기화
    if (!config._retryCount) {
      config._retryCount = 0;
    }

    // 재시도 가능한 에러인지 확인
    const isRetryable =
      error.code === 'ECONNABORTED' ||
      error.message === 'Network Error' ||
      (error.response && [502, 503, 504].includes(error.response.status));

    if (isRetryable && config._retryCount < retries) {
      config._retryCount++;

      // 지수 백오프
      const backoffDelay = delay * Math.pow(2, config._retryCount - 1);

      console.log(`Retrying request (${config._retryCount}/${retries}) after ${backoffDelay}ms...`);

      await new Promise(resolve => setTimeout(resolve, backoffDelay));

      return axios(config);
    }

    return Promise.reject(error);
  };
};

/**
 * 캐시 인터셉터 (GET 요청만)
 * @param {number} cacheTime - 캐시 유효 시간 (밀리초)
 * @returns {Object} 요청/응답 인터셉터
 */
export const createCacheInterceptor = (cacheTime = 60000) => {
  const cache = new Map();

  // 캐시 정리
  const cleanCache = () => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > cacheTime) {
        cache.delete(key);
      }
    }
  };

  // 주기적으로 캐시 정리
  setInterval(cleanCache, cacheTime);

  return {
    request: (config) => {
      if (config.method === 'get' && config.cache !== false) {
        const cacheKey = `${config.url}${JSON.stringify(config.params || {})}`;
        const cached = cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < cacheTime) {
          // 캐시된 응답 반환
          config.adapter = () => Promise.resolve({
            data: cached.data,
            status: 200,
            statusText: 'OK (Cached)',
            headers: {},
            config,
          });
        }
      }
      return config;
    },

    response: (response) => {
      if (response.config.method === 'get' && response.config.cache !== false) {
        const cacheKey = `${response.config.url}${JSON.stringify(response.config.params || {})}`;
        cache.set(cacheKey, {
          data: response.data,
          timestamp: Date.now(),
        });
      }
      return response;
    },
  };
};

export default {
  createAuthInterceptor,
  createTokenRefreshInterceptor,
  createErrorInterceptor,
  createPerformanceInterceptor,
  createRetryInterceptor,
  createCacheInterceptor,
};