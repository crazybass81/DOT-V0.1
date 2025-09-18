/**
 * T135: 세션 만료 처리 E2E 테스트 작성
 * 자동 로그아웃, 토큰 만료, 세션 타임아웃 검증
 * 사용자 경험과 보안 요구사항 테스트
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const { DatabaseHelper, scenarioHelpers, authHelpers, networkHelpers } = require('../helpers/test-helpers');

/**
 * 세션 만료 처리 E2E 테스트 스위트
 * 한글 주석: 토큰 만료와 자동 로그아웃 시나리오
 */
test.describe('세션 만료 처리 E2E 테스트', () => {
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
   * JWT 토큰 만료 처리 테스트
   * 만료된 토큰으로 API 요청 시 자동 로그아웃
   */
  test.describe('JWT 토큰 만료', () => {
    test('만료된 토큰으로 API 요청 시 자동 로그아웃되어야 한다', async ({ page }) => {
      // 만료된 토큰으로 교체
      await page.evaluate(() => {
        const expiredToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDA0MzkwMDB9.invalid-expired-token';
        localStorage.setItem('auth-token', expiredToken);
      });

      // API 호출이 필요한 페이지로 이동
      await page.goto('/attendance');

      // 자동 로그아웃 및 리다이렉트 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('세션이 만료되었습니다. 다시 로그인해주세요.', 'warning');
    });

    test('토큰 만료 시 갱신 시도 후 실패하면 로그아웃되어야 한다', async ({ page }) => {
      // 리프레시 토큰도 만료된 상황 시뮬레이션
      await networkHelpers.mockApiResponse(page, '**/api/v1/auth/refresh', {
        status: 401,
        data: { message: 'Refresh token expired' }
      });

      // 만료된 토큰 설정
      await page.evaluate(() => {
        const expiredToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDA0MzkwMDB9.expired';
        localStorage.setItem('auth-token', expiredToken);
        localStorage.setItem('refresh-token', 'expired-refresh');
      });

      // API 호출 시도
      await page.goto('/dashboard');

      // 리프레시 실패 후 로그아웃 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('세션이 만료되어 자동으로 로그아웃되었습니다.', 'info');
    });

    test('토큰 만료 5분 전 갱신 알림이 표시되어야 한다', async ({ page }) => {
      // 5분 후 만료되는 토큰 생성
      const fiveMinutesLater = Math.floor(Date.now() / 1000) + (5 * 60);
      const tokenPayload = {
        userId: 9001,
        businessId: 9001,
        role: 'worker',
        exp: fiveMinutesLater
      };

      // 토큰 갱신 시뮬레이션
      await page.evaluate(([payload]) => {
        const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'HS256' }));
        const body = btoa(JSON.stringify(payload));
        const token = `${header}.${body}.signature`;
        localStorage.setItem('auth-token', token);
      }, [tokenPayload]);

      // 페이지 새로고침하여 토큰 체크 트리거
      await page.reload();

      // 갱신 알림 확인
      await expect(page.locator('.session-warning, [data-testid="session-warning"]')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('text=세션이 곧 만료됩니다')).toBeVisible();
    });
  });

  /**
   * 비활성 타임아웃 테스트
   * 사용자 비활성 상태에서 자동 로그아웃
   */
  test.describe('비활성 타임아웃', () => {
    test('30분 비활성 후 자동 로그아웃되어야 한다', async ({ page }) => {
      // 마지막 활동 시간을 31분 전으로 설정
      await page.evaluate(() => {
        const thirtyOneMinutesAgo = Date.now() - (31 * 60 * 1000);
        localStorage.setItem('last-activity', thirtyOneMinutesAgo.toString());
      });

      // 페이지 새로고침으로 비활성 체크 트리거
      await page.reload();

      // 자동 로그아웃 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('장시간 비활성으로 인해 자동 로그아웃되었습니다.', 'info');
    });

    test('비활성 경고 후 사용자 활동 시 세션이 연장되어야 한다', async ({ page }) => {
      // 25분 비활성 상태 설정 (경고 단계)
      await page.evaluate(() => {
        const twentyFiveMinutesAgo = Date.now() - (25 * 60 * 1000);
        localStorage.setItem('last-activity', twentyFiveMinutesAgo.toString());
      });

      await page.reload();

      // 비활성 경고 표시 확인
      await expect(page.locator('.inactivity-warning')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('text=5분 후 자동 로그아웃됩니다')).toBeVisible();

      // 사용자 활동 (클릭)
      await page.click('body');

      // 경고 사라짐 확인
      await expect(page.locator('.inactivity-warning')).not.toBeVisible();

      // 세션 연장 확인
      const lastActivity = await page.evaluate(() => localStorage.getItem('last-activity'));
      const now = Date.now();
      expect(parseInt(lastActivity)).toBeCloseTo(now, -3); // 3초 오차 허용
    });

    test('비활성 경고 중 연장 버튼 클릭 시 세션이 연장되어야 한다', async ({ page }) => {
      // 비활성 경고 트리거
      await page.evaluate(() => {
        const twentySixMinutesAgo = Date.now() - (26 * 60 * 1000);
        localStorage.setItem('last-activity', twentySixMinutesAgo.toString());
      });

      await page.reload();

      // 연장 버튼 클릭
      await page.click('[data-testid="extend-session"], .extend-session');

      // 경고 사라지고 세션 연장 확인
      await expect(page.locator('.inactivity-warning')).not.toBeVisible();
      await loginPage.checkNotification('세션이 연장되었습니다.', 'success');
    });
  });

  /**
   * 서버 측 세션 만료 테스트
   * 데이터베이스 세션 상태와 동기화
   */
  test.describe('서버 측 세션 만료', () => {
    test('서버에서 세션 무효화 시 클라이언트도 로그아웃되어야 한다', async ({ page }) => {
      // 서버에서 세션 무효화 시뮬레이션
      await dbHelper.pool.query(
        'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
        [9001]
      );

      // API 호출 시도
      await page.goto('/attendance');

      // 서버 세션 무효로 인한 로그아웃 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('세션이 무효화되었습니다. 다시 로그인해주세요.', 'warning');
    });

    test('동시 로그인 제한 초과 시 이전 세션이 종료되어야 한다', async ({ page, context }) => {
      // 새 브라우저 컨텍스트에서 동일 계정 로그인
      const newContext = await context.browser().newContext();
      const newPage = await newContext.newPage();
      const newLoginPage = new LoginPage(newPage);

      await newLoginPage.navigate();
      await newLoginPage.loginAsWorker();

      // 원래 페이지에서 API 호출 시도
      await page.goto('/dashboard');

      // 이전 세션 종료 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('다른 기기에서 로그인하여 현재 세션이 종료되었습니다.', 'info');

      await newContext.close();
    });

    test('관리자에 의한 강제 로그아웃이 즉시 적용되어야 한다', async ({ page }) => {
      // 관리자의 강제 로그아웃 시뮬레이션
      await networkHelpers.simulateWebSocketMessage(page, 'force-logout', {
        userId: 9001,
        reason: '관리자에 의한 강제 로그아웃',
        timestamp: Date.now()
      });

      // 즉시 로그아웃 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('관리자에 의해 강제 로그아웃되었습니다.', 'warning');
    });
  });

  /**
   * 네트워크 연결 문제 시 세션 처리
   * 오프라인/온라인 상태 변화 대응
   */
  test.describe('네트워크 연결 문제', () => {
    test('네트워크 연결 끊김 시 적절한 메시지가 표시되어야 한다', async ({ page }) => {
      // 네트워크 오프라인 설정
      await page.context().setOffline(true);

      // API 호출 시도
      await page.goto('/attendance');

      // 네트워크 오류 메시지 확인
      await expect(page.locator('.network-error, [data-testid="network-error"]')).toBeVisible();
      await expect(page.locator('text=네트워크 연결을 확인해주세요')).toBeVisible();
    });

    test('네트워크 복구 시 자동으로 세션 상태를 확인해야 한다', async ({ page }) => {
      // 오프라인 상태로 설정
      await page.context().setOffline(true);
      await page.reload();

      // 온라인 복구
      await page.context().setOffline(false);

      // 자동 세션 확인 대기
      await page.waitForTimeout(2000);

      // 세션 유효성 확인 후 정상 동작
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('네트워크 불안정 시 재시도 로직이 동작해야 한다', async ({ page }) => {
      let retryCount = 0;

      // 3회까지 실패 후 성공하는 시나리오
      await page.route('**/api/v1/auth/verify', async route => {
        retryCount++;
        if (retryCount <= 3) {
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });

      // 세션 확인 트리거
      await page.reload();

      // 재시도 후 성공 확인
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible({ timeout: 10000 });
    });
  });

  /**
   * 다중 탭 세션 동기화
   * 탭 간 세션 상태 동기화 테스트
   */
  test.describe('다중 탭 세션 동기화', () => {
    test('한 탭에서 세션 만료 시 다른 탭도 동시에 로그아웃되어야 한다', async ({ page, context }) => {
      // 새 탭 열기
      const newTab = await context.newPage();
      await newTab.goto('/dashboard');

      // 원래 탭에서 토큰 만료 시뮬레이션
      await page.evaluate(() => {
        localStorage.setItem('auth-token', 'expired-token');
      });

      // 원래 탭에서 API 호출로 세션 만료 트리거
      await page.goto('/attendance');

      // 새 탭에서도 자동 로그아웃 확인
      await newTab.waitForTimeout(2000);
      await newTab.reload();
      await expect(newTab).toHaveURL(/.*\/login/);

      await newTab.close();
    });

    test('브로드캐스트 채널을 통한 실시간 세션 동기화', async ({ page, context }) => {
      const newTab = await context.newPage();
      await newTab.goto('/attendance');

      // BroadcastChannel을 통한 로그아웃 메시지 전송
      await page.evaluate(() => {
        const channel = new BroadcastChannel('auth-channel');
        channel.postMessage({
          type: 'logout',
          reason: '세션 만료',
          timestamp: Date.now()
        });
      });

      // 새 탭에서 즉시 로그아웃 확인
      await expect(newTab.locator('.logout-notification')).toBeVisible({ timeout: 3000 });
      await expect(newTab).toHaveURL(/.*\/login/);

      await newTab.close();
    });
  });

  /**
   * 세션 복구 테스트
   * 페이지 새로고침 시 세션 상태 복구
   */
  test.describe('세션 복구', () => {
    test('페이지 새로고침 시 유효한 세션이 복구되어야 한다', async ({ page }) => {
      // 현재 로그인 상태 확인
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

      // 페이지 새로고침
      await page.reload();

      // 세션 복구 확인
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      await loginPage.expectUrl('/attendance'); // 직원은 출근 페이지로
    });

    test('잘못된 토큰 형식 시 로그인 페이지로 리다이렉트되어야 한다', async ({ page }) => {
      // 잘못된 형식의 토큰 설정
      await page.evaluate(() => {
        localStorage.setItem('auth-token', 'invalid-token-format');
      });

      // 페이지 새로고침
      await page.reload();

      // 로그인 페이지로 리다이렉트 확인
      await loginPage.expectUrl('/login');
      await loginPage.checkNotification('인증 정보가 올바르지 않습니다.', 'error');
    });

    test('Remember Me 설정 시 장기간 세션이 유지되어야 한다', async ({ page }) => {
      // 로그아웃 후 Remember Me로 재로그인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginWithTestAccount('worker', true); // Remember Me 체크

      // 30일 후 시간 시뮬레이션
      await page.evaluate(() => {
        const thirtyDaysLater = Date.now() + (30 * 24 * 60 * 60 * 1000);
        // 토큰의 만료 시간을 연장
        const payload = {
          userId: 9001,
          businessId: 9001,
          role: 'worker',
          exp: Math.floor(thirtyDaysLater / 1000),
          rememberMe: true
        };
        const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'HS256' }));
        const body = btoa(JSON.stringify(payload));
        const token = `${header}.${body}.signature`;
        localStorage.setItem('auth-token', token);
      });

      // 페이지 새로고침으로 세션 확인
      await page.reload();

      // 세션 유지 확인
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });
  });

  /**
   * 보안 시나리오 테스트
   * 의심스러운 활동 감지 시 세션 처리
   */
  test.describe('보안 시나리오', () => {
    test('의심스러운 IP에서 접근 시 추가 인증이 요구되어야 한다', async ({ page }) => {
      // 의심스러운 IP 접근 시뮬레이션
      await networkHelpers.mockApiResponse(page, '**/api/v1/auth/verify', {
        status: 403,
        data: {
          message: 'Suspicious IP detected',
          requiresAdditionalAuth: true
        }
      });

      await page.reload();

      // 추가 인증 요구 확인
      await expect(page.locator('.additional-auth-modal')).toBeVisible();
      await expect(page.locator('text=추가 인증이 필요합니다')).toBeVisible();
    });

    test('동시 접속 제한 초과 시 적절한 처리가 되어야 한다', async ({ page, context }) => {
      // 동시 접속 제한 시뮬레이션 (6개 세션)
      const contexts = [];
      for (let i = 0; i < 5; i++) {
        const newContext = await context.browser().newContext();
        const newPage = await newContext.newPage();
        const newLoginPage = new LoginPage(newPage);
        await newLoginPage.navigate();
        await newLoginPage.loginAsWorker();
        contexts.push(newContext);
      }

      // 6번째 로그인 시도
      const lastContext = await context.browser().newContext();
      const lastPage = await lastContext.newPage();
      const lastLoginPage = new LoginPage(lastPage);
      await lastLoginPage.navigate();
      await lastLoginPage.login('worker@e2e.test', 'test123!@#');

      // 동시 접속 제한 메시지 확인
      await lastLoginPage.expectLoginFailure('동시 접속 허용 개수를 초과했습니다. 기존 세션을 종료 후 다시 시도해주세요.');

      // 컨텍스트 정리
      for (const ctx of contexts) {
        await ctx.close();
      }
      await lastContext.close();
    });
  });

  /**
   * 성능 테스트
   * 세션 처리 성능 및 응답성
   */
  test.describe('성능 테스트', () => {
    test('세션 확인이 2초 이내에 완료되어야 한다', async ({ page }) => {
      const startTime = Date.now();

      // 페이지 새로고침으로 세션 확인 트리거
      await page.reload();

      // 세션 확인 완료 대기
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000);
    });

    test('다중 탭에서 세션 동기화가 즉시 이루어져야 한다', async ({ page, context }) => {
      const newTab = await context.newPage();
      await newTab.goto('/dashboard');

      const startTime = Date.now();

      // 로그아웃 메시지 브로드캐스트
      await page.evaluate(() => {
        const channel = new BroadcastChannel('auth-channel');
        channel.postMessage({ type: 'logout', reason: 'test' });
      });

      // 새 탭에서 로그아웃 반응 확인
      await expect(newTab.locator('.logout-notification')).toBeVisible({ timeout: 1000 });

      const endTime = Date.now();
      const syncDuration = endTime - startTime;

      expect(syncDuration).toBeLessThan(1000); // 1초 이내 동기화

      await newTab.close();
    });
  });
});