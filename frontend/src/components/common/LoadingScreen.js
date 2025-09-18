/**
 * DOT Platform Frontend - 로딩 화면 컴포넌트
 * 전체 화면 로딩 스피너와 메시지를 표시
 */

import React from 'react';
import {
  Box,
  CircularProgress,
  Typography,
  LinearProgress,
  Paper
} from '@mui/material';
import { styled } from '@mui/material/styles';

// 로딩 화면 컨테이너 스타일
const LoadingContainer = styled(Box)(({ theme }) => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(250, 250, 250, 0.95)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
}));

// 로딩 카드 스타일
const LoadingCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: theme.spacing(2),
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
  textAlign: 'center',
  maxWidth: '400px',
  width: '90%',
}));

// DOT 로고 스타일 (임시)
const LogoContainer = styled(Box)(({ theme }) => ({
  width: '80px',
  height: '80px',
  borderRadius: '50%',
  backgroundColor: theme.palette.primary.main,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 24px',
  position: 'relative',
  overflow: 'hidden',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: '50%',
    background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
    animation: 'pulse 2s infinite',
  },
  '@keyframes pulse': {
    '0%': {
      transform: 'scale(1)',
      opacity: 1,
    },
    '50%': {
      transform: 'scale(1.05)',
      opacity: 0.8,
    },
    '100%': {
      transform: 'scale(1)',
      opacity: 1,
    },
  },
}));

// DOT 텍스트 스타일
const LogoText = styled(Typography)(({ theme }) => ({
  color: 'white',
  fontWeight: 'bold',
  fontSize: '1.5rem',
  position: 'relative',
  zIndex: 1,
}));

const LoadingScreen = ({
  message = '로딩 중...',
  progress = null,
  showLogo = true,
  variant = 'circular' // 'circular', 'linear'
}) => {
  return (
    <LoadingContainer>
      <LoadingCard elevation={3}>
        {/* DOT 로고 */}
        {showLogo && (
          <LogoContainer>
            <LogoText>DOT</LogoText>
          </LogoContainer>
        )}

        {/* 로딩 스피너 */}
        {variant === 'circular' ? (
          <Box mb={3}>
            <CircularProgress
              size={48}
              thickness={4}
              color="primary"
            />
          </Box>
        ) : (
          <Box mb={3}>
            <LinearProgress
              variant={progress !== null ? 'determinate' : 'indeterminate'}
              value={progress}
              color="primary"
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        )}

        {/* 로딩 메시지 */}
        <Typography
          variant="h6"
          color="textPrimary"
          gutterBottom
        >
          {message}
        </Typography>

        {/* 진행률 표시 */}
        {progress !== null && (
          <Typography
            variant="body2"
            color="textSecondary"
          >
            {Math.round(progress)}% 완료
          </Typography>
        )}

        {/* DOT Platform 브랜딩 */}
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ mt: 2, display: 'block' }}
        >
          DOT Platform v0.1.0
        </Typography>
      </LoadingCard>
    </LoadingContainer>
  );
};

export default LoadingScreen;