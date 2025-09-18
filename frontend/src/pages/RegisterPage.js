/**
 * DOT Platform Frontend - 회원가입 페이지
 * 사용자 등록을 처리하는 회원가입 페이지 컴포넌트
 */

import React from 'react';
import { Box, Paper, Typography, Alert } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

const RegisterPage = () => {
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
          maxWidth: 500,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" color="primary" gutterBottom>
          회원가입
        </Typography>
        
        <Alert severity="info" sx={{ mt: 3 }}>
          회원가입 기능은 추후 구현될 예정입니다.
          <br />
          <RouterLink to="/login">로그인 페이지로 돌아가기</RouterLink>
        </Alert>
      </Paper>
    </Box>
  );
};

export default RegisterPage;