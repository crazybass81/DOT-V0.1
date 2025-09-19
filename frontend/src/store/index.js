/**
 * DOT Platform Frontend - Redux Store 설정
 * 전역 상태 관리를 위한 Redux Toolkit 스토어 구성
 */

import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from '@reduxjs/toolkit';

// 리듀서 imports
import authReducer from './slices/authSlice';
import attendanceReducer from './slices/attendanceSlice';
import scheduleReducer from './slices/scheduleSlice';
import notificationReducer from './slices/notificationSlice';
import businessReducer from './slices/businessSlice';
import uiReducer from './slices/uiSlice';

// persist 설정
const persistConfig = {
  key: 'dot-platform',
  version: 1,
  storage,
  whitelist: [
    'auth',      // 인증 정보는 persist
    'business',  // 현재 사업장 정보는 persist
    'ui'         // UI 설정은 persist
  ],
  blacklist: [
    'attendance',    // 근태 정보는 실시간으로 갱신
    'schedule',      // 스케줄 정보는 실시간으로 갱신
    'notification'   // 알림 정보는 실시간으로 갱신
  ]
};

// 루트 리듀서 결합
const rootReducer = combineReducers({
  auth: authReducer,
  attendance: attendanceReducer,
  schedule: scheduleReducer,
  notification: notificationReducer,
  business: businessReducer,
  ui: uiReducer,
});

// persist 리듀서 생성
const persistedReducer = persistReducer(persistConfig, rootReducer);

// 미들웨어 설정
const middleware = (getDefaultMiddleware) =>
  getDefaultMiddleware({
    serializableCheck: {
      // redux-persist 액션들은 직렬화 체크에서 제외
      ignoredActions: [
        'persist/PERSIST',
        'persist/REHYDRATE',
        'persist/PAUSE',
        'persist/PURGE',
        'persist/REGISTER',
        'persist/FLUSH',
      ],
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

// persistor 생성 - 일시 비활성화
export const persistor = null; // persistStore(store);

// TypeScript 타입 정의
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// 개발용 디버깅 함수 - window 의존성 제거
if (process.env.NODE_ENV === 'development') {
  // 안전한 전역 디버깅 함수 제공
  try {
    if (typeof window !== 'undefined') {
      window.DOT_STORE_DEBUG = {
        getState: () => store.getState(),
        dispatch: store.dispatch,
        clearPersist: () => {
          // persistor.purge(); // persist 비활성화됨
          localStorage.clear(); // 대신 localStorage 직접 삭제
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