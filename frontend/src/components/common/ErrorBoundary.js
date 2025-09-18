/**
 * DOT Platform Frontend - 에러 경계 컴포넌트
 * React 애플리케이션의 전역 에러를 처리하고 사용자 친화적인 에러 화면을 표시
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  AlertTitle,
  Divider
} from '@mui/material';
import {
  ErrorOutline,
  Refresh,
  BugReport,
  Home
} from '@mui/icons-material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error) {
    // 에러가 발생하면 상태를 업데이트하여 폴백 UI를 표시
    return {
      hasError: true,
      errorId: Date.now().toString(36) + Math.random().toString(36).substr(2),
    };
  }

  componentDidCatch(error, errorInfo) {
    // 에러 정보를 상태에 저장
    this.setState({
      error,
      errorInfo,
    });

    // 개발 환경에서는 콘솔에 에러 출력
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error, errorInfo);
    }

    // 프로덕션 환경에서는 에러 로깅 서비스로 전송
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }
  }

  // 에러 로깅 서비스로 에러 정보 전송 (향후 구현)
  logErrorToService = (error, errorInfo) => {
    // 여기에 Sentry, LogRocket 등의 에러 로깅 서비스 연동
    console.warn('Error logged to service:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  };

  // 페이지 새로고침
  handleRefresh = () => {
    window.location.reload();
  };

  // 홈으로 이동
  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  // 에러 리포트 생성
  generateErrorReport = () => {
    const { error, errorInfo, errorId } = this.state;

    const report = {
      errorId,
      timestamp: new Date().toISOString(),
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      localStorage: this.getSafeLocalStorageData(),
    };

    return JSON.stringify(report, null, 2);
  };

  // 안전한 로컬스토리지 데이터 추출 (민감 정보 제외)
  getSafeLocalStorageData = () => {
    try {
      const safeKeys = ['dot_theme', 'dot_language', 'dot_sidebar_state'];
      const safeData = {};

      safeKeys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
          safeData[key] = value;
        }
      });

      return safeData;
    } catch (error) {
      return { error: 'Could not access localStorage' };
    }
  };

  // 에러 리포트 다운로드
  downloadErrorReport = () => {
    const report = this.generateErrorReport();
    const blob = new Blob([report], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `dot-error-report-${this.state.errorId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  render() {
    if (this.state.hasError) {
      const { error, errorId } = this.state;
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fafafa',
            padding: 2,
          }}
        >
          <Paper
            elevation={3}
            sx={{
              maxWidth: 600,
              width: '100%',
              padding: 4,
              textAlign: 'center',
            }}
          >
            {/* 에러 아이콘 */}
            <ErrorOutline
              sx={{
                fontSize: 64,
                color: 'error.main',
                mb: 2,
              }}
            />

            {/* 에러 제목 */}
            <Typography variant="h4" gutterBottom color="error">
              앗! 문제가 발생했습니다
            </Typography>

            {/* 에러 설명 */}
            <Typography variant="body1" color="textSecondary" paragraph>
              예상치 못한 오류로 인해 페이지를 표시할 수 없습니다.
              불편을 드려 죄송합니다.
            </Typography>

            {/* 에러 ID */}
            <Typography variant="caption" color="textSecondary" paragraph>
              에러 ID: {errorId}
            </Typography>

            <Divider sx={{ my: 3 }} />

            {/* 액션 버튼들 */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={this.handleRefresh}
                color="primary"
              >
                페이지 새로고침
              </Button>

              <Button
                variant="outlined"
                startIcon={<Home />}
                onClick={this.handleGoHome}
                color="primary"
              >
                홈으로 이동
              </Button>

              <Button
                variant="outlined"
                startIcon={<BugReport />}
                onClick={this.downloadErrorReport}
                color="secondary"
                size="small"
              >
                에러 리포트 다운로드
              </Button>
            </Box>

            {/* 개발 환경에서만 상세 에러 정보 표시 */}
            {isDevelopment && error && (
              <Alert severity="error" sx={{ textAlign: 'left' }}>
                <AlertTitle>개발자 정보</AlertTitle>
                <Typography variant="body2" component="pre" sx={{ mt: 1 }}>
                  {error.message}
                </Typography>
                {error.stack && (
                  <Typography
                    variant="caption"
                    component="pre"
                    sx={{
                      mt: 1,
                      fontSize: '11px',
                      overflow: 'auto',
                      maxHeight: '200px',
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      padding: 1,
                      borderRadius: 1,
                    }}
                  >
                    {error.stack}
                  </Typography>
                )}
              </Alert>
            )}

            {/* 고객 지원 안내 */}
            <Box sx={{ mt: 3, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" color="textSecondary">
                문제가 지속될 경우 고객 지원팀에 문의해주세요.
                <br />
                📧 support@dotplatform.kr | 📞 1588-0000
              </Typography>
            </Box>
          </Paper>
        </Box>
      );
    }

    // 에러가 없으면 자식 컴포넌트 렌더링
    return this.props.children;
  }
}

export default ErrorBoundary;