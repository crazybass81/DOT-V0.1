/**
 * 회원가입 컴포넌트
 * 이메일/비밀번호 기반 사용자 등록 기능 제공
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
  CircularProgress,
  Divider,
  InputAdornment,
  IconButton,
  LinearProgress
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  PersonAddOutlined,
  Visibility,
  VisibilityOff,
  Email,
  Lock,
  Person,
  Phone
} from '@mui/icons-material';
import { register, clearError, selectAuthLoading, selectAuthError } from '../../store/slices/authSlice';

// 스타일 컴포넌트
const StyledPaper = styled(Paper)(({ theme }) => ({
  marginTop: theme.spacing(4),
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
  marginTop: theme.spacing(3),
}));

const StyledSubmitButton = styled(Button)(({ theme }) => ({
  margin: theme.spacing(3, 0, 2),
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(3),
  fontWeight: 600,
  fontSize: '1rem',
  textTransform: 'none',
  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.25)',
  '&:hover': {
    boxShadow: '0 6px 20px rgba(25, 118, 210, 0.35)',
  }
}));

// 비밀번호 강도 계산 함수
const calculatePasswordStrength = (password) => {
  if (!password) return { score: 0, text: '', color: 'error' };

  let score = 0;

  // 길이 체크
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 10;

  // 소문자 체크
  if (/[a-z]/.test(password)) score += 20;

  // 대문자 체크
  if (/[A-Z]/.test(password)) score += 20;

  // 숫자 체크
  if (/\d/.test(password)) score += 20;

  // 특수문자 체크
  if (/[@$!%*?&]/.test(password)) score += 15;

  // 점수에 따른 강도 텍스트와 색상
  if (score < 40) return { score, text: '약함', color: 'error' };
  if (score < 70) return { score, text: '보통', color: 'warning' };
  return { score, text: '강함', color: 'success' };
};

const Register = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isLoading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);

  // 폼 상태
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
    phone: ''
  });

  // 비밀번호 표시 상태
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // 유효성 검사 에러
  const [validationErrors, setValidationErrors] = useState({});

  // 비밀번호 강도
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, text: '', color: 'error' });

  // 에러 클리어
  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  // 비밀번호 변경 시 강도 계산
  useEffect(() => {
    setPasswordStrength(calculatePasswordStrength(formData.password));
  }, [formData.password]);

  // 입력 핸들러
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // 실시간 유효성 검사 (해당 필드만)
    validateField(name, value);
  };

  // 개별 필드 유효성 검사
  const validateField = (name, value) => {
    const errors = { ...validationErrors };

    switch (name) {
      case 'email':
        if (!value) {
          errors.email = '이메일을 입력해주세요';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.email = '올바른 이메일 형식이 아닙니다';
        } else {
          delete errors.email;
        }
        break;

      case 'password':
        if (!value) {
          errors.password = '비밀번호를 입력해주세요';
        } else if (value.length < 8) {
          errors.password = '비밀번호는 최소 8자 이상이어야 합니다';
        } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(value)) {
          errors.password = '대문자, 소문자, 숫자, 특수문자를 포함해야 합니다';
        } else {
          delete errors.password;
        }

        // 비밀번호 확인도 체크
        if (formData.passwordConfirm && value !== formData.passwordConfirm) {
          errors.passwordConfirm = '비밀번호가 일치하지 않습니다';
        } else if (formData.passwordConfirm) {
          delete errors.passwordConfirm;
        }
        break;

      case 'passwordConfirm':
        if (!value) {
          errors.passwordConfirm = '비밀번호 확인을 입력해주세요';
        } else if (value !== formData.password) {
          errors.passwordConfirm = '비밀번호가 일치하지 않습니다';
        } else {
          delete errors.passwordConfirm;
        }
        break;

      case 'name':
        if (!value) {
          errors.name = '이름을 입력해주세요';
        } else if (value.length < 2 || value.length > 50) {
          errors.name = '이름은 2자 이상 50자 이하여야 합니다';
        } else {
          delete errors.name;
        }
        break;

      case 'phone':
        if (!value) {
          errors.phone = '전화번호를 입력해주세요';
        } else if (!/^010-\d{4}-\d{4}$/.test(value)) {
          errors.phone = '전화번호 형식은 010-XXXX-XXXX여야 합니다';
        } else {
          delete errors.phone;
        }
        break;

      default:
        break;
    }

    setValidationErrors(errors);
  };

  // 전체 폼 유효성 검사
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
    } else if (formData.password.length < 8) {
      errors.password = '비밀번호는 최소 8자 이상이어야 합니다';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(formData.password)) {
      errors.password = '대문자, 소문자, 숫자, 특수문자를 포함해야 합니다';
    }

    // 비밀번호 확인 검증
    if (!formData.passwordConfirm) {
      errors.passwordConfirm = '비밀번호 확인을 입력해주세요';
    } else if (formData.password !== formData.passwordConfirm) {
      errors.passwordConfirm = '비밀번호가 일치하지 않습니다';
    }

    // 이름 검증
    if (!formData.name) {
      errors.name = '이름을 입력해주세요';
    } else if (formData.name.length < 2 || formData.name.length > 50) {
      errors.name = '이름은 2자 이상 50자 이하여야 합니다';
    }

    // 전화번호 검증
    if (!formData.phone) {
      errors.phone = '전화번호를 입력해주세요';
    } else if (!/^010-\d{4}-\d{4}$/.test(formData.phone)) {
      errors.phone = '전화번호 형식은 010-XXXX-XXXX여야 합니다';
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
      // 회원가입 실행
      await dispatch(register({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        phone: formData.phone
      })).unwrap();

      // 성공 시 로그인 페이지로 이동
      navigate('/login', {
        state: { message: '회원가입이 완료되었습니다. 로그인해주세요.' }
      });
    } catch (err) {
      // 에러는 Redux에서 처리됨
      console.error('Registration error:', err);
    }
  };

  // 전화번호 자동 포맷팅
  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/[^\d]/g, ''); // 숫자만 추출

    if (value.length <= 3) {
      // 3자리 이하는 그대로
    } else if (value.length <= 7) {
      value = `${value.slice(0, 3)}-${value.slice(3)}`;
    } else if (value.length <= 11) {
      value = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
    } else {
      value = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
    }

    setFormData(prev => ({
      ...prev,
      phone: value
    }));

    validateField('phone', value);
  };

  return (
    <Container component="main" maxWidth="sm">
      <StyledPaper>
        <StyledAvatar>
          <PersonAddOutlined sx={{ fontSize: 30, color: 'white' }} />
        </StyledAvatar>

        <Typography component="h1" variant="h4" fontWeight="bold">
          DOT Platform 회원가입
        </Typography>

        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          새로운 계정을 만들어보세요
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        <StyledForm onSubmit={handleSubmit} noValidate>
          {/* 이메일 입력 */}
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
            onBlur={(e) => validateField('email', e.target.value)}
            error={!!validationErrors.email}
            helperText={validationErrors.email}
            disabled={isLoading}
            aria-required="true"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Email color="action" />
                </InputAdornment>
              ),
            }}
          />

          {/* 비밀번호 입력 */}
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            name="password"
            label="비밀번호"
            type={showPassword ? 'text' : 'password'}
            id="password"
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            onBlur={(e) => validateField('password', e.target.value)}
            error={!!validationErrors.password}
            helperText={validationErrors.password}
            disabled={isLoading}
            aria-required="true"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    data-testid="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    disabled={isLoading}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* 비밀번호 강도 표시 */}
          {formData.password && (
            <Box sx={{ mt: 1, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="textSecondary">
                  비밀번호 강도
                </Typography>
                <Typography variant="caption" color={passwordStrength.color + '.main'} fontWeight="bold">
                  {passwordStrength.text}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={passwordStrength.score}
                color={passwordStrength.color}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}

          {/* 비밀번호 확인 */}
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            name="passwordConfirm"
            label="비밀번호 확인"
            type={showPasswordConfirm ? 'text' : 'password'}
            id="passwordConfirm"
            autoComplete="new-password"
            value={formData.passwordConfirm}
            onChange={handleChange}
            onBlur={(e) => validateField('passwordConfirm', e.target.value)}
            error={!!validationErrors.passwordConfirm}
            helperText={validationErrors.passwordConfirm}
            disabled={isLoading}
            aria-required="true"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    edge="end"
                    disabled={isLoading}
                  >
                    {showPasswordConfirm ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* 이름 입력 */}
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            name="name"
            label="이름"
            id="name"
            autoComplete="name"
            value={formData.name}
            onChange={handleChange}
            onBlur={(e) => validateField('name', e.target.value)}
            error={!!validationErrors.name}
            helperText={validationErrors.name}
            disabled={isLoading}
            aria-required="true"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Person color="action" />
                </InputAdornment>
              ),
            }}
          />

          {/* 전화번호 입력 */}
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            name="phone"
            label="전화번호"
            id="phone"
            autoComplete="tel"
            placeholder="010-XXXX-XXXX"
            value={formData.phone}
            onChange={handlePhoneChange}
            onBlur={(e) => validateField('phone', e.target.value)}
            error={!!validationErrors.phone}
            helperText={validationErrors.phone}
            disabled={isLoading}
            aria-required="true"
            inputProps={{ maxLength: 13 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Phone color="action" />
                </InputAdornment>
              ),
            }}
          />

          {/* 회원가입 버튼 */}
          <StyledSubmitButton
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            disabled={isLoading}
            startIcon={isLoading && <CircularProgress size={20} color="inherit" />}
          >
            {isLoading ? '가입 중...' : '회원가입'}
          </StyledSubmitButton>

          <Divider sx={{ my: 3 }}>또는</Divider>

          {/* 로그인 링크 */}
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="textSecondary">
              이미 계정이 있으신가요?{' '}
              <Link to="/login" style={{ textDecoration: 'none', color: '#1976d2', fontWeight: 'bold' }}>
                로그인
              </Link>
            </Typography>
          </Box>
        </StyledForm>
      </StyledPaper>

      {/* 푸터 */}
      <Box sx={{ mt: 4, mb: 4, textAlign: 'center' }}>
        <Typography variant="caption" color="textSecondary">
          회원가입 시 DOT Platform의{' '}
          <Link to="/terms" style={{ color: '#1976d2' }}>
            이용약관
          </Link>
          {' 및 '}
          <Link to="/privacy" style={{ color: '#1976d2' }}>
            개인정보처리방침
          </Link>
          에 동의하게 됩니다.
        </Typography>
      </Box>
    </Container>
  );
};

export default Register;