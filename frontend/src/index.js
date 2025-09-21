/**
 * DOT Platform Frontend - React 엔트리포인트
 * 애플리케이션의 시작점이며 React와 Redux를 초기화합니다.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';

import App from './App';
import './index.css';

// store와 theme를 동적으로 import하여 초기화 순서 보장
const { store } = require('./store');
const { getTheme } = require('./theme/index');

// DOM이 준비된 후 React 앱 초기화
const initApp = () => {
  // 1. 먼저 store가 초기화되었는지 확인
  if (!store) {
    console.error('Redux store is not initialized');
    return;
  }

  // 2. store 초기화 완료 후 theme 생성
  const theme = getTheme();

  // 3. React 앱 초기화
  const root = ReactDOM.createRoot(document.getElementById('root'));

  // Production에서는 StrictMode 비활성화 (초기화 오류 방지)
  const AppWrapper = (
    <Provider store={store}>
      <BrowserRouter>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <SnackbarProvider
            maxSnack={3}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            autoHideDuration={5000}
            preventDuplicate
          >
            <App />
          </SnackbarProvider>
        </ThemeProvider>
      </BrowserRouter>
    </Provider>
  );

  // 개발 환경에서만 StrictMode 사용
  if (process.env.NODE_ENV === 'development') {
    root.render(
      <React.StrictMode>
        {AppWrapper}
      </React.StrictMode>
    );
  } else {
    root.render(AppWrapper);
  }

  // 개발 환경 디버깅 설정을 여기로 이동
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    try {
      // React DevTools Profiler 활성화
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook.reactDevtoolsAgent && hook.reactDevtoolsAgent.onCommitFiberRoot) {
          hook.reactDevtoolsAgent.onCommitFiberRoot = (...args) => {
            console.debug('React DevTools - Commit:', args);
          };
        }
      }

      // 개발용 전역 변수 설정
      window.DOT_DEBUG = {
        store,
        theme,
        version: process.env.REACT_APP_VERSION || '0.1.0',
      };
    } catch (e) {
      console.warn('Debug tools not available:', e);
    }
  }
};

// 전역 에러 핸들러 설정
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  // 초기화 관련 오류 무시 (production에서)
  if (process.env.NODE_ENV === 'production' &&
      event.error?.message?.includes('Cannot access') &&
      event.error?.message?.includes('before initialization')) {
    event.preventDefault();
    console.warn('Initialization error suppressed in production');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// DOM이 준비되면 앱 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // 이미 DOM이 로드된 경우 즉시 실행
  setTimeout(initApp, 0); // 다음 tick에 실행하여 초기화 순서 보장
}

// 서비스 워커 등록 (PWA 지원 준비)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}