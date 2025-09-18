/**
 * DOT Platform Frontend - 로그인 페이지
 * 사용자 인증을 처리하는 로그인 페이지 컴포넌트
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Link,
  Alert
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

const LoginPage = () => {
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
          padding: 4,
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* 로고 */}
        <Typography variant="h4" color="primary" gutterBottom>
          DOT Platform
        </Typography>

        <Typography variant="body2" color="textSecondary" paragraph>
          식음료 사업 운영 관리 시스템
        </Typography>

        {/* 로그인 폼 (임시) */}
        <Box component="form" sx={{ mt: 3 }}>
          <TextField
            fullWidth
            label="이메일"
            type="email"
            margin="normal"
            variant="outlined"
          />

          <TextField
            fullWidth
            label="비밀번호"
            type="password"
            margin="normal"
            variant="outlined"
          />

          <Button
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            size="large"
          >
            로그인
          </Button>

          <Link
            component={RouterLink}
            to="/register"
            variant="body2"
          >
            계정이 없으신가요? 회원가입
          </Link>
        </Box>

        {/* 임시 안내 */}
        <Alert severity="info" sx={{ mt: 3 }}>
          임시 로그인 페이지입니다. 실제 인증 기능은 추후 구현될 예정입니다.
        </Alert>
      </Paper>
    </Box>
  );
};

export default LoginPage;