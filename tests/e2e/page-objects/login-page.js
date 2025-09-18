/**
 * T319: 로그인 페이지 Page Object
 * 로그인 페이지의 요소들과 상호작용 메서드 정의
 */

class LoginPage {
  constructor(page) {
    this.page = page;

    // 페이지 요소들
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.loginButton = page.locator('button:has-text("로그인")');
    this.registerLink = page.locator('a:has-text("회원가입")');
    this.errorMessage = page.locator('.MuiAlert-root');
    this.forgotPasswordLink = page.locator('a:has-text("비밀번호 찾기")');

    // 소셜 로그인 버튼들 (향후 구현 예정)
    this.googleLoginButton = page.locator('button:has-text("Google")');
    this.kakaoLoginButton = page.locator('button:has-text("카카오")');
  }

  /**
   * 로그인 페이지로 이동
   */
  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 로그인 수행
   * @param {string} email - 이메일
   * @param {string} password - 비밀번호
   */
  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /**
   * 빠른 로그인 (테스트용)
   * @param {Object} user - 사용자 객체
   */
  async quickLogin(user) {
    await this.login(user.email, user.password);
  }

  /**
   * 에러 메시지 확인
   * @returns {Promise<string>} 에러 메시지 텍스트
   */
  async getErrorMessage() {
    await this.errorMessage.waitFor({ state: 'visible' });
    return await this.errorMessage.textContent();
  }

  /**
   * 페이지 유효성 확인
   */
  async verifyPageLoaded() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  /**
   * 폼 유효성 검사 메시지 확인
   */
  async getValidationError(field) {
    const input = field === 'email' ? this.emailInput : this.passwordInput;
    return await input.evaluate(el => el.validationMessage);
  }

  /**
   * 회원가입 페이지로 이동
   */
  async goToRegister() {
    await this.registerLink.click();
    await this.page.waitForURL('**/register');
  }

  /**
   * 비밀번호 찾기로 이동
   */
  async goToForgotPassword() {
    await this.forgotPasswordLink.click();
    await this.page.waitForURL('**/forgot-password');
  }

  /**
   * 로그인 상태 확인
   */
  async isLoggedIn() {
    // 로그인 후 대시보드로 리다이렉트 확인
    await this.page.waitForURL('**/dashboard', { timeout: 5000 }).catch(() => false);
    return this.page.url().includes('/dashboard');
  }

  /**
   * 로그인 버튼 상태 확인
   */
  async isLoginButtonEnabled() {
    return await this.loginButton.isEnabled();
  }

  /**
   * 입력 필드 초기화
   */
  async clearInputs() {
    await this.emailInput.clear();
    await this.passwordInput.clear();
  }
}

module.exports = LoginPage;