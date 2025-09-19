/**
 * DOT Platform Frontend - MUI 테마 설정
 * 한국 근로 환경에 최적화된 테마 정의
 */

import { createTheme } from '@mui/material/styles';

// 테마 생성 함수 - Redux store와 독립적으로 동작
export const getTheme = () => {
  try {
    return createTheme({
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
  } catch (error) {
    console.error('Failed to create theme:', error);
    // 기본 테마 반환
    return createTheme({});
  }
};

// 주의: 기본 export를 제거하여 모듈 로드 시 즉시 실행 방지
// export default getTheme(); // 이 라인이 초기화 문제의 원인이었음