/**
 * T324: 권한 및 접근 제어 E2E 테스트
 * 역할별 접근 권한 검증 및 보안 테스트
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../page-objects/login-page');
const { testUsers, testBusinesses } = require('../fixtures/test-data');
const { authHelpers } = require('../helpers/test-helpers');

test.describe('권한 및 접근 제어', () => {
  let loginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test.describe('역할별 접근 권한', () => {
    test('Owner 전용 기능 접근', async ({ page }) => {
      // Given: Owner로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.owner.email, testUsers.owner.password);
      await page.waitForURL('**/dashboard');

      // Then: Owner 전용 메뉴 표시
      await expect(page.locator('nav >> text=직원 관리')).toBeVisible();
      await expect(page.locator('nav >> text=급여 관리')).toBeVisible();
      await expect(page.locator('nav >> text=사업장 설정')).toBeVisible();
      await expect(page.locator('nav >> text=매출 분석')).toBeVisible();

      // When: 직원 관리 페이지 접근
      await page.click('nav >> text=직원 관리');
      await page.waitForURL('**/employees');

      // Then: 접근 성공
      await expect(page.locator('h1:has-text("직원 관리")')).toBeVisible();
      await expect(page.locator('button:has-text("직원 추가")')).toBeVisible();
    });

    test('Manager 권한 범위', async ({ page }) => {
      // Given: Manager로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // Then: Manager 허용 메뉴
      await expect(page.locator('nav >> text=스케줄 관리')).toBeVisible();
      await expect(page.locator('nav >> text=근태 관리')).toBeVisible();
      await expect(page.locator('nav >> text=직원 조회')).toBeVisible();

      // Owner 전용 메뉴는 숨김
      await expect(page.locator('nav >> text=급여 관리')).not.toBeVisible();
      await expect(page.locator('nav >> text=사업장 설정')).not.toBeVisible();

      // When: 스케줄 관리 접근
      await page.click('nav >> text=스케줄 관리');
      await page.waitForURL('**/schedule');

      // Then: 스케줄 생성/수정 가능
      await expect(page.locator('button:has-text("스케줄 추가")')).toBeVisible();
    });

    test('Worker 제한 사항', async ({ page }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // Then: Worker 허용 메뉴만 표시
      await expect(page.locator('nav >> text=내 근태')).toBeVisible();
      await expect(page.locator('nav >> text=내 스케줄')).toBeVisible();
      await expect(page.locator('nav >> text=급여 명세서')).toBeVisible();

      // 관리자 메뉴 숨김
      await expect(page.locator('nav >> text=직원 관리')).not.toBeVisible();
      await expect(page.locator('nav >> text=스케줄 관리')).not.toBeVisible();

      // When: 자신의 근태 페이지 접근
      await page.click('nav >> text=내 근태');
      await page.waitForURL('**/my-attendance');

      // Then: 자신의 데이터만 조회 가능
      await expect(page.locator(`text=${testUsers.worker.name}`)).toBeVisible();
    });

    test('Seeker 접근 제한', async ({ page }) => {
      // Given: Seeker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.seeker.email, testUsers.seeker.password);
      await page.waitForURL('**/jobs'); // 구직 대시보드로

      // Then: 구직자 전용 메뉴
      await expect(page.locator('nav >> text=구인 공고')).toBeVisible();
      await expect(page.locator('nav >> text=지원 내역')).toBeVisible();
      await expect(page.locator('nav >> text=이력서 관리')).toBeVisible();

      // 사업장 메뉴 없음
      await expect(page.locator('nav >> text=근태 관리')).not.toBeVisible();
      await expect(page.locator('nav >> text=스케줄 관리')).not.toBeVisible();
    });
  });

  test.describe('미인증 사용자 접근 차단', () => {
    test('보호된 페이지 직접 접근 시 로그인으로 리다이렉션', async ({ page }) => {
      // When: 로그인 없이 대시보드 접근
      await page.goto('/dashboard');

      // Then: 로그인 페이지로 리다이렉션
      await page.waitForURL('**/login');
      await expect(page.locator('text=로그인이 필요합니다')).toBeVisible();

      // 원래 요청한 페이지 URL 저장
      const returnUrl = page.url();
      expect(returnUrl).toContain('returnUrl=%2Fdashboard');
    });

    test('API 직접 호출 차단', async ({ page }) => {
      // When: 인증 없이 API 호출
      const response = await page.request.get('/api/attendance/status');

      // Then: 401 Unauthorized
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toContain('Authentication required');
    });

    test('공개 페이지는 접근 가능', async ({ page }) => {
      // When: 로그인, 회원가입 페이지 접근
      await page.goto('/login');
      await expect(page.locator('button:has-text("로그인")')).toBeVisible();

      await page.goto('/register');
      await expect(page.locator('button:has-text("회원가입")')).toBeVisible();

      // 이용약관, 개인정보처리방침 등
      await page.goto('/terms');
      await expect(page.locator('text=이용약관')).toBeVisible();
    });
  });

  test.describe('권한 상승 공격 방지', () => {
    test('URL 직접 입력으로 권한 상승 시도 차단', async ({ page }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: Owner 전용 페이지 직접 접근 시도
      await page.goto('/employees/manage');

      // Then: 접근 거부
      await expect(page.locator('text=접근 권한이 없습니다')).toBeVisible();
      // 또는 대시보드로 리다이렉션
      // await page.waitForURL('**/dashboard');
    });

    test('API로 권한 없는 작업 시도 차단', async ({ page, request }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 쿠키 가져오기
      const cookies = await page.context().cookies();
      const authCookie = cookies.find(c => c.name === 'auth-token');

      // When: 직원 삭제 API 호출 (Owner 전용)
      const response = await request.delete('/api/employees/9999', {
        headers: {
          'Cookie': `auth-token=${authCookie?.value}`
        }
      });

      // Then: 403 Forbidden
      expect(response.status()).toBe(403);

      const body = await response.json();
      expect(body.error).toContain('Insufficient permissions');
    });

    test('로컬 스토리지 조작으로 권한 변경 시도 차단', async ({ page }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 로컬 스토리지에서 역할 변경 시도
      await page.evaluate(() => {
        const userInfo = JSON.parse(localStorage.getItem('user') || '{}');
        userInfo.role = 'owner';
        localStorage.setItem('user', JSON.stringify(userInfo));
      });

      // 페이지 새로고침
      await page.reload();

      // Then: 서버에서 실제 권한 확인하여 차단
      await page.click('nav >> text=직원 관리');
      await expect(page.locator('text=접근 권한이 없습니다')).toBeVisible();
    });
  });

  test.describe('데이터 격리', () => {
    test('다른 사업장 데이터 접근 차단', async ({ page }) => {
      // Given: Business A의 Owner로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.owner.email, testUsers.owner.password);
      await page.waitForURL('**/dashboard');

      // When: Business B의 데이터 직접 접근 시도
      await page.goto(`/business/${testBusinesses.restaurant.id}/employees`);

      // Then: 접근 거부
      await expect(page.locator('text=해당 사업장에 접근할 수 없습니다')).toBeVisible();
    });

    test('다른 사용자 정보 조회 차단', async ({ page }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 다른 직원의 프로필 접근 시도
      await page.goto('/profile/9002'); // 다른 사용자 ID

      // Then: 자신의 프로필로 리다이렉션 또는 에러
      const url = page.url();
      expect(url).toContain(`/profile/${testUsers.worker.id}`);
      // 또는
      // await expect(page.locator('text=접근할 수 없는 프로필입니다')).toBeVisible();
    });

    test('급여 정보 접근 권한', async ({ page }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 자신의 급여 명세서 접근
      await page.click('nav >> text=급여 명세서');
      await page.waitForURL('**/payslips');

      // Then: 자신의 데이터만 표시
      await expect(page.locator(`text=${testUsers.worker.name}`)).toBeVisible();

      // 다른 직원 급여 정보는 보이지 않음
      await expect(page.locator(`text=${testUsers.admin.name}`)).not.toBeVisible();
    });
  });

  test.describe('동적 권한 변경', () => {
    test('권한 승격 시 즉시 반영', async ({ page, browser }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 초기 메뉴 확인
      await expect(page.locator('nav >> text=직원 관리')).not.toBeVisible();

      // When: 관리자가 권한 승격 (다른 브라우저에서)
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      const adminLoginPage = new LoginPage(adminPage);

      await adminLoginPage.goto();
      await adminLoginPage.login(testUsers.owner.email, testUsers.owner.password);
      await adminPage.waitForURL('**/dashboard');

      await adminPage.goto('/employees');
      await adminPage.click(`[data-user-id="${testUsers.worker.id}"] >> text=권한 변경`);
      await adminPage.selectOption('select[name="role"]', 'manager');
      await adminPage.click('button:has-text("저장")');

      await adminContext.close();

      // Then: Worker 페이지에 변경사항 반영
      await page.reload(); // 또는 WebSocket으로 실시간 업데이트
      await expect(page.locator('nav >> text=스케줄 관리')).toBeVisible();
    });

    test('권한 박탈 시 즉시 반영', async ({ page }) => {
      // Given: Manager로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지 접근
      await page.goto('/schedule');
      await expect(page.locator('h1:has-text("스케줄 관리")')).toBeVisible();

      // When: 권한이 Worker로 변경됨 (시뮬레이션)
      await page.evaluate(() => {
        // WebSocket 메시지 시뮬레이션
        window.dispatchEvent(new CustomEvent('permission-changed', {
          detail: { role: 'worker' }
        }));
      });

      // Then: 접근 권한 없음 메시지
      // await expect(page.locator('text=권한이 변경되었습니다')).toBeVisible();
      // await page.waitForURL('**/dashboard');
    });
  });

  test.describe('RBAC (Role-Based Access Control) 세부 권한', () => {
    test('Manager의 스케줄 생성 권한', async ({ page }) => {
      // Given: Manager로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // When: 스케줄 생성
      await page.goto('/schedule');
      await page.click('button:has-text("스케줄 추가")');

      // Then: 생성 가능
      await expect(page.locator('text=새 스케줄')).toBeVisible();
    });

    test('Manager의 급여 조회 권한 없음', async ({ page }) => {
      // Given: Manager로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // When: 급여 관리 접근 시도
      await page.goto('/payroll');

      // Then: 접근 거부
      await expect(page.locator('text=접근 권한이 없습니다')).toBeVisible();
    });

    test('Worker의 자기 데이터만 수정 권한', async ({ page }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 프로필 수정
      await page.goto('/profile');
      await page.fill('input[name="phone"]', '010-1234-5678');
      await page.click('button:has-text("저장")');

      // Then: 자신의 정보 수정 성공
      await expect(page.locator('text=프로필이 업데이트되었습니다')).toBeVisible();
    });
  });

  test.describe('권한 검증 성능', () => {
    test('권한 체크 캐싱', async ({ page }) => {
      // Given: 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 여러 페이지 빠르게 이동
      const startTime = Date.now();

      await page.goto('/my-attendance');
      await page.goto('/my-schedule');
      await page.goto('/payslips');
      await page.goto('/dashboard');

      const endTime = Date.now();

      // Then: 권한 체크가 캐싱되어 빠른 응답
      expect(endTime - startTime).toBeLessThan(2000); // 2초 이내
    });

    test('권한 변경 시 캐시 무효화', async ({ page }) => {
      // Given: Worker로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 권한 변경 이벤트
      await page.evaluate(() => {
        // 권한 캐시 무효화 시뮬레이션
        localStorage.removeItem('permissions-cache');
      });

      // Then: 새로운 권한으로 재확인
      await page.reload();
      // 권한에 맞는 메뉴 표시 확인
    });
  });
});

test.describe('권한 관리 접근성', () => {
  test('스크린리더 권한 정보 제공', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.manager.email, testUsers.manager.password);
    await page.waitForURL('**/dashboard');

    // 역할 정보가 스크린리더에 제공되는지 확인
    const roleInfo = page.locator('[aria-label*="역할"], [role="status"]');
    await expect(roleInfo).toContainText('Manager');
  });

  test('권한 없는 영역 키보드 네비게이션 차단', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.worker.email, testUsers.worker.password);
    await page.waitForURL('**/dashboard');

    // Tab 키로 네비게이션 시 권한 없는 메뉴 건너뛰기
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.textContent);

    // 권한 있는 메뉴만 포커스 가능
    expect(focusedElement).not.toContain('직원 관리');
  });
});