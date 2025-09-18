/**
 * T132: 로그아웃 플로우 E2E 테스트 작성
 * 안전한 세션 종료 및 인증 상태 정리 검증
 * 다양한 로그아웃 시나리오 테스트
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const { DatabaseHelper, scenarioHelpers, authHelpers } = require('../helpers/test-helpers');

/**
 * 로그아웃 플로우 E2E 테스트 스위트
 * 한글 주석: 안전한 세션 종료와 보안 검증
 */
test.describe('로그아웃 플로우 E2E 테스트', () => {
  let loginPage;
  let dbHelper;

  // 각 테스트 전 초기화 및 로그인 상태 설정
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dbHelper = new DatabaseHelper();

    // 테스트 데이터 설정
    await dbHelper.cleanupTestData();
    await scenarioHelpers.setupScenario('worker', dbHelper);

    // 로그인 상태로 시작
    await loginPage.navigate();
    await loginPage.loginAsWorker();
    await loginPage.expectLoginSuccess();
  });

  test.afterEach(async () => {
    await dbHelper.close();
  });

  /**
   * 기본 로그아웃 기능 테스트
   * 정상적인 로그아웃 플로우 검증
   */
  test.describe('기본 로그아웃 기능', () => {
    test('사용자 메뉴에서 로그아웃할 수 있어야 한다', async ({ page }) => {
      // 사용자 메뉴 클릭
      await page.click('[data-testid="user-menu"], .user-menu');

      // 로그아웃 버튼 클릭
      await page.click('[data-testid="logout-button"], .logout-button, text=로그아웃');

      // 로그인 페이지로 리다이렉트 확인
      await loginPage.expectUrl('/login');

      // 로그아웃 성공 메시지 확인
      await loginPage.checkNotification('로그아웃되었습니다', 'success');
    });

    test('확인 다이얼로그가 표시되고 취소할 수 있어야 한다', async ({ page }) => {
      // 로그아웃 시도
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');

      // 확인 다이얼로그 표시 확인
      await loginPage.waitForModal(true);
      await expect(page.locator('.confirm-dialog, [role="dialog"]')).toBeVisible();

      // 취소 버튼 클릭
      await page.click('[data-testid="cancel-button"], .cancel-button, text=취소');

      // 다이얼로그 사라짐 확인
      await loginPage.waitForModal(false);

      // 여전히 로그인 상태 확인
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('확인 다이얼로그에서 로그아웃을 확인할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');

      // 확인 버튼 클릭
      await page.click('[data-testid="confirm-button"], .confirm-button, text=확인');

      // 로그아웃 완료 확인
      await loginPage.expectUrl('/login');
    });
  });

  /**
   * 세션 정리 테스트
   * 인증 토큰, 로컬 스토리지 정리 확인
   */
  test.describe('세션 정리', () => {
    test('로그아웃 시 로컬 스토리지가 정리되어야 한다', async ({ page }) => {
      // 로그인 상태에서 토큰 존재 확인
      const tokenBefore = await page.evaluate(() => localStorage.getItem('auth-token'));
      expect(tokenBefore).toBeTruthy();

      // 로그아웃 실행
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 로컬 스토리지 정리 확인
      const tokenAfter = await page.evaluate(() => localStorage.getItem('auth-token'));
      const userInfoAfter = await page.evaluate(() => localStorage.getItem('user-info'));

      expect(tokenAfter).toBeNull();
      expect(userInfoAfter).toBeNull();
    });

    test('로그아웃 시 세션 스토리지가 정리되어야 한다', async ({ page }) => {
      // 세션 데이터 설정
      await page.evaluate(() => {
        sessionStorage.setItem('temp-data', 'test');
        sessionStorage.setItem('form-data', 'test');
      });

      // 로그아웃 실행
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 세션 스토리지 정리 확인
      const tempData = await page.evaluate(() => sessionStorage.getItem('temp-data'));
      const formData = await page.evaluate(() => sessionStorage.getItem('form-data'));

      expect(tempData).toBeNull();
      expect(formData).toBeNull();
    });

    test('로그아웃 시 쿠키가 정리되어야 한다', async ({ page, context }) => {
      // 로그아웃 실행
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 인증 관련 쿠키 정리 확인
      const cookies = await context.cookies();
      const authCookies = cookies.filter(cookie =>
        cookie.name.includes('auth') ||
        cookie.name.includes('session') ||
        cookie.name.includes('token')
      );

      expect(authCookies).toHaveLength(0);
    });
  });

  /**
   * 자동 로그아웃 테스트
   * 세션 만료, 비활성화 등
   */
  test.describe('자동 로그아웃', () => {
    test('세션 만료 시 자동으로 로그아웃되어야 한다', async ({ page }) => {
      // 만료된 토큰으로 교체
      await page.evaluate(() => {
        const expiredToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDB1MzkwMDB9.expired';
        localStorage.setItem('auth-token', expiredToken);
      });

      // API 호출이 필요한 페이지 이동
      await page.goto('/attendance');

      // 자동 로그아웃 및 리다이렉트 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('세션이 만료되었습니다', 'warning');
    });

    test('비활성화된 계정은 자동으로 로그아웃되어야 한다', async ({ page }) => {
      // 계정 비활성화
      await dbHelper.pool.query(
        'UPDATE users SET status = $1 WHERE email = $2',
        ['inactive', 'worker@e2e.test']
      );

      // API 호출 시도
      await page.goto('/attendance');

      // 자동 로그아웃 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('계정이 비활성화되었습니다', 'error');
    });

    test('장시간 비활성 상태에서 자동 로그아웃되어야 한다', async ({ page }) => {
      // 비활성 타임아웃 시뮬레이션 (실제로는 30분, 테스트에서는 5초)
      await page.evaluate(() => {
        // 마지막 활동 시간을 과거로 설정
        localStorage.setItem('last-activity', Date.now() - (31 * 60 * 1000));
      });

      // 페이지 새로고침으로 비활성 체크 트리거
      await page.reload();

      // 자동 로그아웃 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('비활성으로 인해 로그아웃되었습니다', 'info');
    });
  });

  /**
   * 다중 탭/윈도우 로그아웃 테스트
   * 한 탭에서 로그아웃 시 다른 탭도 영향 받는지 확인
   */
  test.describe('다중 탭 로그아웃', () => {
    test('한 탭에서 로그아웃 시 다른 탭도 로그아웃되어야 한다', async ({ page, context }) => {
      // 새 탭 열기
      const newTab = await context.newPage();
      await newTab.goto('/dashboard');

      // 새 탭도 로그인 상태 확인
      await expect(newTab.locator('[data-testid="user-menu"]')).toBeVisible();

      // 원래 탭에서 로그아웃
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 새 탭에서도 로그아웃 확인 (storage 이벤트나 periodic check로)
      await newTab.waitForTimeout(2000); // 실제로는 즉시 또는 몇 초 내
      await newTab.reload();
      await expect(newTab).toHaveURL(/.*\/login/);

      await newTab.close();
    });

    test('브로드캐스트 채널을 통한 실시간 로그아웃 동기화', async ({ page, context }) => {
      const newTab = await context.newPage();
      await newTab.goto('/attendance');

      // 원래 탭에서 로그아웃
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 새 탭에서 즉시 로그아웃 메시지 확인
      await expect(newTab.locator('.logout-notification, [role="alert"]')).toBeVisible({ timeout: 3000 });
      await expect(newTab).toHaveURL(/.*\/login/);

      await newTab.close();
    });
  });

  /**
   * 역할별 로그아웃 테스트
   * 각 역할에 따른 로그아웃 후 처리
   */
  test.describe('역할별 로그아웃', () => {
    test('사업주 로그아웃 시 적절한 페이지로 리다이렉트되어야 한다', async ({ page }) => {
      // 로그아웃 후 재로그인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 로그인 페이지에서 사업주용 링크 확인
      await expect(page.locator('text=사업장 등록')).toBeVisible();
      await expect(page.locator('text=사업주 가이드')).toBeVisible();
    });

    test('직원 로그아웃 시 구직 정보가 표시되어야 한다', async ({ page }) => {
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 로그인 페이지에서 구직 관련 링크 확인
      await expect(page.locator('text=새로운 일자리 찾기')).toBeVisible();
      await expect(page.locator('text=근무 후기 보기')).toBeVisible();
    });
  });

  /**
   * 보안 로그아웃 테스트
   * 보안 위협 상황에서의 강제 로그아웃
   */
  test.describe('보안 로그아웃', () => {
    test('의심스러운 활동 감지 시 강제 로그아웃되어야 한다', async ({ page }) => {
      // 의심스러운 활동 시뮬레이션 (다중 실패한 API 호출)
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          fetch('/api/v1/admin/sensitive-data', {
            headers: { 'Authorization': 'Bearer invalid-token' }
          }).catch(() => {});
        });
      }

      // 보안 알림 및 강제 로그아웃 확인
      await page.waitForTimeout(1000);
      await loginPage.checkNotification('보안상의 이유로 로그아웃되었습니다', 'warning');
      await loginPage.expectUrl('/login');
    });

    test('다른 기기에서 로그인 시 기존 세션 종료 옵션', async ({ page }) => {
      // 다른 기기 로그인 시뮬레이션
      await page.evaluate(() => {
        const event = new CustomEvent('force-logout', {
          detail: { reason: '다른 기기에서 로그인되었습니다' }
        });
        document.dispatchEvent(event);
      });

      // 강제 로그아웃 알림 확인
      await loginPage.checkNotification('다른 기기에서 로그인되었습니다', 'info');
      await loginPage.expectUrl('/login');
    });
  });

  /**
   * 로그아웃 성능 테스트
   * 로그아웃 속도 및 효율성 확인
   */
  test.describe('로그아웃 성능', () => {
    test('로그아웃이 3초 이내에 완료되어야 한다', async ({ page }) => {
      const startTime = Date.now();

      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.expectUrl('/login');

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(3000);
    });

    test('네트워크 오류 시에도 로컬 로그아웃이 동작해야 한다', async ({ page }) => {
      // 네트워크 차단
      await page.context().setOffline(true);

      // 로그아웃 시도
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      // 로컬 정리 확인
      const token = await page.evaluate(() => localStorage.getItem('auth-token'));
      expect(token).toBeNull();

      // 네트워크 복구 후 서버 동기화 확인
      await page.context().setOffline(false);
      await page.reload();
      await loginPage.expectUrl('/login');
    });
  });

  /**
   * 접근성 테스트
   * 로그아웃 UI의 접근성 확인
   */
  test.describe('접근성', () => {
    test('키보드로 로그아웃할 수 있어야 한다', async ({ page }) => {
      // Tab으로 사용자 메뉴로 이동
      await page.keyboard.press('Tab');
      while (!(await page.locator('[data-testid="user-menu"]:focus').count())) {
        await page.keyboard.press('Tab');
      }

      // Enter로 메뉴 열기
      await page.keyboard.press('Enter');

      // 로그아웃 항목으로 이동 후 Enter
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      // 확인 다이얼로그에서 Enter로 확인
      await page.keyboard.press('Enter');

      await loginPage.expectUrl('/login');
    });

    test('로그아웃 버튼이 적절한 라벨을 가져야 한다', async ({ page }) => {
      await page.click('[data-testid="user-menu"]');

      const logoutButton = page.locator('[data-testid="logout-button"]');

      // aria-label 또는 텍스트 확인
      const hasLabel = await logoutButton.evaluate(el =>
        el.getAttribute('aria-label') || el.textContent
      );

      expect(hasLabel).toContain('로그아웃');
    });
  });
});