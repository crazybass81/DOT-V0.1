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
import { store } from './store';
import { getTheme } from './theme/index';
import './index.css';

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

  root.render(
    <React.StrictMode>
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
    </React.StrictMode>
  );

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

// DOM이 준비되면 앱 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // 이미 DOM이 로드된 경우 즉시 실행
  initApp();
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