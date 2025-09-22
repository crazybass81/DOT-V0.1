# 🚀 회원가입 기능 구현 계획 (TDD)

> DOT Platform 프론트엔드 회원가입 기능을 TDD 방식으로 구현하는 상세 계획

---
상태: 진행중
시작일: 2025-09-22
작성자: System
방법론: Test-Driven Development (TDD)
우선순위: 높음 (로그인 전 필수 기능)
---

## 📋 목차
- [구현 개요](#구현-개요)
- [TDD 구현 단계](#tdd-구현-단계)
- [기술 스택](#기술-스택)
- [테스트 계획](#테스트-계획)
- [구현 일정](#구현-일정)

## 구현 개요

### 현재 상태
- **백엔드**: ✅ 완전히 구현됨 (`/api/v1/auth/register`)
- **프론트엔드**: ❌ 플레이스홀더만 존재
- **테스트 계정**: ⚠️ 하드코딩되어 있으나 DB에 없음

### 목표
1. 완전한 회원가입 UI 구현
2. Redux를 통한 상태 관리
3. 백엔드 API와 통합
4. 테스트 계정 자동 생성 스크립트
5. E2E 테스트 커버리지 100%

## TDD 구현 단계

### 🔴 RED Phase - 테스트 작성

#### 1. 단위 테스트 (Unit Tests)
```javascript
// frontend/src/components/auth/__tests__/Register.test.jsx
describe('Register 컴포넌트', () => {
  it('회원가입 폼이 올바르게 렌더링되어야 함', () => {
    // 이메일, 비밀번호, 이름, 전화번호 입력 필드
    // 제출 버튼
  });

  it('유효성 검사가 올바르게 작동해야 함', () => {
    // 이메일 형식 검증
    // 비밀번호 복잡도 검증 (8자 이상, 대소문자+숫자+특수문자)
    // 전화번호 형식 검증 (010-XXXX-XXXX)
  });

  it('비밀번호 확인이 일치해야 함', () => {
    // 비밀번호와 비밀번호 확인 필드 일치 검증
  });
});
```

#### 2. 통합 테스트 (Integration Tests)
```javascript
// frontend/src/services/__tests__/auth.service.test.js
describe('Auth Service - 회원가입', () => {
  it('회원가입 API를 호출해야 함', async () => {
    const userData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      name: '테스트사용자',
      phone: '010-1234-5678'
    };

    const result = await authService.register(userData);
    expect(result.success).toBe(true);
    expect(result.user).toHaveProperty('id');
  });

  it('중복 이메일 에러를 처리해야 함', async () => {
    // 409 Conflict 에러 처리
  });
});
```

#### 3. E2E 테스트 (End-to-End Tests)
```javascript
// frontend/tests/e2e/registration.spec.js
describe('회원가입 플로우', () => {
  it('신규 사용자가 회원가입하고 로그인할 수 있어야 함', async () => {
    // 1. 회원가입 페이지 접속
    // 2. 정보 입력
    // 3. 제출
    // 4. 성공 메시지 확인
    // 5. 로그인 페이지로 이동
    // 6. 로그인 성공
  });
});
```

### 🟢 GREEN Phase - 구현

#### 1. Redux Slice 업데이트
```javascript
// frontend/src/store/slices/authSlice.js
// 회원가입 thunk 추가
export const register = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await authService.register(userData);
      return response;
    } catch (error) {
      return rejectWithValue(error.response?.data);
    }
  }
);
```

#### 2. Auth Service 업데이트
```javascript
// frontend/src/services/auth.service.js
const authService = {
  // 기존 메서드들...

  /**
   * 회원가입
   * @param {Object} userData - 사용자 정보
   * @returns {Promise} 회원가입 응답
   */
  register: async (userData) => {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.REGISTER, userData);
      return response.data;
    } catch (error) {
      throw authService.handleError(error);
    }
  },
};
```

#### 3. Register 컴포넌트 구현
```javascript
// frontend/src/components/auth/Register.jsx
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Link,
  InputAdornment,
  IconButton
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { register } from '../../store/slices/authSlice';

const Register = () => {
  // 컴포넌트 구현
};
```

### 🔵 REFACTOR Phase - 개선

#### 1. 코드 품질 개선
- 중복 코드 제거
- 컴포넌트 분리 (폼 필드들을 재사용 가능한 컴포넌트로)
- 유효성 검사 로직 분리

#### 2. UX 개선
- 실시간 유효성 검사 피드백
- 비밀번호 강도 표시기
- 로딩 상태 표시
- 성공/실패 애니메이션

## 기술 스택

### 프론트엔드
- **React 18**: UI 컴포넌트
- **Material-UI**: 디자인 시스템
- **Redux Toolkit**: 상태 관리
- **React Hook Form**: 폼 관리 (선택적)
- **MSW**: API 모킹

### 백엔드 (이미 구현됨)
- **Express.js**: API 서버
- **PostgreSQL**: 데이터베이스
- **JWT**: 인증 토큰
- **bcrypt**: 비밀번호 해싱

## 테스트 계획

### 테스트 커버리지 목표
- 단위 테스트: 90%
- 통합 테스트: 80%
- E2E 테스트: 핵심 플로우 100%

### 테스트 시나리오
1. ✅ 정상적인 회원가입
2. ✅ 이메일 중복 체크
3. ✅ 비밀번호 유효성 검사
4. ✅ 전화번호 형식 검증
5. ✅ 네트워크 에러 처리
6. ✅ 서버 에러 처리

## 구현 일정

### Day 1: 테스트 작성 및 기본 구현
- [ ] 테스트 스위트 작성 (2시간)
- [ ] Redux slice 업데이트 (1시간)
- [ ] Auth service 메서드 추가 (30분)
- [ ] 기본 Register 컴포넌트 구현 (2시간)

### Day 2: 통합 및 개선
- [ ] API 통합 테스트 (1시간)
- [ ] UX 개선 사항 구현 (2시간)
- [ ] 테스트 계정 seed 스크립트 작성 (1시간)
- [ ] E2E 테스트 실행 및 버그 수정 (1시간)

### Day 3: 배포 및 검증
- [ ] 프로덕션 빌드 테스트 (30분)
- [ ] Vercel 배포 (30분)
- [ ] 실제 환경 테스트 (1시간)
- [ ] 문서 업데이트 (30분)

## 테스트 계정 Seed 스크립트

```javascript
// frontend/scripts/create-test-accounts.js
const testAccounts = [
  {
    email: 'owner@test.com',
    password: 'TestPass123!',
    name: '테스트사장님',
    phone: '010-1111-1111',
    role: 'owner'
  },
  {
    email: 'worker@test.com',
    password: 'TestPass123!',
    name: '테스트직원',
    phone: '010-2222-2222',
    role: 'worker'
  },
  {
    email: 'seeker@test.com',
    password: 'TestPass123!',
    name: '테스트구직자',
    phone: '010-3333-3333',
    role: 'seeker'
  }
];

// API 호출로 계정 생성
async function createTestAccounts() {
  for (const account of testAccounts) {
    try {
      await fetch('http://localhost:3001/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account)
      });
      console.log(`✅ Created: ${account.email}`);
    } catch (error) {
      console.error(`❌ Failed: ${account.email}`, error);
    }
  }
}
```

## 성공 기준

### 기능적 요구사항
- [ ] 사용자가 회원가입 폼을 통해 계정을 생성할 수 있음
- [ ] 유효성 검사가 실시간으로 작동함
- [ ] 중복 이메일 체크가 작동함
- [ ] 회원가입 후 자동 로그인 또는 로그인 페이지로 이동

### 비기능적 요구사항
- [ ] 회원가입 응답 시간 < 2초
- [ ] 모바일 반응형 디자인
- [ ] 접근성 준수 (WCAG 2.1 AA)
- [ ] 한글 인터페이스

## 참고 자료

### API 엔드포인트
```
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "홍길동",
  "phone": "010-1234-5678"
}

Response 201:
{
  "success": true,
  "message": "회원가입이 완료되었습니다",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "홍길동",
    "role": "seeker"
  }
}
```

### 유효성 검사 규칙
- **이메일**: 표준 이메일 형식
- **비밀번호**: 최소 8자, 대문자, 소문자, 숫자, 특수문자 포함
- **이름**: 2-50자
- **전화번호**: 010-XXXX-XXXX 형식

## 체크리스트

### 구현 전
- [x] 백엔드 API 확인
- [x] 프론트엔드 현재 상태 분석
- [x] TDD 계획 수립
- [ ] 테스트 환경 준비

### 구현 중
- [ ] RED: 테스트 작성
- [ ] GREEN: 최소 구현
- [ ] REFACTOR: 코드 개선
- [ ] 통합 테스트

### 구현 후
- [ ] E2E 테스트 통과
- [ ] 코드 리뷰
- [ ] 문서 업데이트
- [ ] 배포 및 검증

---

*이 문서는 DOT Platform의 회원가입 기능 구현을 위한 가이드입니다.*
*TDD 방식을 엄격히 따라 품질 높은 코드를 작성합니다.*