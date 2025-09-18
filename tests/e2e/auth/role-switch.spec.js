/**
 * T134: 역할 전환 E2E 테스트 작성
 * 다중 역할 사용자의 역할 변경 기능 검증
 * 권한 변화 및 UI 업데이트 확인
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const { DatabaseHelper, scenarioHelpers, authHelpers } = require('../helpers/test-helpers');

/**
 * 역할 전환 E2E 테스트 스위트
 * 한글 주석: 사용자 역할 변경 및 권한 시스템 검증
 */
test.describe('역할 전환 E2E 테스트', () => {
  let loginPage;
  let dbHelper;
  let multiRoleUserId;

  // 다중 역할 사용자 설정
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dbHelper = new DatabaseHelper();

    await dbHelper.cleanupTestData();

    // 다중 역할을 가진 테스트 사용자 생성
    multiRoleUserId = 9010;
    await dbHelper.createTestUser({
      id: multiRoleUserId,
      name: 'E2E 다중역할사용자',
      email: 'multirole@e2e.test',
      phone: '010-0010-0010',
      status: 'active'
    });

    // 테스트 사업장들 생성
    await dbHelper.createTestBusiness({
      id: 9001,
      ownerId: 9001,
      name: 'E2E 테스트 카페',
      registrationNumber: '123-45-67890',
      businessType: 'corporation',
      industryType: 'food_service',
      address: '서울시 강남구 테스트로 123',
      phone: '02-0001-0001',
      email: 'test@cafe.e2e',
      status: 'active',
      location: { latitude: 37.4979, longitude: 127.0276 },
      gpsRadiusMeters: 50
    });

    await dbHelper.createTestBusiness({
      id: 9002,
      ownerId: 9001,
      name: 'E2E 테스트 레스토랑',
      registrationNumber: '987-65-43210',
      businessType: 'corporation',
      industryType: 'food_service',
      address: '서울시 서초구 테스트길 456',
      phone: '02-0002-0002',
      email: 'test@restaurant.e2e',
      status: 'active',
      location: { latitude: 37.4833, longitude: 127.0322 },
      gpsRadiusMeters: 100
    });

    // 다중 역할 할당
    await dbHelper.assignUserRole(multiRoleUserId, 9001, 'admin', {
      manage_staff: true,
      view_reports: true
    });
    await dbHelper.assignUserRole(multiRoleUserId, 9002, 'worker', {
      clock_in: true,
      view_schedule: true
    });

    // 로그인
    await loginPage.navigate();
    await loginPage.login('multirole@e2e.test', 'test123!@#');
    await loginPage.expectLoginSuccess();
  });

  test.afterEach(async () => {
    await dbHelper.close();
  });

  /**
   * 기본 역할 전환 기능 테스트
   * UI 요소 존재 및 기본 동작 확인
   */
  test.describe('기본 역할 전환 기능', () => {
    test('역할 전환 UI가 표시되어야 한다', async ({ page }) => {
      // 역할 전환 드롭다운 또는 버튼 확인
      await expect(page.locator('[data-testid="role-switcher"], .role-switcher')).toBeVisible();

      // 현재 역할 표시 확인
      await expect(page.locator('[data-testid="current-role"], .current-role')).toBeVisible();

      // 사용 가능한 역할 목록 확인
      await page.click('[data-testid="role-switcher"]');
      await expect(page.locator('[data-testid="role-option-admin"], .role-option[data-role="admin"]')).toBeVisible();
      await expect(page.locator('[data-testid="role-option-worker"], .role-option[data-role="worker"]')).toBeVisible();
    });

    test('단일 역할 사용자에게는 역할 전환 UI가 표시되지 않아야 한다', async ({ page }) => {
      // 단일 역할 사용자로 다시 로그인
      await loginPage.clickLogout();
      await loginPage.loginAsWorker(); // 기본 단일 역할 사용자

      // 역할 전환 UI가 없어야 함
      await expect(page.locator('[data-testid="role-switcher"]')).not.toBeVisible();
    });

    test('각 역할에 대한 설명이 표시되어야 한다', async ({ page }) => {
      await page.click('[data-testid="role-switcher"]');

      // 관리자 역할 설명
      await expect(page.locator('[data-testid="admin-description"]')).toContainText('직원 관리 및 보고서 조회');

      // 직원 역할 설명
      await expect(page.locator('[data-testid="worker-description"]')).toContainText('출근 기록 및 스케줄 확인');
    });
  });

  /**
   * 역할 전환 실행 테스트
   * 실제 역할 변경 및 결과 확인
   */
  test.describe('역할 전환 실행', () => {
    test('관리자에서 직원으로 역할을 전환할 수 있어야 한다', async ({ page }) => {
      // 초기 관리자 상태 확인
      await expect(page.locator('[data-testid="current-role"]')).toContainText('관리자');
      await expect(page.locator('[data-testid="current-business"]')).toContainText('E2E 테스트 카페');

      // 직원 역할로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');

      // 확인 다이얼로그 처리
      await expect(page.locator('.role-switch-dialog, [role="dialog"]')).toBeVisible();
      await expect(page.locator('.dialog-content')).toContainText('직원 역할로 전환하시겠습니까?');
      await page.click('[data-testid="confirm-switch-button"]');

      // 로딩 대기
      await page.waitForLoadState('networkidle');

      // 역할 전환 완료 확인
      await expect(page.locator('[data-testid="current-role"]')).toContainText('직원');
      await expect(page.locator('[data-testid="current-business"]')).toContainText('E2E 테스트 레스토랑');

      // 성공 메시지 확인
      await expect(page.locator('.success-message')).toContainText('직원 역할로 전환되었습니다');

      // URL 변경 확인 (직원은 근태 페이지로)
      await expect(page).toHaveURL(/.*\/attendance/);
    });

    test('직원에서 관리자로 역할을 전환할 수 있어야 한다', async ({ page }) => {
      // 먼저 직원으로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 관리자로 다시 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-admin"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 관리자 상태 확인
      await expect(page.locator('[data-testid="current-role"]')).toContainText('관리자');
      await expect(page).toHaveURL(/.*\/dashboard/);
    });

    test('역할 전환을 취소할 수 있어야 한다', async ({ page }) => {
      const initialRole = await page.locator('[data-testid="current-role"]').textContent();

      // 역할 전환 시도 후 취소
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="cancel-switch-button"]');

      // 역할이 변경되지 않았는지 확인
      await expect(page.locator('[data-testid="current-role"]')).toContainText(initialRole);
    });
  });

  /**
   * 권한 변화 테스트
   * 역할 전환 후 권한 변화 확인
   */
  test.describe('권한 변화', () => {
    test('관리자 역할에서만 직원 관리 메뉴가 표시되어야 한다', async ({ page }) => {
      // 관리자 상태에서 직원 관리 메뉴 확인
      await expect(page.locator('[data-testid="staff-management"], .staff-management-menu')).toBeVisible();
      await expect(page.locator('[data-testid="reports-menu"], .reports-menu')).toBeVisible();

      // 직원으로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 직원 상태에서는 관리 메뉴가 없어야 함
      await expect(page.locator('[data-testid="staff-management"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="reports-menu"]')).not.toBeVisible();
    });

    test('직원 역할에서만 출근 기능이 활성화되어야 한다', async ({ page }) => {
      // 관리자 상태에서는 출근 버튼이 없거나 비활성화
      await page.goto('/attendance');
      await expect(page.locator('[data-testid="check-in-button"]')).not.toBeVisible();

      // 직원으로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 직원 상태에서는 출근 버튼이 활성화
      await expect(page.locator('[data-testid="check-in-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="check-in-button"]')).toBeEnabled();
    });

    test('역할별로 접근 가능한 페이지가 제한되어야 한다', async ({ page }) => {
      // 관리자에서 관리자 전용 페이지 접근 가능
      await page.goto('/admin/reports');
      await expect(page).toHaveURL(/.*\/admin\/reports/);

      // 직원으로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 직원 상태에서 관리자 페이지 접근 시도
      await page.goto('/admin/reports');

      // 접근 거부 페이지나 리다이렉트 확인
      await expect(page).toHaveURL(/.*\/(forbidden|attendance)/);
      await expect(page.locator('.error-message, .access-denied')).toContainText('접근 권한이 없습니다');
    });
  });

  /**
   * 사업장 변경 테스트
   * 역할 전환 시 사업장도 변경되는 경우
   */
  test.describe('사업장 변경', () => {
    test('역할 전환 시 연결된 사업장이 변경되어야 한다', async ({ page }) => {
      // 초기 사업장 확인 (카페)
      await expect(page.locator('[data-testid="current-business"]')).toContainText('E2E 테스트 카페');

      // 직원 역할로 전환 (레스토랑)
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 사업장 변경 확인
      await expect(page.locator('[data-testid="current-business"]')).toContainText('E2E 테스트 레스토랑');
    });

    test('사업장별 데이터가 올바르게 필터링되어야 한다', async ({ page }) => {
      // 카페 관리자 상태에서 직원 목록 확인
      await page.goto('/staff');
      const cafeStaffCount = await page.locator('.staff-list .staff-item').count();

      // 레스토랑 직원으로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 근태 기록이 레스토랑 것만 표시되는지 확인
      await page.goto('/attendance/history');
      const restaurantRecords = await page.locator('.attendance-record').count();

      // 데이터가 사업장별로 분리되어 있는지 확인
      expect(cafeStaffCount).not.toBe(restaurantRecords);
    });

    test('사업장별 설정이 올바르게 적용되어야 한다', async ({ page }) => {
      // 카페의 근무 시간 설정 확인
      await page.goto('/settings/work-hours');
      await expect(page.locator('[data-testid="work-start-time"]')).toHaveValue('09:00');

      // 레스토랑으로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 레스토랑의 근무 시간 설정 확인
      await page.goto('/settings/work-hours');
      await expect(page.locator('[data-testid="work-start-time"]')).toHaveValue('10:00');
    });
  });

  /**
   * 세션 및 보안 테스트
   * 역할 전환 시 보안 검증
   */
  test.describe('세션 및 보안', () => {
    test('역할 전환 시 새로운 JWT 토큰이 발급되어야 한다', async ({ page }) => {
      // 초기 토큰 저장
      const initialToken = await page.evaluate(() => localStorage.getItem('auth-token'));

      // 역할 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 새로운 토큰 확인
      const newToken = await page.evaluate(() => localStorage.getItem('auth-token'));

      expect(newToken).not.toBe(initialToken);
      expect(newToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    test('역할 전환 기록이 감사 로그에 남아야 한다', async ({ page }) => {
      // 역할 전환 실행
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 데이터베이스에서 감사 로그 확인
      const auditLog = await dbHelper.pool.query(
        'SELECT * FROM audit_logs WHERE user_id = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1',
        [multiRoleUserId, 'role_switch']
      );

      expect(auditLog.rows).toHaveLength(1);
      expect(auditLog.rows[0].details).toContain('admin');
      expect(auditLog.rows[0].details).toContain('worker');
    });

    test('동시 세션에서 역할 전환이 동기화되어야 한다', async ({ page, context }) => {
      // 새 탭 열기
      const newTab = await context.newPage();
      await newTab.goto('/dashboard');

      // 원래 탭에서 역할 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 새 탭에서도 역할이 변경되었는지 확인
      await newTab.waitForTimeout(2000); // 동기화 대기
      await newTab.reload();
      await expect(newTab.locator('[data-testid="current-role"]')).toContainText('직원');

      await newTab.close();
    });
  });

  /**
   * 사용자 경험 테스트
   * 부드러운 전환과 피드백
   */
  test.describe('사용자 경험', () => {
    test('역할 전환 중 로딩 상태가 표시되어야 한다', async ({ page }) => {
      // 네트워크 지연 시뮬레이션
      await page.route('**/api/v1/auth/switch-role', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });

      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');

      // 로딩 스피너 확인
      await expect(page.locator('.loading-spinner, .role-switch-loading')).toBeVisible();
      await expect(page.locator('[data-testid="role-switcher"]')).toBeDisabled();
    });

    test('역할 전환 후 적절한 페이지로 리다이렉트되어야 한다', async ({ page }) => {
      // 관리자 -> 직원 전환 시 근태 페이지로
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveURL(/.*\/attendance/);

      // 직원 -> 관리자 전환 시 대시보드로
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-admin"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveURL(/.*\/dashboard/);
    });

    test('역할별 테마나 스타일이 적용되어야 한다', async ({ page }) => {
      // 관리자 테마 확인
      const adminTheme = await page.locator('body').getAttribute('data-theme');
      expect(adminTheme).toBe('admin');

      // 직원으로 전환
      await page.click('[data-testid="role-switcher"]');
      await page.click('[data-testid="role-option-worker"]');
      await page.click('[data-testid="confirm-switch-button"]');
      await page.waitForLoadState('networkidle');

      // 직원 테마 확인
      const workerTheme = await page.locator('body').getAttribute('data-theme');
      expect(workerTheme).toBe('worker');
    });
  });

  /**
   * 접근성 테스트
   * 역할 전환 UI의 접근성
   */
  test.describe('접근성', () => {
    test('키보드로 역할을 전환할 수 있어야 한다', async ({ page }) => {
      // Tab으로 역할 전환기로 이동
      await page.keyboard.press('Tab');
      while (!(await page.locator('[data-testid="role-switcher"]:focus').count())) {
        await page.keyboard.press('Tab');
      }

      // Enter로 드롭다운 열기
      await page.keyboard.press('Enter');

      // 화살표 키로 옵션 선택
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      // 확인 다이얼로그에서 Enter로 확인
      await page.keyboard.press('Enter');

      await expect(page.locator('[data-testid="current-role"]')).toContainText('직원');
    });

    test('역할 전환 UI가 적절한 ARIA 속성을 가져야 한다', async ({ page }) => {
      const roleSwitcher = page.locator('[data-testid="role-switcher"]');

      // ARIA 속성 확인
      await expect(roleSwitcher).toHaveAttribute('role', 'combobox');
      await expect(roleSwitcher).toHaveAttribute('aria-label', /역할 전환/);
      await expect(roleSwitcher).toHaveAttribute('aria-expanded', 'false');

      // 드롭다운 열기 후 확인
      await roleSwitcher.click();
      await expect(roleSwitcher).toHaveAttribute('aria-expanded', 'true');
    });
  });
});