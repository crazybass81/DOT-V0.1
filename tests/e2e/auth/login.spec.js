/**
 * T131: 로그인 페이지 E2E 테스트 작성 (RED)
 * TDD 원칙에 따른 실패하는 테스트 먼저 작성
 * 실제 브라우저 환경에서 로그인 플로우 검증
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const { DatabaseHelper, scenarioHelpers, authHelpers } = require('../helpers/test-helpers');

/**
 * 로그인 페이지 E2E 테스트 스위트
 * 한글 주석: 실제 사용자 시나리오를 브라우저에서 검증
 */
test.describe('로그인 페이지 E2E 테스트', () => {
  let loginPage;
  let dbHelper;

  // 각 테스트 전 초기화
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dbHelper = new DatabaseHelper();

    // 테스트 데이터 정리 및 설정
    await dbHelper.cleanupTestData();
    await scenarioHelpers.setupScenario('worker', dbHelper);

    // 로그인 페이지로 이동
    await loginPage.navigate();
  });

  // 각 테스트 후 정리
  test.afterEach(async () => {
    await dbHelper.close();
  });

  /**
   * 기본 로그인 폼 렌더링 테스트
   * 필수 요소들이 올바르게 표시되는지 확인
   */
  test('로그인 폼이 올바르게 렌더링되어야 한다', async () => {
    // 로그인 폼 로드 확인
    await loginPage.expectLoginFormLoaded();

    // 페이지 제목 확인
    await expect(loginPage.page).toHaveTitle(/로그인/);

    // 필수 입력 필드 존재 확인
    await expect(loginPage.page.locator(loginPage.selectors.emailInput)).toBeVisible();
    await expect(loginPage.page.locator(loginPage.selectors.passwordInput)).toBeVisible();
    await expect(loginPage.page.locator(loginPage.selectors.loginButton)).toBeVisible();

    // 링크들 존재 확인
    await expect(loginPage.page.locator(loginPage.selectors.forgotPasswordLink)).toBeVisible();
    await expect(loginPage.page.locator(loginPage.selectors.registerLink)).toBeVisible();
  });

  /**
   * 유효한 자격 증명으로 로그인 성공 테스트
   * 각 역할별 계정으로 로그인 시도
   */
  test.describe('로그인 성공 시나리오', () => {
    test('사업주 계정으로 로그인할 수 있어야 한다', async () => {
      // 사업주 계정으로 로그인
      await loginPage.loginAsOwner();

      // 로그인 성공 확인
      await loginPage.expectLoginSuccess();

      // 사업주 대시보드로 리다이렉트 확인
      await loginPage.expectUrl('/dashboard');

      // 사용자 메뉴에 이름 표시 확인
      await loginPage.expectElementText('[data-testid="user-menu"]', 'E2E 사업주');
    });

    test('관리자 계정으로 로그인할 수 있어야 한다', async () => {
      await loginPage.loginAsAdmin();
      await loginPage.expectLoginSuccess();
      await loginPage.expectUrl('/dashboard');
      await loginPage.expectElementText('[data-testid="user-menu"]', 'E2E 관리자');
    });

    test('직원 계정으로 로그인할 수 있어야 한다', async () => {
      await loginPage.loginAsWorker();
      await loginPage.expectLoginSuccess();
      await loginPage.expectUrl('/attendance');
      await loginPage.expectElementText('[data-testid="user-menu"]', 'E2E 직원');
    });

    test('구직자 계정으로 로그인할 수 있어야 한다', async () => {
      await loginPage.loginAsSeeker();
      await loginPage.expectLoginSuccess();
      await loginPage.expectUrl('/jobs');
      await loginPage.expectElementText('[data-testid="user-menu"]', 'E2E 구직자');
    });
  });

  /**
   * 로그인 실패 시나리오 테스트
   * 잘못된 자격 증명 처리 확인
   */
  test.describe('로그인 실패 시나리오', () => {
    test('잘못된 이메일로 로그인 시 에러 메시지가 표시되어야 한다', async () => {
      await loginPage.login('nonexistent@test.com', 'password123');
      await loginPage.expectLoginFailure('이메일 또는 비밀번호가 올바르지 않습니다');
    });

    test('잘못된 비밀번호로 로그인 시 에러 메시지가 표시되어야 한다', async () => {
      await loginPage.login('worker@e2e.test', 'wrongpassword');
      await loginPage.expectLoginFailure('이메일 또는 비밀번호가 올바르지 않습니다');
    });

    test('비활성화된 계정으로 로그인 시 에러 메시지가 표시되어야 한다', async () => {
      // 계정 비활성화
      await dbHelper.pool.query(
        'UPDATE users SET status = $1 WHERE email = $2',
        ['inactive', 'worker@e2e.test']
      );

      await loginPage.loginAsWorker();
      await loginPage.expectLoginFailure('계정이 비활성화되었습니다');
    });
  });

  /**
   * 폼 유효성 검사 테스트
   * 클라이언트 측 검증 동작 확인
   */
  test.describe('폼 유효성 검사', () => {
    test('빈 이메일 필드 시 에러 메시지가 표시되어야 한다', async () => {
      await loginPage.enterPassword('password123');
      await loginPage.clickLoginButton();
      await loginPage.expectFieldError('email', '이메일을 입력해주세요');
    });

    test('빈 비밀번호 필드 시 에러 메시지가 표시되어야 한다', async () => {
      await loginPage.enterEmail('test@example.com');
      await loginPage.clickLoginButton();
      await loginPage.expectFieldError('password', '비밀번호를 입력해주세요');
    });

    test('잘못된 이메일 형식 시 에러 메시지가 표시되어야 한다', async () => {
      await loginPage.enterEmail('invalid-email');
      await loginPage.enterPassword('password123');
      await loginPage.clickLoginButton();
      await loginPage.expectFieldError('email', '올바른 이메일 형식을 입력해주세요');
    });

    test('짧은 비밀번호 시 에러 메시지가 표시되어야 한다', async () => {
      await loginPage.enterEmail('test@example.com');
      await loginPage.enterPassword('123');
      await loginPage.clickLoginButton();
      await loginPage.expectFieldError('password', '비밀번호는 최소 6자 이상이어야 합니다');
    });
  });

  /**
   * 보안 기능 테스트
   * Rate limiting, 브루트 포스 방지 등
   */
  test.describe('보안 기능', () => {
    test('연속적인 로그인 실패 시 Rate Limiting이 적용되어야 한다', async ({ page }) => {
      // 6회 연속 실패 시도
      await loginPage.simulateBruteForceAttack(6);

      // Rate limit 메시지 확인
      await loginPage.expectRateLimitMessage();

      // 로그인 버튼 비활성화 확인
      await loginPage.expectLoginButtonState(false);
    });

    test('세션 토큰이 안전하게 저장되어야 한다', async ({ page }) => {
      await loginPage.loginAsWorker();
      await loginPage.expectLoginSuccess();

      // 로컬 스토리지에 토큰 존재 확인
      const token = await page.evaluate(() => localStorage.getItem('auth-token'));
      expect(token).toBeTruthy();

      // 토큰 형식 확인 (JWT)
      expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    test('로그인 후 URL 히스토리가 안전하게 처리되어야 한다', async ({ page }) => {
      // 보호된 페이지 접근 시도
      await page.goto('/admin/sensitive-data');

      // 로그인 페이지로 리다이렉트 확인
      await loginPage.expectUrl('/login');

      // 로그인 성공 후 원래 페이지로 리다이렉트
      await loginPage.loginAsAdmin();
      await loginPage.expectUrl('/admin/sensitive-data');
    });
  });

  /**
   * 사용자 경험 테스트
   * 로딩 상태, 피드백 등
   */
  test.describe('사용자 경험', () => {
    test('로그인 중 로딩 스피너가 표시되어야 한다', async ({ page }) => {
      // 네트워크 지연 시뮬레이션
      await page.route('**/api/v1/auth/login', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });

      await loginPage.enterEmail('worker@e2e.test');
      await loginPage.enterPassword('test123!@#');
      await loginPage.clickLoginButton();

      // 로딩 스피너 확인
      await expect(page.locator(loginPage.selectors.loadingSpinner)).toBeVisible();
    });

    test('Remember Me 체크박스가 동작해야 한다', async ({ page }) => {
      await loginPage.loginWithTestAccount('worker', true);
      await loginPage.expectLoginSuccess();

      // 페이지 새로고침 후에도 로그인 상태 유지 확인
      await page.reload();
      await loginPage.expectUrl('/attendance');
    });

    test('비밀번호 표시/숨김 토글이 동작해야 한다', async ({ page }) => {
      await loginPage.enterPassword('test123!@#');

      // 초기에는 비밀번호가 숨겨져 있어야 함
      const passwordInput = page.locator(loginPage.selectors.passwordInput);
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // 토글 클릭 후 비밀번호가 보여야 함
      await loginPage.togglePasswordVisibility();
      await expect(passwordInput).toHaveAttribute('type', 'text');

      // 다시 토글 클릭 후 숨겨져야 함
      await loginPage.togglePasswordVisibility();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  /**
   * 접근성 테스트
   * 키보드 네비게이션, 스크린 리더 지원
   */
  test.describe('접근성', () => {
    test('키보드만으로 로그인할 수 있어야 한다', async ({ page }) => {
      // Tab 키로 이메일 필드로 이동
      await page.keyboard.press('Tab');
      await page.keyboard.type('worker@e2e.test');

      // Tab 키로 비밀번호 필드로 이동
      await page.keyboard.press('Tab');
      await page.keyboard.type('test123!@#');

      // Enter 키로 로그인
      await page.keyboard.press('Enter');

      await loginPage.expectLoginSuccess();
    });

    test('폼 요소들이 적절한 라벨을 가져야 한다', async ({ page }) => {
      // 이메일 입력 필드 라벨 확인
      const emailLabel = page.locator('label[for="email"], [aria-label*="이메일"]');
      await expect(emailLabel).toBeVisible();

      // 비밀번호 입력 필드 라벨 확인
      const passwordLabel = page.locator('label[for="password"], [aria-label*="비밀번호"]');
      await expect(passwordLabel).toBeVisible();
    });

    test('에러 메시지가 스크린 리더에게 전달되어야 한다', async ({ page }) => {
      await loginPage.login('invalid@email.com', 'wrongpassword');

      // aria-live 속성을 가진 에러 메시지 확인
      const errorMessage = page.locator('[aria-live="polite"], [role="alert"]');
      await expect(errorMessage).toBeVisible();
    });
  });

  /**
   * 모바일 환경 테스트
   * 반응형 디자인, 터치 인터페이스
   */
  test.describe('모바일 환경', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone 8 크기

    test('모바일에서 로그인 폼이 올바르게 표시되어야 한다', async ({ page }) => {
      await loginPage.navigate();

      // 모바일 뷰포트에서 폼 요소들이 적절한 크기로 표시되는지 확인
      const emailInput = page.locator(loginPage.selectors.emailInput);
      const boundingBox = await emailInput.boundingBox();

      expect(boundingBox.height).toBeGreaterThan(40); // 최소 터치 타겟 크기
      expect(boundingBox.width).toBeGreaterThan(200);
    });

    test('모바일에서 키보드 입력이 올바르게 동작해야 한다', async ({ page }) => {
      // 이메일 입력 시 이메일 키보드 표시 확인
      const emailInput = page.locator(loginPage.selectors.emailInput);
      await expect(emailInput).toHaveAttribute('type', 'email');
      await expect(emailInput).toHaveAttribute('inputmode', 'email');
    });
  });

  /**
   * 다국어 지원 테스트 (향후 확장용)
   */
  test.describe('다국어 지원', () => {
    test.skip('영어로 언어 변경 시 인터페이스가 변경되어야 한다', async ({ page }) => {
      // 언어 변경 기능이 구현되면 활성화
      // await page.selectOption('[data-testid="language-selector"]', 'en');
      // await expect(page.locator('text=Login')).toBeVisible();
    });
  });
});