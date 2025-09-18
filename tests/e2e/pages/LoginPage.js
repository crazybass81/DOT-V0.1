/**
 * T128: 페이지 객체 모델 - 로그인 페이지
 * 로그인 페이지의 모든 요소와 동작을 캡슐화
 * 인증 플로우 E2E 테스트의 기반
 */

const BasePage = require('./BasePage');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);

    // 페이지 경로
    this.path = '/login';

    // 로그인 폼 선택자
    this.selectors = {
      // 폼 요소
      emailInput: '[data-testid="email-input"], input[name="email"], #email',
      passwordInput: '[data-testid="password-input"], input[name="password"], #password',
      loginButton: '[data-testid="login-button"], button[type="submit"], .login-button',

      // 링크
      forgotPasswordLink: '[data-testid="forgot-password-link"], .forgot-password-link',
      registerLink: '[data-testid="register-link"], .register-link',

      // 에러 메시지
      errorMessage: '.error-message, .MuiAlert-standardError, .login-error',
      fieldError: '.field-error, .MuiFormHelperText-root.Mui-error',

      // 로딩 상태
      loadingSpinner: '.loading-spinner, .MuiCircularProgress-root',

      // 성공 상태
      successMessage: '.success-message, .MuiAlert-standardSuccess',

      // 추가 요소
      rememberMeCheckbox: '[data-testid="remember-me"], input[name="rememberMe"]',
      showPasswordButton: '.show-password-button, .password-toggle',

      // 소셜 로그인 (미래 확장용)
      googleLoginButton: '.google-login-button',
      kakaoLoginButton: '.kakao-login-button'
    };

    // 테스트 계정 정보
    this.testAccounts = {
      owner: {
        email: 'owner@e2e.test',
        password: 'test123!@#'
      },
      admin: {
        email: 'admin@e2e.test',
        password: 'test123!@#'
      },
      worker: {
        email: 'worker@e2e.test',
        password: 'test123!@#'
      },
      seeker: {
        email: 'seeker@e2e.test',
        password: 'test123!@#'
      }
    };
  }

  /**
   * 로그인 페이지로 이동
   */
  async navigate() {
    await this.goto(this.path);
    await this.waitForElement(this.selectors.emailInput);
  }

  /**
   * 이메일 입력
   * @param {string} email - 이메일 주소
   */
  async enterEmail(email) {
    await this.safeType(this.selectors.emailInput, email);
  }

  /**
   * 비밀번호 입력
   * @param {string} password - 비밀번호
   */
  async enterPassword(password) {
    await this.safeType(this.selectors.passwordInput, password);
  }

  /**
   * Remember Me 체크박스 설정
   * @param {boolean} checked - 체크 여부
   */
  async setRememberMe(checked = true) {
    if (await this.page.locator(this.selectors.rememberMeCheckbox).count() > 0) {
      await this.setCheckbox(this.selectors.rememberMeCheckbox, checked);
    }
  }

  /**
   * 비밀번호 표시/숨김 토글
   */
  async togglePasswordVisibility() {
    if (await this.page.locator(this.selectors.showPasswordButton).count() > 0) {
      await this.safeClick(this.selectors.showPasswordButton);
    }
  }

  /**
   * 로그인 버튼 클릭
   */
  async clickLoginButton() {
    await this.safeClick(this.selectors.loginButton);
  }

  /**
   * 비밀번호 찾기 링크 클릭
   */
  async clickForgotPassword() {
    await this.safeClick(this.selectors.forgotPasswordLink);
  }

  /**
   * 회원가입 링크 클릭
   */
  async clickRegisterLink() {
    await this.safeClick(this.selectors.registerLink);
  }

  /**
   * 전체 로그인 프로세스 실행
   * @param {string} email - 이메일
   * @param {string} password - 비밀번호
   * @param {boolean} rememberMe - Remember Me 설정
   */
  async login(email, password, rememberMe = false) {
    await this.enterEmail(email);
    await this.enterPassword(password);

    if (rememberMe) {
      await this.setRememberMe(true);
    }

    await this.clickLoginButton();
    await this.waitForLoading();
  }

  /**
   * 테스트 계정으로 로그인
   * @param {string} accountType - 계정 타입 ('owner', 'admin', 'worker', 'seeker')
   * @param {boolean} rememberMe - Remember Me 설정
   */
  async loginWithTestAccount(accountType, rememberMe = false) {
    const account = this.testAccounts[accountType];
    if (!account) {
      throw new Error(`알 수 없는 계정 타입: ${accountType}`);
    }

    await this.login(account.email, account.password, rememberMe);
  }

  /**
   * 빠른 사업주 로그인
   */
  async loginAsOwner() {
    await this.loginWithTestAccount('owner');
  }

  /**
   * 빠른 관리자 로그인
   */
  async loginAsAdmin() {
    await this.loginWithTestAccount('admin');
  }

  /**
   * 빠른 직원 로그인
   */
  async loginAsWorker() {
    await this.loginWithTestAccount('worker');
  }

  /**
   * 빠른 구직자 로그인
   */
  async loginAsSeeker() {
    await this.loginWithTestAccount('seeker');
  }

  /**
   * 로그인 성공 확인
   * 대시보드나 메인 페이지로 리다이렉트되는지 확인
   */
  async expectLoginSuccess() {
    // 로그인 후 리다이렉트 대기 (최대 10초)
    await this.page.waitForURL(url => !url.includes('/login'), { timeout: 10000 });

    // 성공 지표 확인 (대시보드 요소나 사용자 정보)
    const successIndicators = [
      '[data-testid="dashboard"]',
      '.dashboard',
      '[data-testid="user-menu"]',
      '.user-menu',
      '.header-user-info'
    ];

    let found = false;
    for (const selector of successIndicators) {
      try {
        await this.page.waitForSelector(selector, { timeout: 5000 });
        found = true;
        break;
      } catch {
        continue;
      }
    }

    if (!found) {
      throw new Error('로그인 성공 지표를 찾을 수 없습니다');
    }
  }

  /**
   * 로그인 실패 확인
   * @param {string} expectedErrorMessage - 예상 에러 메시지 (선택적)
   */
  async expectLoginFailure(expectedErrorMessage = null) {
    // 에러 메시지 표시 대기
    await this.waitForElement(this.selectors.errorMessage);

    if (expectedErrorMessage) {
      const errorElement = await this.page.locator(this.selectors.errorMessage);
      const actualMessage = await errorElement.textContent();

      if (!actualMessage.includes(expectedErrorMessage)) {
        throw new Error(`에러 메시지 불일치. 예상: "${expectedErrorMessage}", 실제: "${actualMessage}"`);
      }
    }

    // 여전히 로그인 페이지에 있는지 확인
    await this.expectUrl('/login');
  }

  /**
   * 폼 유효성 검사 에러 확인
   * @param {string} fieldName - 필드명 ('email' 또는 'password')
   * @param {string} expectedError - 예상 에러 메시지
   */
  async expectFieldError(fieldName, expectedError) {
    const fieldSelector = this.selectors[`${fieldName}Input`];
    const errorSelector = `${fieldSelector} + ${this.selectors.fieldError}, ${fieldSelector} ~ ${this.selectors.fieldError}`;

    await this.waitForElement(errorSelector);

    const errorElement = await this.page.locator(errorSelector);
    const actualError = await errorElement.textContent();

    if (!actualError.includes(expectedError)) {
      throw new Error(`필드 에러 불일치. 필드: ${fieldName}, 예상: "${expectedError}", 실제: "${actualError}"`);
    }
  }

  /**
   * 로그인 폼이 로드되었는지 확인
   */
  async expectLoginFormLoaded() {
    await this.waitForElement(this.selectors.emailInput);
    await this.waitForElement(this.selectors.passwordInput);
    await this.waitForElement(this.selectors.loginButton);

    // 페이지 제목 확인
    await this.expectTitle('로그인');
  }

  /**
   * 로그인 버튼 활성화 상태 확인
   * @param {boolean} shouldBeEnabled - 활성화 여부
   */
  async expectLoginButtonState(shouldBeEnabled) {
    const button = await this.page.locator(this.selectors.loginButton);
    const isEnabled = await button.isEnabled();

    if (isEnabled !== shouldBeEnabled) {
      throw new Error(`로그인 버튼 상태 불일치. 예상: ${shouldBeEnabled ? '활성화' : '비활성화'}, 실제: ${isEnabled ? '활성화' : '비활성화'}`);
    }
  }

  /**
   * 브루트 포스 공격 시뮬레이션
   * Rate limiting 테스트용
   */
  async simulateBruteForceAttack(attempts = 6) {
    const invalidCredentials = {
      email: 'attacker@test.com',
      password: 'wrongpassword'
    };

    for (let i = 0; i < attempts; i++) {
      await this.login(invalidCredentials.email, invalidCredentials.password);

      if (i < attempts - 1) {
        // 마지막 시도가 아니면 페이지 새로고침
        await this.page.reload();
        await this.waitForElement(this.selectors.emailInput);
      }
    }
  }

  /**
   * Rate limit 메시지 확인
   */
  async expectRateLimitMessage() {
    const rateLimitMessages = [
      '너무 많은 로그인 시도',
      'rate limit',
      '잠시 후 다시 시도',
      '15분 후'
    ];

    const errorElement = await this.page.locator(this.selectors.errorMessage);
    const errorText = await errorElement.textContent();

    const hasRateLimitMessage = rateLimitMessages.some(msg =>
      errorText.toLowerCase().includes(msg.toLowerCase())
    );

    if (!hasRateLimitMessage) {
      throw new Error(`Rate limit 메시지를 찾을 수 없습니다. 실제 메시지: "${errorText}"`);
    }
  }
}

module.exports = LoginPage;