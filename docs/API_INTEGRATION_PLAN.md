# 🔗 Backend-Frontend API 통합 계획 (TDD 기반)

> 백엔드 API와 프론트엔드를 TDD 방식으로 단계적으로 통합하는 상세 계획

---
상태: 진행중
시작일: 2025-09-22
작성자: System
방법론: Test-Driven Development (TDD)
배포 전략: 기능별 단계적 배포
---

## 📋 목차
- [통합 개요](#통합-개요)
- [TDD 프로세스](#tdd-프로세스)
- [기능별 통합 로드맵](#기능별-통합-로드맵)
- [테스트 전략](#테스트-전략)
- [배포 및 검증](#배포-및-검증)

## 통합 개요

### 현재 상태 분석
**백엔드 구현 완료 기능:**
- ✅ 인증 시스템 (`/api/v1/auth`)
- ✅ 출퇴근 관리 (`/api/v1/attendance`)
- ✅ 일정 관리 (`/api/v1/schedules`) - DB 풀 이슈로 임시 비활성화
- ✅ 급여 계산 (`/api/v1/payroll`)

**프론트엔드 준비 상태:**
- ✅ API 서비스 레이어 구조 완성
- ⏳ 실제 API 연결 필요
- ⏳ 통합 테스트 필요

### 통합 우선순위
1. **Phase 1**: 인증 시스템 (필수 기반)
2. **Phase 2**: 출퇴근 관리 (핵심 기능)
3. **Phase 3**: 일정 관리 (부가 기능)
4. **Phase 4**: 급여 계산 (고급 기능)

## TDD 프로세스

### 각 기능 통합 사이클
```
1. 테스트 작성 (RED) ❌
   ├── 단위 테스트 작성
   ├── 통합 테스트 작성
   └── E2E 테스트 시나리오 작성

2. 구현 (GREEN) ✅
   ├── API 서비스 연결
   ├── 상태 관리 구현
   └── UI 컴포넌트 연결

3. 리팩토링 (REFACTOR) 🔄
   ├── 코드 최적화
   ├── 에러 처리 개선
   └── 성능 최적화

4. 배포 및 검증 🚀
   ├── Vercel Preview 배포
   ├── 테스트 실행
   └── Production 배포
```

## 기능별 통합 로드맵

### Phase 1: 인증 시스템 (3일)

#### Day 1: 테스트 작성
```javascript
// frontend/src/services/__tests__/auth.service.test.js
describe('Auth Service Integration', () => {
  // 1. 로그인 테스트
  it('should login with valid credentials', async () => {
    const result = await authService.login('test@example.com', 'password');
    expect(result.token).toBeDefined();
    expect(result.user).toHaveProperty('email');
  });

  // 2. 토큰 갱신 테스트
  it('should refresh token when expired', async () => {
    const newToken = await authService.refreshToken();
    expect(newToken).toBeDefined();
  });

  // 3. 로그아웃 테스트
  it('should clear session on logout', async () => {
    await authService.logout();
    expect(localStorage.getItem('token')).toBeNull();
  });

  // 4. 역할 전환 테스트
  it('should switch role between owner/worker', async () => {
    await authService.switchRole('worker');
    expect(authService.getCurrentRole()).toBe('worker');
  });
});

// frontend/src/components/__tests__/Login.test.jsx
describe('Login Component', () => {
  it('should display login form', () => {
    render(<Login />);
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
  });

  it('should handle login submission', async () => {
    render(<Login />);
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password' }
    });
    fireEvent.click(screen.getByText('로그인'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should display error on failed login', async () => {
    // 실패 시나리오 테스트
  });
});
```

#### Day 2: 구현
```javascript
// frontend/src/services/auth.service.js
import apiClient from './api-client';
import { store } from '../store';
import { setUser, clearUser } from '../store/slices/authSlice';

class AuthService {
  async login(email, password) {
    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password
      });

      const { token, refreshToken, user } = response.data.data;

      // 토큰 저장
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);

      // Redux 상태 업데이트
      store.dispatch(setUser(user));

      // API 클라이언트 헤더 설정
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.post('/auth/refresh', {
      refreshToken
    });

    const { token } = response.data.data;
    localStorage.setItem('token', token);
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    return token;
  }

  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      delete apiClient.defaults.headers.common['Authorization'];
      store.dispatch(clearUser());
    }
  }

  async switchRole(role) {
    const response = await apiClient.post('/auth/switch-role', { role });
    store.dispatch(setUser(response.data.data.user));
    return response.data.data;
  }

  handleError(error) {
    if (error.response) {
      return new Error(error.response.data.message || '인증 오류가 발생했습니다');
    }
    return new Error('네트워크 오류가 발생했습니다');
  }
}

export default new AuthService();
```

#### Day 3: 배포 및 검증
```bash
# 테스트 실행
npm test -- --coverage

# Preview 배포
git checkout -b feature/auth-integration
git add .
git commit -m "feat: 인증 시스템 API 통합 구현"
git push origin feature/auth-integration

# Vercel Preview URL에서 테스트
# PR 생성 및 리뷰

# Main 병합 및 Production 배포
git checkout main
git merge feature/auth-integration
git push origin main
```

### Phase 2: 출퇴근 관리 (4일)

#### Day 1: 테스트 작성
```javascript
// frontend/src/services/__tests__/attendance.service.test.js
describe('Attendance Service Integration', () => {
  // QR 체크인 테스트
  it('should check-in with QR code', async () => {
    const result = await attendanceService.checkIn({
      qrCode: 'RESTAURANT_123_QR',
      location: { lat: 37.5665, lng: 126.9780 }
    });
    expect(result.status).toBe('checked_in');
    expect(result.timestamp).toBeDefined();
  });

  // GPS 검증 테스트
  it('should validate GPS location', async () => {
    const isValid = await attendanceService.validateLocation({
      lat: 37.5665,
      lng: 126.9780
    });
    expect(isValid).toBe(true);
  });

  // 체크아웃 테스트
  it('should check-out successfully', async () => {
    const result = await attendanceService.checkOut();
    expect(result.status).toBe('checked_out');
    expect(result.workDuration).toBeDefined();
  });

  // 출퇴근 기록 조회
  it('should fetch attendance history', async () => {
    const history = await attendanceService.getHistory({
      startDate: '2025-09-01',
      endDate: '2025-09-30'
    });
    expect(history).toBeInstanceOf(Array);
    expect(history[0]).toHaveProperty('date');
    expect(history[0]).toHaveProperty('checkIn');
    expect(history[0]).toHaveProperty('checkOut');
  });
});

// E2E 테스트
// frontend/tests/e2e/attendance.spec.js
describe('Attendance Flow E2E', () => {
  it('complete attendance cycle', async () => {
    // 1. 로그인
    await page.goto('/login');
    await page.fill('[name="email"]', 'worker@test.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');

    // 2. QR 스캔 페이지 이동
    await page.click('[data-testid="check-in-btn"]');

    // 3. QR 코드 입력 (시뮬레이션)
    await page.fill('[data-testid="qr-input"]', 'TEST_QR_CODE');
    await page.click('[data-testid="submit-qr"]');

    // 4. 체크인 성공 확인
    await expect(page.locator('.success-message')).toContainText('체크인 완료');

    // 5. 체크아웃
    await page.click('[data-testid="check-out-btn"]');
    await expect(page.locator('.success-message')).toContainText('체크아웃 완료');
  });
});
```

#### Day 2-3: 구현
```javascript
// frontend/src/services/attendance.service.js
import apiClient from './api-client';
import { store } from '../store';
import { updateAttendanceStatus } from '../store/slices/attendanceSlice';

class AttendanceService {
  async checkIn(data) {
    const response = await apiClient.post('/attendance/checkin', {
      qr_code: data.qrCode,
      gps_latitude: data.location.lat,
      gps_longitude: data.location.lng,
      timestamp: new Date().toISOString()
    });

    store.dispatch(updateAttendanceStatus(response.data.data));
    return response.data.data;
  }

  async checkOut() {
    const response = await apiClient.post('/attendance/checkout', {
      timestamp: new Date().toISOString()
    });

    store.dispatch(updateAttendanceStatus(response.data.data));
    return response.data.data;
  }

  async getStatus() {
    const response = await apiClient.get('/attendance/status');
    return response.data.data;
  }

  async getHistory(params) {
    const response = await apiClient.get('/attendance/history', { params });
    return response.data.data;
  }

  async validateLocation(location) {
    const response = await apiClient.post('/attendance/validate-location', location);
    return response.data.data.isValid;
  }

  // QR 코드 생성 (Owner용)
  async generateQRCode(restaurantId) {
    const response = await apiClient.post('/attendance/generate-qr', {
      restaurantId
    });
    return response.data.data.qrCode;
  }
}

export default new AttendanceService();
```

```jsx
// frontend/src/components/Attendance/CheckIn.jsx
import React, { useState, useEffect } from 'react';
import { QrReader } from 'react-qr-reader';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import attendanceService from '../../services/attendance.service';
import { toast } from 'react-toastify';

function CheckIn() {
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    // GPS 위치 가져오기
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          toast.error('위치 정보를 가져올 수 없습니다');
        }
      );
    }
  }, []);

  const handleScan = async (data) => {
    if (data && !loading) {
      setLoading(true);
      try {
        if (!location) {
          throw new Error('위치 정보가 필요합니다');
        }

        const result = await attendanceService.checkIn({
          qrCode: data,
          location
        });

        toast.success('체크인이 완료되었습니다');
        navigate('/attendance/status');
      } catch (error) {
        toast.error(error.message || '체크인 실패');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="check-in-container">
      <h2>QR 코드 체크인</h2>
      {location ? (
        <QrReader
          onResult={handleScan}
          constraints={{ facingMode: 'environment' }}
          style={{ width: '100%' }}
        />
      ) : (
        <div>위치 정보를 가져오는 중...</div>
      )}
      {loading && <div className="loading">처리 중...</div>}
    </div>
  );
}

export default CheckIn;
```

#### Day 4: 배포 및 검증
- 단위 테스트 및 통합 테스트 실행
- Preview 배포 및 QA 테스트
- Production 배포

### Phase 3: 일정 관리 (3일)

#### 테스트 및 구현 계획
```javascript
// 일정 CRUD 테스트
describe('Schedule Service', () => {
  it('should create schedule', async () => {
    const schedule = await scheduleService.create({
      date: '2025-09-25',
      startTime: '09:00',
      endTime: '18:00',
      workerId: 'worker_123'
    });
    expect(schedule.id).toBeDefined();
  });

  it('should fetch weekly schedule', async () => {
    const schedules = await scheduleService.getWeekly('2025-09-22');
    expect(schedules).toHaveLength(7);
  });

  it('should update schedule', async () => {
    const updated = await scheduleService.update('schedule_123', {
      endTime: '19:00'
    });
    expect(updated.endTime).toBe('19:00');
  });

  it('should handle schedule conflicts', async () => {
    await expect(scheduleService.create({
      date: '2025-09-25',
      startTime: '09:00',
      endTime: '18:00',
      workerId: 'worker_123' // 이미 스케줄이 있는 경우
    })).rejects.toThrow('스케줄 충돌');
  });
});
```

### Phase 4: 급여 계산 (3일)

#### 테스트 및 구현 계획
```javascript
// 급여 계산 테스트
describe('Payroll Service', () => {
  it('should calculate monthly payroll', async () => {
    const payroll = await payrollService.calculate({
      workerId: 'worker_123',
      year: 2025,
      month: 9
    });

    expect(payroll).toHaveProperty('basicSalary');
    expect(payroll).toHaveProperty('overtime');
    expect(payroll).toHaveProperty('deductions');
    expect(payroll).toHaveProperty('netPay');
  });

  it('should generate pay slip PDF', async () => {
    const pdfBlob = await payrollService.generatePaySlip('payroll_123');
    expect(pdfBlob.type).toBe('application/pdf');
  });

  it('should calculate overtime correctly', async () => {
    const overtime = await payrollService.calculateOvertime({
      regularHours: 160,
      overtimeHours: 20,
      hourlyRate: 10000
    });
    expect(overtime).toBe(300000); // 1.5배 계산
  });
});
```

## 테스트 전략

### 1. 테스트 피라미드
```
         /\
        /E2E\       (10%) - Critical User Journeys
       /______\
      /        \
     /Integration\  (30%) - API Integration Tests
    /______________\
   /                \
  /   Unit Tests     \ (60%) - Service & Component Tests
 /____________________\
```

### 2. 테스트 커버리지 목표
- **Unit Tests**: 80% 이상
- **Integration Tests**: 주요 API 엔드포인트 100%
- **E2E Tests**: 핵심 사용자 시나리오 100%

### 3. 테스트 도구
```json
{
  "devDependencies": {
    "@testing-library/react": "^13.4.0",
    "@testing-library/jest-dom": "^5.16.5",
    "@testing-library/user-event": "^14.4.3",
    "jest": "^29.5.0",
    "playwright": "^1.35.0",
    "msw": "^1.2.0"
  }
}
```

### 4. Mock Service Worker 설정
```javascript
// frontend/src/mocks/handlers.js
import { rest } from 'msw';

export const handlers = [
  rest.post('/api/v1/auth/login', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        data: {
          token: 'mock-jwt-token',
          refreshToken: 'mock-refresh-token',
          user: {
            id: 'user_123',
            email: 'test@example.com',
            role: 'worker'
          }
        }
      })
    );
  }),
  // 다른 API 핸들러들...
];
```

## 배포 및 검증

### 1. 배포 파이프라인
```yaml
# .github/workflows/integration-test.yml
name: API Integration Test & Deploy

on:
  push:
    branches: [feature/*, main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e

  deploy-preview:
    if: github.ref != 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'
```

### 2. 검증 체크리스트

#### 각 기능 배포 후 검증
- [ ] 모든 테스트 통과 (Unit, Integration, E2E)
- [ ] Preview 환경에서 수동 테스트
- [ ] 성능 메트릭 확인 (< 3초 로딩)
- [ ] 에러 모니터링 설정
- [ ] 롤백 계획 준비

### 3. 모니터링 설정
```javascript
// frontend/src/utils/monitoring.js
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.BrowserTracing(),
  ],
  tracesSampleRate: 1.0,
});

// API 에러 추적
export const trackAPIError = (error, context) => {
  Sentry.captureException(error, {
    tags: {
      section: 'api',
      ...context
    }
  });
};
```

## 일정 요약

### 전체 일정: 13일

| Phase | 기능 | 기간 | 상태 |
|-------|------|------|------|
| 1 | 인증 시스템 | 3일 | 🔄 시작 예정 |
| 2 | 출퇴근 관리 | 4일 | ⏳ 대기 |
| 3 | 일정 관리 | 3일 | ⏳ 대기 |
| 4 | 급여 계산 | 3일 | ⏳ 대기 |

### 일일 작업 흐름
```
09:00 - 10:00: 테스트 작성
10:00 - 12:00: 구현
13:00 - 15:00: 구현 계속
15:00 - 16:00: 테스트 실행 및 디버깅
16:00 - 17:00: 코드 리뷰 및 리팩토링
17:00 - 18:00: 배포 및 검증
```

## 성공 지표

### 기술적 지표
- ✅ 테스트 커버리지 80% 이상
- ✅ API 응답 시간 < 500ms
- ✅ 페이지 로딩 시간 < 3초
- ✅ 에러율 < 1%

### 비즈니스 지표
- ✅ 모든 핵심 기능 작동
- ✅ 사용자 피드백 반영
- ✅ 데이터 정합성 100%
- ✅ 보안 취약점 0개

## 위험 관리

### 주요 위험 요소
1. **DB 연결 풀 문제**: 현재 일정 관리 API 비활성화
   - 해결: Connection Pool 설정 최적화

2. **CORS 이슈**: 프론트-백엔드 통신
   - 해결: CORS 미들웨어 적절히 설정

3. **인증 토큰 관리**: 보안 및 갱신
   - 해결: Refresh Token 로직 구현

4. **실시간 동기화**: Socket.io 연결
   - 해결: 폴백 메커니즘 구현

## 다음 단계

1. **즉시 시작**: Phase 1 인증 시스템 테스트 작성
2. **환경 준비**: MSW 설정 및 테스트 환경 구축
3. **팀 공유**: 계획 리뷰 및 피드백 수집
4. **실행**: TDD 사이클 시작

---

*이 문서는 DOT Platform의 API 통합 마스터 플랜입니다.*
*최종 업데이트: 2025-09-22*
*방법론: Test-Driven Development (TDD)*