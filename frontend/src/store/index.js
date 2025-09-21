/**
 * DOT Platform Frontend - Redux Store 설정
 * 전역 상태 관리를 위한 Redux Toolkit 스토어 구성
 * 순환 종속성 해결을 위해 store 초기화 후 API 클라이언트에 참조 전달
 */

import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from '@reduxjs/toolkit';

// 리듀서 imports
import authReducer from './slices/authSlice';
import attendanceReducer from './slices/attendanceSlice';
import scheduleReducer from './slices/scheduleSlice';
import notificationReducer from './slices/notificationSlice';
import businessReducer from './slices/businessSlice';
import uiReducer from './slices/uiSlice';

// 순환 종속성 해결을 위한 동적 import
let setStoreReference = null;

// 루트 리듀서 결합
const rootReducer = combineReducers({
  auth: authReducer,
  attendance: attendanceReducer,
  schedule: scheduleReducer,
  notification: notificationReducer,
  business: businessReducer,
  ui: uiReducer,
});

// 미들웨어 설정
const middleware = (getDefaultMiddleware) =>
  getDefaultMiddleware({
    serializableCheck: {
      // API 응답의 타임스탬프 등 비직렬화 데이터 처리
      ignoredActionsPaths: ['meta.arg', 'payload.timestamp'],
      ignoredPaths: ['items.dates'],
    },
    // 개발 환경에서만 불변성 체크 활성화
    immutableCheck: process.env.NODE_ENV === 'development',
  });

// 스토어 구성 - 초기화 문제 해결을 위해 단순화
export const store = configureStore({
  reducer: rootReducer, // persistedReducer 대신 rootReducer 사용
  middleware,
  devTools: process.env.NODE_ENV === 'development',
  // preloadedState는 SSR이나 초기 상태가 필요한 경우 사용
  preloadedState: undefined,
});

// Store 초기화 완료 후 API 클라이언트에 참조 전달
async function initializeStoreReference() {
  try {
    const { setStoreReference: setApiStoreRef } = await import('../services/api-client');
    setApiStoreRef(store);
    console.log('Store reference set to API client successfully');
  } catch (error) {
    console.warn('Failed to set store reference to API client:', error);
  }
}

// Store가 완전히 초기화된 후 API 클라이언트에 참조 전달
// 이렇게 하면 순환 종속성을 피할 수 있습니다
initializeStoreReference();

// 개발용 디버깅 함수 - window 의존성 제거
if (process.env.NODE_ENV === 'development') {
  // 안전한 전역 디버깅 함수 제공
  try {
    if (typeof window !== 'undefined') {
      window.DOT_STORE_DEBUG = {
        getState: () => store.getState(),
        dispatch: store.dispatch,
        clearStorage: () => {
          localStorage.clear();
          sessionStorage.clear();
          window.location.reload();
        },
        // 각 슬라이스별 상태 조회 헬퍼
        getAuth: () => store.getState().auth,
        getAttendance: () => store.getState().attendance,
        getSchedule: () => store.getState().schedule,
        getNotification: () => store.getState().notification,
        getBusiness: () => store.getState().business,
        getUI: () => store.getState().ui,
      };

      console.log('DOT Platform Store initialized');
      console.log('Available debug commands: window.DOT_STORE_DEBUG');
    }
  } catch (e) {
    // window 접근 실패 시 무시 - SSR 환경 대응
    console.warn('Debug functions not available:', e);
  }
}