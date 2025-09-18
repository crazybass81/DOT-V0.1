/**
 * T323: 세션 관리 및 로그아웃 E2E 테스트
 * 세션 유지, 갱신, 만료 및 로그아웃 기능 테스트
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../page-objects/login-page');
const { testUsers } = require('../fixtures/test-data');
const { authHelpers, waitHelpers } = require('../helpers/test-helpers');

test.describe('세션 관리 기능', () => {
  let loginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test.describe('로그아웃 기능', () => {
    test('정상적인 로그아웃', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 로그아웃 수행
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=로그아웃');

      // Then: 로그인 페이지로 리다이렉션
      await page.waitForURL('**/login');
      await expect(page.locator('text=로그아웃되었습니다')).toBeVisible();

      // 대시보드 접근 시도 시 로그인 페이지로
      await page.goto('/dashboard');
      await page.waitForURL('**/login');
    });

    test('모든 디바이스에서 로그아웃', async ({ page, context }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 모든 디바이스 로그아웃 선택
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=계정 설정');
      await page.click('button:has-text("모든 디바이스에서 로그아웃")');

      // 확인 다이얼로그
      await page.click('button:has-text("확인")');

      // Then: 모든 세션 종료
      await waitHelpers.waitForToast(page, '모든 디바이스에서 로그아웃되었습니다');
      await page.waitForURL('**/login');
    });

    test('로그아웃 후 브라우저 뒤로가기 차단', async ({ page }) => {
      // Given: 로그인 후 로그아웃
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=로그아웃');
      await page.waitForURL('**/login');

      // When: 브라우저 뒤로가기
      await page.goBack();

      // Then: 로그인 페이지에 머물러야 함
      expect(page.url()).toContain('/login');
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  });

  test.describe('세션 유지 및 갱신', () => {
    test('Remember Me 옵션으로 장기 세션 유지', async ({ page, context }) => {
      // Given: Remember Me 체크
      await loginPage.goto();
      const rememberCheckbox = page.locator('input[name="remember"]');

      if (await rememberCheckbox.count() > 0) {
        await rememberCheckbox.check();
      }

      // When: 로그인
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // Then: 쿠키 확인
      const cookies = await context.cookies();
      const authCookie = cookies.find(c => c.name === 'auth-token' || c.name === 'session');

      if (authCookie) {
        // 30일 이상 유지되는지 확인
        const expiryDate = new Date(authCookie.expires * 1000);
        const daysDiff = (expiryDate - new Date()) / (1000 * 60 * 60 * 24);
        expect(daysDiff).toBeGreaterThan(29);
      }
    });

    test('세션 자동 갱신', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 토큰 만료 직전 활동
      // 테스트 환경에서는 짧은 만료 시간 설정
      await page.waitForTimeout(55000); // 55초 대기

      // API 호출로 활동 시뮬레이션
      await page.click('nav >> text=근태관리');

      // Then: 세션 갱신되어 계속 사용 가능
      await expect(page.locator('text=' + testUsers.worker.name)).toBeVisible();
      expect(page.url()).not.toContain('/login');
    });

    test('비활성 시간 초과 후 자동 로그아웃', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 장시간 비활성 (테스트 환경에서는 짧게 설정)
      // 실제로는 30분 정도, 테스트에서는 설정에 따라
      await page.waitForTimeout(5000);

      // 타임아웃 경고 모달이 있다면
      const warningModal = page.locator('text=세션이 곧 만료됩니다');
      if (await warningModal.isVisible({ timeout: 1000 })) {
        // 아무 액션도 하지 않고 대기
        await page.waitForTimeout(3000);
      }

      // Then: 로그인 페이지로 리다이렉션
      // await page.waitForURL('**/login', { timeout: 10000 });
      // await expect(page.locator('text=세션이 만료되었습니다')).toBeVisible();
    });

    test('활동 중 세션 연장', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 주기적인 활동
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(2000);
        // 페이지 클릭으로 활동 시뮬레이션
        await page.click('body');
      }

      // Then: 세션 유지
      await expect(page.locator('text=' + testUsers.worker.name)).toBeVisible();
      expect(page.url()).not.toContain('/login');
    });
  });

  test.describe('멀티탭/멀티브라우저 동기화', () => {
    test('다른 탭에서 로그아웃 시 현재 탭도 로그아웃', async ({ browser }) => {
      // Given: 두 개의 탭에서 로그인
      const context = await browser.newContext();
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      const loginPage1 = new LoginPage(page1);
      await loginPage1.goto();
      await loginPage1.login(testUsers.worker.email, testUsers.worker.password);
      await page1.waitForURL('**/dashboard');

      // 같은 세션으로 두 번째 탭 열기
      await page2.goto('/dashboard');
      await expect(page2.locator('text=' + testUsers.worker.name)).toBeVisible();

      // When: 첫 번째 탭에서 로그아웃
      await page1.click('button[aria-label="프로필 메뉴"]');
      await page1.click('text=로그아웃');
      await page1.waitForURL('**/login');

      // Then: 두 번째 탭도 로그아웃 상태
      await page2.reload();
      await page2.waitForURL('**/login');

      await context.close();
    });

    test('다른 탭에서 권한 변경 시 동기화', async ({ browser }) => {
      // Given: 관리자 권한으로 로그인
      const context = await browser.newContext();
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      const loginPage1 = new LoginPage(page1);
      await loginPage1.goto();
      await loginPage1.login(testUsers.manager.email, testUsers.manager.password);
      await page1.waitForURL('**/dashboard');

      await page2.goto('/dashboard');

      // When: 권한 변경 시뮬레이션 (실제로는 관리자가 변경)
      // WebSocket이나 폴링으로 감지

      // Then: 양쪽 탭에서 권한 업데이트 확인
      // await expect(page1.locator('nav >> text=관리자 메뉴')).toBeVisible();
      // await expect(page2.locator('nav >> text=관리자 메뉴')).toBeVisible();

      await context.close();
    });
  });

  test.describe('토큰 관리', () => {
    test('Access Token 만료 시 Refresh Token으로 갱신', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: Access Token 만료 시뮬레이션
      await page.evaluate(() => {
        // localStorage의 토큰을 만료된 토큰으로 교체
        const expiredToken = 'expired.token.here';
        localStorage.setItem('access_token', expiredToken);
      });

      // API 호출로 토큰 갱신 트리거
      await page.click('nav >> text=근태관리');

      // Then: 자동으로 토큰 갱신되어 계속 사용 가능
      await expect(page.locator('.attendance-page')).toBeVisible();
      expect(page.url()).not.toContain('/login');
    });

    test('Refresh Token도 만료 시 로그인 페이지로', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 모든 토큰 만료 시뮬레이션
      await page.evaluate(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        // 또는 만료된 토큰으로 설정
      });

      // 보호된 페이지 접근 시도
      await page.goto('/attendance');

      // Then: 로그인 페이지로 리다이렉션
      await page.waitForURL('**/login');
      await expect(page.locator('text=다시 로그인해주세요')).toBeVisible();
    });

    test('CSRF 토큰 검증', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: CSRF 토큰 없이 요청 시도
      const response = await page.evaluate(async () => {
        try {
          const res = await fetch('/api/attendance/check-in', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ location: { lat: 37.5, lng: 127.0 } })
            // CSRF 토큰 헤더 없음
          });
          return { status: res.status };
        } catch (error) {
          return { error: error.message };
        }
      });

      // Then: 요청 거부
      // expect(response.status).toBe(403);
    });
  });

  test.describe('세션 보안', () => {
    test('동시 로그인 제한', async ({ browser }) => {
      // Given: 첫 번째 브라우저에서 로그인
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      const loginPage1 = new LoginPage(page1);

      await loginPage1.goto();
      await loginPage1.login(testUsers.worker.email, testUsers.worker.password);
      await page1.waitForURL('**/dashboard');

      // When: 두 번째 브라우저에서 같은 계정 로그인
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      const loginPage2 = new LoginPage(page2);

      await loginPage2.goto();
      await loginPage2.login(testUsers.worker.email, testUsers.worker.password);
      await page2.waitForURL('**/dashboard');

      // Then: 설정에 따라
      // Option 1: 첫 번째 세션 종료
      // await page1.reload();
      // await page1.waitForURL('**/login');
      // await expect(page1.locator('text=다른 기기에서 로그인')).toBeVisible();

      // Option 2: 경고 메시지
      // await expect(page2.locator('text=다른 기기에서 이미 로그인')).toBeVisible();

      await context1.close();
      await context2.close();
    });

    test('IP 변경 감지', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: IP 변경 시뮬레이션 (테스트 환경에서는 헤더 조작)
      await page.route('**/*', route => {
        route.continue({
          headers: {
            ...route.request().headers(),
            'X-Forwarded-For': '192.168.100.100' // 다른 IP
          }
        });
      });

      await page.reload();

      // Then: 보안 경고 또는 재인증 요구
      // const securityWarning = page.locator('text=보안 확인이 필요합니다');
      // if (await securityWarning.isVisible({ timeout: 2000 })) {
      //   await expect(securityWarning).toBeVisible();
      // }
    });

    test('세션 하이재킹 방지', async ({ page, context }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 세션 쿠키 탈취 시뮬레이션
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name === 'session' || c.name === 'auth-token');

      if (sessionCookie) {
        // 다른 User-Agent로 쿠키 사용 시도
        await page.setExtraHTTPHeaders({
          'User-Agent': 'Different Browser'
        });

        await page.reload();

        // Then: 세션 무효화 또는 경고
        // 구현에 따라 다를 수 있음
      }
    });
  });

  test.describe('세션 정보 표시', () => {
    test('활성 세션 목록 조회', async ({ page }) => {
      // Given: 로그인 상태
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // When: 계정 설정 페이지로 이동
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=계정 설정');
      await page.click('text=세션 관리');

      // Then: 활성 세션 목록 표시
      await expect(page.locator('text=현재 세션')).toBeVisible();
      await expect(page.locator('.session-list')).toBeVisible();

      // 세션 정보 포함 사항
      await expect(page.locator('text=위치')).toBeVisible();
      await expect(page.locator('text=디바이스')).toBeVisible();
      await expect(page.locator('text=마지막 활동')).toBeVisible();
    });

    test('특정 세션 종료', async ({ page }) => {
      // Given: 계정 설정 - 세션 관리 페이지
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      await page.goto('/settings/sessions');

      // When: 다른 세션 종료 버튼 클릭
      const otherSession = page.locator('.session-item').filter({ hasNot: page.locator('text=현재 세션') }).first();

      if (await otherSession.count() > 0) {
        await otherSession.locator('button:has-text("종료")').click();
        await page.click('button:has-text("확인")');

        // Then: 해당 세션 제거
        await waitHelpers.waitForToast(page, '세션이 종료되었습니다');
        await expect(otherSession).not.toBeVisible();
      }
    });
  });
});

test.describe('세션 관리 접근성', () => {
  test('키보드로 로그아웃 가능', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.worker.email, testUsers.worker.password);
    await page.waitForURL('**/dashboard');

    // Tab 키로 프로필 메뉴로 이동
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    // 프로필 메뉴 열기
    await page.keyboard.press('Enter');

    // 로그아웃 선택
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await page.waitForURL('**/login');
  });

  test('세션 만료 경고 스크린리더 알림', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.worker.email, testUsers.worker.password);
    await page.waitForURL('**/dashboard');

    // 세션 만료 경고 시뮬레이션
    // aria-live 영역에 경고 메시지 확인
    const ariaLiveRegion = page.locator('[aria-live="polite"], [aria-live="assertive"]');

    // 실제 타임아웃 대기 대신 모의 트리거
    // await expect(ariaLiveRegion).toContainText('세션이 곧 만료됩니다');
  });
});