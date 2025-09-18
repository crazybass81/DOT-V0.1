/**
 * 사용자 워크플로우 E2E 테스트
 * Playwright를 사용한 전체 사용자 시나리오 테스트
 *
 * 테스트 시나리오:
 * - 사용자 등록/로그인
 * - 직원 관리 워크플로우
 * - 출퇴근 관리 워크플로우
 * - 스케줄 관리 워크플로우
 * - 급여 관리 워크플로우
 */

const { test, expect } = require('@playwright/test');

// 테스트 데이터
const testData = {
  business: {
    name: 'E2E Test Restaurant',
    ownerName: '테스트 대표',
    email: 'e2e@test.com',
    password: 'testpass123',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트동 123-45'
  },
  employee: {
    name: '김직원',
    email: 'employee@test.com',
    phone: '010-9876-5432',
    position: '서버',
    department: '홀',
    employmentType: 'part-time',
    hourlyWage: 12000
  }
};

test.describe('사용자 워크플로우 E2E 테스트', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // 기본 설정
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.describe('사용자 인증 워크플로우', () => {
    test('사업자 회원가입 및 로그인 플로우가 정상 작동한다', async () => {
      // 1. 홈페이지 접속
      await page.goto('/');
      await expect(page).toHaveTitle(/DOT Platform/);

      // 2. 회원가입 페이지로 이동
      await page.click('[data-testid="signup-link"]');
      await expect(page).toHaveURL('/signup');

      // 3. 회원가입 폼 작성
      await page.fill('[data-testid="business-name"]', testData.business.name);
      await page.fill('[data-testid="owner-name"]', testData.business.ownerName);
      await page.fill('[data-testid="email"]', testData.business.email);
      await page.fill('[data-testid="password"]', testData.business.password);
      await page.fill('[data-testid="confirm-password"]', testData.business.password);
      await page.fill('[data-testid="phone"]', testData.business.phone);
      await page.fill('[data-testid="address"]', testData.business.address);

      // 4. 회원가입 제출
      await page.click('[data-testid="signup-submit"]');

      // 5. 로그인 성공 확인
      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('[data-testid="welcome-message"]'))
        .toContainText(testData.business.ownerName);
    });

    test('로그아웃 및 재로그인이 정상 작동한다', async () => {
      // 1. 로그아웃
      await page.click('[data-testid="user-menu-toggle"]');
      await page.click('[data-testid="logout-button"]');

      // 2. 로그인 페이지로 리다이렉트 확인
      await expect(page).toHaveURL('/login');

      // 3. 재로그인
      await page.fill('[data-testid="email"]', testData.business.email);
      await page.fill('[data-testid="password"]', testData.business.password);
      await page.click('[data-testid="login-submit"]');

      // 4. 대시보드 접근 확인
      await expect(page).toHaveURL('/dashboard');
    });
  });

  test.describe('직원 관리 워크플로우', () => {
    test('직원 등록부터 수정까지의 전체 플로우가 정상 작동한다', async () => {
      // 1. 직원 관리 페이지로 이동
      await page.click('[data-testid="nav-employees"]');
      await expect(page).toHaveURL('/employees');

      // 2. 직원 추가 버튼 클릭
      await page.click('[data-testid="add-employee"]');

      // 3. 직원 정보 입력
      await page.fill('[data-testid="employee-name"]', testData.employee.name);
      await page.fill('[data-testid="employee-email"]', testData.employee.email);
      await page.fill('[data-testid="employee-phone"]', testData.employee.phone);
      await page.selectOption('[data-testid="employee-position"]', testData.employee.position);
      await page.selectOption('[data-testid="employee-department"]', testData.employee.department);
      await page.selectOption('[data-testid="employment-type"]', testData.employee.employmentType);
      await page.fill('[data-testid="hourly-wage"]', testData.employee.hourlyWage.toString());

      // 4. 직원 등록 제출
      await page.click('[data-testid="submit-employee"]');

      // 5. 성공 메시지 확인
      await expect(page.locator('[data-testid="success-message"]'))
        .toContainText('직원이 성공적으로 등록되었습니다');

      // 6. 직원 목록에서 확인
      await expect(page.locator(`[data-testid="employee-row"]:has-text("${testData.employee.name}")`))
        .toBeVisible();

      // 7. 직원 정보 수정
      await page.click(`[data-testid="edit-employee-${testData.employee.name}"]`);
      await page.fill('[data-testid="employee-name"]', '김직원수정');
      await page.click('[data-testid="submit-employee"]');

      // 8. 수정 확인
      await expect(page.locator('[data-testid="employee-row"]:has-text("김직원수정")'))
        .toBeVisible();
    });

    test('직원 검색 및 필터링이 정상 작동한다', async () => {
      // 1. 직원 관리 페이지에서
      await page.goto('/employees');

      // 2. 검색 기능 테스트
      await page.fill('[data-testid="employee-search"]', '김직원');
      await expect(page.locator('[data-testid="employee-row"]')).toHaveCount(1);

      // 3. 필터 기능 테스트
      await page.selectOption('[data-testid="position-filter"]', '서버');
      await expect(page.locator('[data-testid="employee-row"]')).toHaveCount(1);

      // 4. 필터 초기화
      await page.click('[data-testid="clear-filters"]');
      await expect(page.locator('[data-testid="employee-row"]')).toHaveCountGreaterThan(0);
    });
  });

  test.describe('출퇴근 관리 워크플로우', () => {
    test('출퇴근 체크인/체크아웃 플로우가 정상 작동한다', async () => {
      // 1. 출퇴근 관리 페이지로 이동
      await page.click('[data-testid="nav-attendance"]');
      await expect(page).toHaveURL('/attendance');

      // 2. 출근 체크인
      await page.click('[data-testid="clock-in-button"]');

      // 3. 위치 정보 허용 (모의)
      await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (success) => {
          success({
            coords: {
              latitude: 37.5665,
              longitude: 126.9780
            }
          });
        };
      });

      // 4. 체크인 확인
      await expect(page.locator('[data-testid="attendance-status"]'))
        .toContainText('출근 중');

      // 5. 휴게 시작
      await page.click('[data-testid="break-start-button"]');
      await expect(page.locator('[data-testid="attendance-status"]'))
        .toContainText('휴게 중');

      // 6. 휴게 종료
      await page.click('[data-testid="break-end-button"]');
      await expect(page.locator('[data-testid="attendance-status"]'))
        .toContainText('출근 중');

      // 7. 퇴근 체크아웃
      await page.click('[data-testid="clock-out-button"]');
      await expect(page.locator('[data-testid="attendance-status"]'))
        .toContainText('퇴근');

      // 8. 오늘의 근무 시간 확인
      await expect(page.locator('[data-testid="today-work-hours"]'))
        .toBeVisible();
    });

    test('출퇴근 기록 조회 및 필터링이 정상 작동한다', async () => {
      // 1. 기록 탭으로 이동
      await page.click('[data-testid="attendance-history-tab"]');

      // 2. 기간 필터 테스트
      await page.selectOption('[data-testid="period-filter"]', 'thisMonth');
      await expect(page.locator('[data-testid="attendance-record"]'))
        .toHaveCountGreaterThan(0);

      // 3. 직원 필터 테스트 (관리자인 경우)
      await page.selectOption('[data-testid="employee-filter"]', testData.employee.name);

      // 4. 내보내기 기능 테스트
      await page.click('[data-testid="export-attendance"]');
      // 다운로드 확인 (실제 파일 다운로드는 테스트 환경에 따라 다름)
    });
  });

  test.describe('스케줄 관리 워크플로우', () => {
    test('스케줄 등록부터 수정까지의 플로우가 정상 작동한다', async () => {
      // 1. 스케줄 관리 페이지로 이동
      await page.click('[data-testid="nav-schedule"]');
      await expect(page).toHaveURL('/schedule');

      // 2. 새 스케줄 추가
      await page.click('[data-testid="add-schedule"]');

      // 3. 스케줄 정보 입력
      await page.selectOption('[data-testid="schedule-employee"]', testData.employee.name);
      await page.fill('[data-testid="schedule-date"]', '2024-09-25');
      await page.fill('[data-testid="start-time"]', '09:00');
      await page.fill('[data-testid="end-time"]', '18:00');
      await page.selectOption('[data-testid="shift-type"]', 'morning');

      // 4. 스케줄 등록
      await page.click('[data-testid="submit-schedule"]');

      // 5. 캘린더에서 확인
      await expect(page.locator('[data-testid="calendar-event"]:has-text("김직원")'))
        .toBeVisible();

      // 6. 스케줄 수정
      await page.click('[data-testid="edit-schedule"]');
      await page.fill('[data-testid="end-time"]', '22:00');
      await page.selectOption('[data-testid="shift-type"]', 'evening');
      await page.click('[data-testid="submit-schedule"]');

      // 7. 수정 확인
      await expect(page.locator('[data-testid="schedule-time"]'))
        .toContainText('09:00 - 22:00');
    });

    test('반복 스케줄 등록이 정상 작동한다', async () => {
      // 1. 반복 스케줄 추가
      await page.click('[data-testid="add-schedule"]');

      // 2. 반복 설정 활성화
      await page.check('[data-testid="recurring-schedule"]');

      // 3. 반복 옵션 설정
      await page.selectOption('[data-testid="repeat-type"]', 'weekly');
      await page.fill('[data-testid="repeat-end-date"]', '2024-12-31');

      // 4. 기본 스케줄 정보 입력
      await page.selectOption('[data-testid="schedule-employee"]', testData.employee.name);
      await page.fill('[data-testid="schedule-date"]', '2024-09-26');
      await page.fill('[data-testid="start-time"]', '13:00');
      await page.fill('[data-testid="end-time"]', '22:00');

      // 5. 등록 및 확인
      await page.click('[data-testid="submit-schedule"]');
      await expect(page.locator('[data-testid="recurring-indicator"]'))
        .toBeVisible();
    });
  });

  test.describe('급여 관리 워크플로우', () => {
    test('급여 계산 및 명세서 생성 플로우가 정상 작동한다', async () => {
      // 1. 급여 관리 페이지로 이동
      await page.click('[data-testid="nav-payroll"]');
      await expect(page).toHaveURL('/payroll');

      // 2. 급여 계산 대상 선택
      await page.selectOption('[data-testid="payroll-employee"]', testData.employee.name);
      await page.selectOption('[data-testid="payroll-month"]', '9');
      await page.selectOption('[data-testid="payroll-year"]', '2024');

      // 3. 급여 계산 실행
      await page.click('[data-testid="calculate-payroll"]');

      // 4. 계산 결과 확인
      await expect(page.locator('[data-testid="total-hours"]')).toBeVisible();
      await expect(page.locator('[data-testid="base-salary"]')).toBeVisible();
      await expect(page.locator('[data-testid="overtime-pay"]')).toBeVisible();
      await expect(page.locator('[data-testid="net-pay"]')).toBeVisible();

      // 5. 급여명세서 생성
      await page.click('[data-testid="generate-payslip"]');

      // 6. PDF 다운로드 확인
      const downloadPromise = page.waitForEvent('download');
      await downloadPromise;
    });

    test('급여 내역 조회 및 검색이 정상 작동한다', async () => {
      // 1. 급여 내역 탭으로 이동
      await page.click('[data-testid="payroll-history-tab"]');

      // 2. 기간별 조회
      await page.selectOption('[data-testid="history-year"]', '2024');
      await page.selectOption('[data-testid="history-month"]', '9');
      await page.click('[data-testid="search-payroll"]');

      // 3. 결과 확인
      await expect(page.locator('[data-testid="payroll-record"]'))
        .toHaveCountGreaterThan(0);

      // 4. 상세 내역 확인
      await page.click('[data-testid="view-payroll-detail"]');
      await expect(page.locator('[data-testid="payroll-detail-modal"]'))
        .toBeVisible();
    });
  });

  test.describe('설정 및 환경 설정 워크플로우', () => {
    test('사업장 설정 변경이 정상 작동한다', async () => {
      // 1. 설정 페이지로 이동
      await page.click('[data-testid="nav-settings"]');
      await expect(page).toHaveURL('/settings');

      // 2. 사업장 정보 수정
      await page.click('[data-testid="business-settings-tab"]');
      await page.fill('[data-testid="business-name"]', 'Updated Restaurant Name');
      await page.fill('[data-testid="business-address"]', '서울시 서초구 업데이트동 456-78');

      // 3. 근무 규정 설정
      await page.fill('[data-testid="work-start-time"]', '08:00');
      await page.fill('[data-testid="work-end-time"]', '20:00');
      await page.fill('[data-testid="break-duration"]', '60');
      await page.fill('[data-testid="overtime-rate"]', '1.5');

      // 4. 설정 저장
      await page.click('[data-testid="save-settings"]');
      await expect(page.locator('[data-testid="success-message"]'))
        .toContainText('설정이 저장되었습니다');
    });

    test('알림 설정 변경이 정상 작동한다', async () => {
      // 1. 알림 설정 탭
      await page.click('[data-testid="notification-settings-tab"]');

      // 2. 이메일 알림 설정
      await page.check('[data-testid="email-schedule-reminder"]');
      await page.check('[data-testid="email-payroll-ready"]');

      // 3. SMS 알림 설정
      await page.check('[data-testid="sms-attendance-alert"]');
      await page.check('[data-testid="sms-late-arrival"]');

      // 4. 설정 저장
      await page.click('[data-testid="save-notifications"]');
      await expect(page.locator('[data-testid="success-message"]'))
        .toContainText('알림 설정이 저장되었습니다');
    });
  });

  test.describe('모바일 반응형 테스트', () => {
    test('모바일 환경에서 주요 기능이 정상 작동한다', async () => {
      // 1. 모바일 뷰포트로 변경
      await page.setViewportSize({ width: 375, height: 667 });

      // 2. 대시보드 접근
      await page.goto('/dashboard');
      await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeVisible();

      // 3. 모바일 네비게이션 테스트
      await page.click('[data-testid="mobile-nav-toggle"]');
      await expect(page.locator('[data-testid="mobile-nav-menu"]')).toBeVisible();

      // 4. 출퇴근 기능 (모바일에서 가장 중요한 기능)
      await page.click('[data-testid="nav-attendance"]');
      await expect(page.locator('[data-testid="clock-in-button"]')).toBeVisible();

      // 5. 터치 친화적인 버튼 크기 확인
      const buttonSize = await page.locator('[data-testid="clock-in-button"]').boundingBox();
      expect(buttonSize.height).toBeGreaterThanOrEqual(44); // 최소 터치 영역
    });
  });

  test.describe('접근성 테스트', () => {
    test('키보드 네비게이션이 정상 작동한다', async () => {
      await page.goto('/dashboard');

      // 1. Tab 키로 네비게이션
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toBeVisible();

      // 2. Skip link 테스트
      await page.keyboard.press('Tab');
      const skipLink = page.locator('[data-testid="skip-to-content"]');
      if (await skipLink.isVisible()) {
        await expect(skipLink).toBeFocused();
      }

      // 3. 메뉴 네비게이션
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
    });

    test('스크린 리더 지원이 정상 작동한다', async () => {
      await page.goto('/employees');

      // 1. ARIA 레이블 확인
      await expect(page.locator('[data-testid="add-employee"]'))
        .toHaveAttribute('aria-label');

      // 2. 폼 레이블 연결 확인
      await page.click('[data-testid="add-employee"]');
      const nameInput = page.locator('[data-testid="employee-name"]');
      await expect(nameInput).toHaveAttribute('aria-describedby');

      // 3. 에러 메시지 접근성
      await page.click('[data-testid="submit-employee"]');
      await expect(page.locator('[role="alert"]')).toBeVisible();
    });
  });

  test.describe('성능 테스트', () => {
    test('페이지 로드 성능이 기준을 만족한다', async () => {
      // 성능 메트릭 수집 시작
      await page.goto('/dashboard', { waitUntil: 'networkidle' });

      // Lighthouse 성능 점수 확인 (실제 구현시 lighthouse 플러그인 필요)
      const performanceMetrics = await page.evaluate(() => {
        return JSON.stringify(performance.getEntriesByType('navigation')[0]);
      });

      const metrics = JSON.parse(performanceMetrics);
      expect(metrics.loadEventEnd - metrics.loadEventStart).toBeLessThan(3000); // 3초 이내
    });

    test('대용량 데이터 로드가 정상 작동한다', async () => {
      // 많은 직원 데이터가 있는 상황 시뮬레이션
      await page.goto('/employees');
      await page.waitForLoadState('networkidle');

      // 가상 스크롤링 테스트 (구현된 경우)
      const initialItems = await page.locator('[data-testid="employee-row"]').count();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);

      // 추가 아이템 로드 확인
      const loadedItems = await page.locator('[data-testid="employee-row"]').count();
      expect(loadedItems).toBeGreaterThanOrEqual(initialItems);
    });
  });
});