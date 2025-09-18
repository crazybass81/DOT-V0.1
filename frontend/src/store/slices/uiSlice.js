/**
 * DOT Platform Frontend - UI 상태 관리
 * 전역 UI 상태를 관리하는 Redux slice
 */

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // 사이드바 상태
  sidebarOpen: true,
  sidebarCollapsed: false,

  // 테마 설정
  darkMode: false,
  colorScheme: 'default', // 'default', 'colorBlind', 'highContrast'

  // 언어 설정
  language: 'ko',

  // 알림 설정
  notificationsEnabled: true,
  soundEnabled: true,

  // 로딩 상태
  globalLoading: false,
  loadingMessage: '',

  // 모달 상태
  modals: {},

  // 토스트 알림
  toasts: [],

  // 페이지 메타데이터
  pageTitle: 'DOT Platform',
  breadcrumbs: [],

  // 반응형 상태
  isMobile: false,
  screenWidth: window.innerWidth,

  // 접근성 설정
  highContrast: false,
  reducedMotion: false,
  fontSize: 'medium', // 'small', 'medium', 'large'

  // 개발자 도구
  debugMode: process.env.NODE_ENV === 'development',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // 사이드바 토글
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },

    // 사이드바 접기/펼치기
    toggleSidebarCollapse: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },

    // 사이드바 상태 설정
    setSidebarOpen: (state, action) => {
      state.sidebarOpen = action.payload;
    },

    // 다크 모드 토글
    toggleDarkMode: (state) => {
      state.darkMode = !state.darkMode;
    },

    // 색상 스키마 설정
    setColorScheme: (state, action) => {
      state.colorScheme = action.payload;
    },

    // 언어 설정
    setLanguage: (state, action) => {
      state.language = action.payload;
    },

    // 전역 로딩 상태 설정
    setGlobalLoading: (state, action) => {
      state.globalLoading = action.payload.loading;
      state.loadingMessage = action.payload.message || '';
    },

    // 모달 열기
    openModal: (state, action) => {
      const { modalId, props = {} } = action.payload;
      state.modals[modalId] = {
        isOpen: true,
        props,
      };
    },

    // 모달 닫기
    closeModal: (state, action) => {
      const modalId = action.payload;
      if (state.modals[modalId]) {
        state.modals[modalId].isOpen = false;
      }
    },

    // 모든 모달 닫기
    closeAllModals: (state) => {
      Object.keys(state.modals).forEach(modalId => {
        state.modals[modalId].isOpen = false;
      });
    },

    // 토스트 추가
    addToast: (state, action) => {
      const toast = {
        id: Date.now(),
        type: action.payload.type || 'info',
        message: action.payload.message,
        duration: action.payload.duration || 5000,
        timestamp: Date.now(),
      };
      state.toasts.push(toast);
    },

    // 토스트 제거
    removeToast: (state, action) => {
      const toastId = action.payload;
      state.toasts = state.toasts.filter(toast => toast.id !== toastId);
    },

    // 모든 토스트 제거
    clearToasts: (state) => {
      state.toasts = [];
    },

    // 페이지 제목 설정
    setPageTitle: (state, action) => {
      state.pageTitle = action.payload;
    },

    // 브레드크럼 설정
    setBreadcrumbs: (state, action) => {
      state.breadcrumbs = action.payload;
    },

    // 반응형 상태 업데이트
    updateScreenSize: (state, action) => {
      state.screenWidth = action.payload;
      state.isMobile = action.payload <= 768;

      // 모바일에서는 사이드바 자동 접기
      if (state.isMobile && state.sidebarOpen) {
        state.sidebarCollapsed = true;
      }
    },

    // 알림 설정 토글
    toggleNotifications: (state) => {
      state.notificationsEnabled = !state.notificationsEnabled;
    },

    // 사운드 설정 토글
    toggleSound: (state) => {
      state.soundEnabled = !state.soundEnabled;
    },

    // 고대비 모드 토글
    toggleHighContrast: (state) => {
      state.highContrast = !state.highContrast;
    },

    // 움직임 감소 모드 토글
    toggleReducedMotion: (state) => {
      state.reducedMotion = !state.reducedMotion;
    },

    // 폰트 크기 설정
    setFontSize: (state, action) => {
      state.fontSize = action.payload;
    },

    // 디버그 모드 토글
    toggleDebugMode: (state) => {
      if (process.env.NODE_ENV === 'development') {
        state.debugMode = !state.debugMode;
      }
    },

    // UI 설정 리셋
    resetUISettings: (state) => {
      return {
        ...initialState,
        screenWidth: state.screenWidth,
        isMobile: state.isMobile,
      };
    },
  },
});

// 액션 내보내기
export const {
  toggleSidebar,
  toggleSidebarCollapse,
  setSidebarOpen,
  toggleDarkMode,
  setColorScheme,
  setLanguage,
  setGlobalLoading,
  openModal,
  closeModal,
  closeAllModals,
  addToast,
  removeToast,
  clearToasts,
  setPageTitle,
  setBreadcrumbs,
  updateScreenSize,
  toggleNotifications,
  toggleSound,
  toggleHighContrast,
  toggleReducedMotion,
  setFontSize,
  toggleDebugMode,
  resetUISettings,
} = uiSlice.actions;

// 셀렉터 함수들
export const selectUI = (state) => state.ui;
export const selectSidebarOpen = (state) => state.ui.sidebarOpen;
export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed;
export const selectDarkMode = (state) => state.ui.darkMode;
export const selectLanguage = (state) => state.ui.language;
export const selectGlobalLoading = (state) => state.ui.globalLoading;
export const selectModals = (state) => state.ui.modals;
export const selectToasts = (state) => state.ui.toasts;
export const selectPageTitle = (state) => state.ui.pageTitle;
export const selectBreadcrumbs = (state) => state.ui.breadcrumbs;
export const selectIsMobile = (state) => state.ui.isMobile;
export const selectScreenWidth = (state) => state.ui.screenWidth;

// 모달 상태 셀렉터
export const selectModalState = (modalId) => (state) => {
  return state.ui.modals[modalId] || { isOpen: false, props: {} };
};

// 접근성 설정 셀렉터
export const selectAccessibilitySettings = (state) => ({
  highContrast: state.ui.highContrast,
  reducedMotion: state.ui.reducedMotion,
  fontSize: state.ui.fontSize,
});

export default uiSlice.reducer;