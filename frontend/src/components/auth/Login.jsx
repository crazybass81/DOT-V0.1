/**
 * 로그인 컴포넌트
 * 이메일/비밀번호 인증 및 자동 로그인 기능 제공
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Divider
} from '@mui/material';
import { styled } from '@mui/material/styles';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import authService from '../../services/auth.service';
import { selectAuthLoading, selectAuthError, selectIsAuthenticated } from '../../store/slices/authSlice';

// 스타일 컴포넌트
const StyledPaper = styled(Paper)(({ theme }) => ({
  marginTop: theme.spacing(8),
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: theme.spacing(4),
  borderRadius: theme.spacing(2),
  boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
}));

const StyledAvatar = styled(Box)(({ theme }) => ({
  margin: theme.spacing(1),
  backgroundColor: theme.palette.primary.main,
  width: 56,
  height: 56,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}));

const StyledForm = styled('form')(({ theme }) => ({
  width: '100%',
  marginTop: theme.spacing(1),
}));

function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Redux 상태
  const isLoading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  // 로컬 상태
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  // 인증 완료 시 리다이렉트
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  // 입력 핸들러
  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // 실시간 유효성 검사 에러 제거
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // 유효성 검사
  const validateForm = () => {
    const errors = {};

    // 이메일 검증
    if (!formData.email) {
      errors.email = '이메일을 입력해주세요';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = '올바른 이메일 형식이 아닙니다';
    }

    // 비밀번호 검증
    if (!formData.password) {
      errors.password = '비밀번호를 입력해주세요';
    } else if (formData.password.length < 6) {
      errors.password = '비밀번호는 6자 이상이어야 합니다';
    }

    return errors;
  };

  // 폼 제출 핸들러
  const handleSubmit = async (e) => {
    e.preventDefault();

    // 유효성 검사
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      // 로그인 실행
      await authService.login(formData.email, formData.password);

      // 성공 시 대시보드로 이동 (useEffect에서 처리)
    } catch (err) {
      // 에러는 Redux에서 처리됨
      console.error('Login error:', err);
    }
  };

  // 테스트 계정으로 로그인 (개발용)
  const handleTestLogin = (role) => {
    const testAccounts = {
      owner: { email: 'owner@test.com', password: 'password123' },
      worker: { email: 'worker@test.com', password: 'password123' }
    };

    const account = testAccounts[role];
    setFormData({
      email: account.email,
      password: account.password,
      rememberMe: false
    });
  };

  return (
    <Container component="main" maxWidth="xs">
      <StyledPaper elevation={3}>
        <StyledAvatar>
          <LockOutlinedIcon style={{ color: 'white', fontSize: 30 }} />
        </StyledAvatar>

        <Typography component="h1" variant="h5" gutterBottom>
          DOT Platform 로그인
        </Typography>

        <Typography variant="body2" color="textSecondary" align="center">
          식당 관리 시스템에 오신 것을 환영합니다
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        <StyledForm onSubmit={handleSubmit} noValidate>
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            id="email"
            label="이메일 주소"
            name="email"
            autoComplete="email"
            autoFocus
            value={formData.email}
            onChange={handleChange}
            error={!!validationErrors.email}
            helperText={validationErrors.email}
            disabled={isLoading}
          />

          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            name="password"
            label="비밀번호"
            type={showPassword ? 'text' : 'password'}
            id="password"
            autoComplete="current-password"
            value={formData.password}
            onChange={handleChange}
            error={!!validationErrors.password}
            helperText={validationErrors.password}
            disabled={isLoading}
          />

          <FormControlLabel
            control={
              <Checkbox
                name="rememberMe"
                color="primary"
                checked={formData.rememberMe}
                onChange={handleChange}
                disabled={isLoading}
              />
            }
            label="자동 로그인"
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            disabled={isLoading}
            sx={{ mt: 3, mb: 2, py: 1.5 }}
          >
            {isLoading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                로그인 중...
              </>
            ) : (
              '로그인'
            )}
          </Button>

          <Box sx={{ mt: 2 }}>
            <Divider>또는</Divider>
          </Box>

          {/* 개발 환경에서만 표시 */}
          {process.env.NODE_ENV === 'development' && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                테스트 계정으로 로그인:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleTestLogin('owner')}
                  disabled={isLoading}
                >
                  사장님
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleTestLogin('worker')}
                  disabled={isLoading}
                >
                  직원
                </Button>
              </Box>
            </Box>
          )}

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Link to="/auth/forgot-password" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="primary">
                비밀번호를 잊으셨나요?
              </Typography>
            </Link>
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="textSecondary" display="inline">
                계정이 없으신가요?{' '}
              </Typography>
              <Link to="/auth/register" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="primary" display="inline">
                  회원가입
                </Typography>
              </Link>
            </Box>
          </Box>
        </StyledForm>
      </StyledPaper>
    </Container>
  );
}

export default Login;