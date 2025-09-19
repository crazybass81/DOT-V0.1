/**
 * DOT Platform Frontend - React 엔트리포인트
 * 애플리케이션의 시작점이며 React와 Redux를 초기화합니다.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';

import App from './App';
import { store } from './store';
import './index.css';

// 한국 근로 환경에 최적화된 MUI 테마 설정
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // 파란색 - 신뢰성과 안정성을 표현
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#f57c00', // 주황색 - 음식업계의 따뜻함을 표현
      light: '#ffb74d',
      dark: '#ef6c00',
    },
    error: {
      main: '#d32f2f', // 출근 지각 등 경고용
    },
    warning: {
      main: '#ed6c02', // 휴게시간 초과 등 주의용
    },
    success: {
      main: '#2e7d32', // 정상 출근 등 성공용
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: [
      '"Noto Sans KR"',
      '"Roboto"',
      '"Arial"',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.75rem',
      lineHeight: 1.5,
    },
  },
  components: {
    // 전역 컴포넌트 스타일 커스터마이징
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          textTransform: 'none', // 한글에서는 대문자 변환 비활성화
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '8px',
          },
        },
      },
    },
  },
});

// React 앱 초기화
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

// 개발 환경에서 성능 측정 도구 활성화
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