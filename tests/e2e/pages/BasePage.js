/**
 * T128: 페이지 객체 모델 (POM) 구조 생성 - 기본 페이지
 * 모든 페이지 객체의 기본 클래스
 * 공통 기능과 유틸리티 메서드 제공
 */

class BasePage {
  /**
   * 기본 페이지 생성자
   * @param {import('@playwright/test').Page} page - Playwright 페이지 객체
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * 페이지 이동
   * @param {string} url - 이동할 URL
   */
  async goto(url) {
    await this.page.goto(url);
    await this.waitForPageLoad();
  }

  /**
   * 페이지 로드 완료 대기
   * 네트워크 요청과 DOM 로드 완료까지 대기
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * 엘리먼트 가시성 대기
   * @param {string} selector - CSS 선택자
   * @param {number} timeout - 타임아웃 (기본값: 10초)
   */
  async waitForElement(selector, timeout = 10000) {
    await this.page.waitForSelector(selector, {
      state: 'visible',
      timeout
    });
  }

  /**
   * 엘리먼트 숨김 대기
   * @param {string} selector - CSS 선택자
   * @param {number} timeout - 타임아웃 (기본값: 10초)
   */
  async waitForElementHidden(selector, timeout = 10000) {
    await this.page.waitForSelector(selector, {
      state: 'hidden',
      timeout
    });
  }

  /**
   * 안전한 클릭 (엘리먼트 대기 후 클릭)
   * @param {string} selector - CSS 선택자
   */
  async safeClick(selector) {
    await this.waitForElement(selector);
    await this.page.click(selector);
  }

  /**
   * 안전한 입력 (엘리먼트 대기 후 입력)
   * @param {string} selector - CSS 선택자
   * @param {string} text - 입력할 텍스트
   * @param {boolean} clear - 기존 내용 지우기 (기본값: true)
   */
  async safeType(selector, text, clear = true) {
    await this.waitForElement(selector);
    if (clear) {
      await this.page.fill(selector, '');
    }
    await this.page.type(selector, text);
  }

  /**
   * 드롭다운 선택
   * @param {string} selector - select 엘리먼트 선택자
   * @param {string} value - 선택할 값
   */
  async selectOption(selector, value) {
    await this.waitForElement(selector);
    await this.page.selectOption(selector, value);
  }

  /**
   * 체크박스 상태 설정
   * @param {string} selector - 체크박스 선택자
   * @param {boolean} checked - 체크 상태
   */
  async setCheckbox(selector, checked) {
    await this.waitForElement(selector);
    await this.page.setChecked(selector, checked);
  }

  /**
   * 텍스트 존재 확인
   * @param {string} text - 찾을 텍스트
   * @param {boolean} exact - 정확한 매칭 여부 (기본값: false)
   */
  async hasText(text, exact = false) {
    try {
      await this.page.waitForSelector(`text=${exact ? '=' : ''}${text}`, {
        timeout: 5000
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 알림 메시지 확인 (토스트, 스낵바)
   * @param {string} expectedMessage - 예상 메시지
   * @param {string} type - 알림 타입 ('success', 'error', 'warning', 'info')
   */
  async checkNotification(expectedMessage, type = 'success') {
    const selectors = {
      success: '.MuiAlert-standardSuccess, .notistack-SnackbarContainer .SnackbarContent-success',
      error: '.MuiAlert-standardError, .notistack-SnackbarContainer .SnackbarContent-error',
      warning: '.MuiAlert-standardWarning, .notistack-SnackbarContainer .SnackbarContent-warning',
      info: '.MuiAlert-standardInfo, .notistack-SnackbarContainer .SnackbarContent-info'
    };

    const selector = selectors[type] || selectors.success;
    await this.waitForElement(selector);

    const notification = await this.page.locator(selector);
    await notification.waitFor({ state: 'visible' });

    const text = await notification.textContent();
    if (!text.includes(expectedMessage)) {
      throw new Error(`알림 메시지 불일치. 예상: "${expectedMessage}", 실제: "${text}"`);
    }
  }

  /**
   * 로딩 상태 대기
   * @param {string} selector - 로딩 인디케이터 선택자 (기본값: 공통 로딩)
   */
  async waitForLoading(selector = '.MuiCircularProgress-root, .loading-spinner') {
    try {
      // 로딩이 나타날 때까지 짧게 대기
      await this.page.waitForSelector(selector, { timeout: 2000 });
      // 로딩이 사라질 때까지 대기
      await this.page.waitForSelector(selector, { state: 'hidden', timeout: 30000 });
    } catch {
      // 로딩이 나타나지 않으면 무시 (즉시 완료된 경우)
    }
  }

  /**
   * 모달 다이얼로그 대기
   * @param {boolean} visible - 나타남/사라짐 여부 (기본값: true)
   */
  async waitForModal(visible = true) {
    const selector = '.MuiDialog-root, .modal, [role="dialog"]';
    const state = visible ? 'visible' : 'hidden';
    await this.page.waitForSelector(selector, { state, timeout: 10000 });
  }

  /**
   * 파일 다운로드 처리
   * @param {string} triggerSelector - 다운로드를 트리거하는 엘리먼트
   * @param {string} expectedFilename - 예상 파일명 (선택적)
   */
  async handleDownload(triggerSelector, expectedFilename = null) {
    const downloadPromise = this.page.waitForEvent('download');
    await this.safeClick(triggerSelector);
    const download = await downloadPromise;

    if (expectedFilename) {
      const actualFilename = download.suggestedFilename();
      if (!actualFilename.includes(expectedFilename)) {
        throw new Error(`파일명 불일치. 예상: "${expectedFilename}", 실제: "${actualFilename}"`);
      }
    }

    return download;
  }

  /**
   * GPS 권한 허용 시뮬레이션
   */
  async allowGeolocation() {
    await this.page.context().grantPermissions(['geolocation']);

    // 테스트용 GPS 좌표 설정 (강남역 근처)
    await this.page.context().setGeolocation({
      latitude: 37.4979,
      longitude: 127.0276
    });
  }

  /**
   * 카메라 권한 허용 시뮬레이션
   */
  async allowCamera() {
    await this.page.context().grantPermissions(['camera']);
  }

  /**
   * 브라우저 알림 권한 허용
   */
  async allowNotifications() {
    await this.page.context().grantPermissions(['notifications']);
  }

  /**
   * 페이지 스크린샷 촬영
   * @param {string} name - 스크린샷 파일명
   * @param {Object} options - 스크린샷 옵션
   */
  async takeScreenshot(name, options = {}) {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
      ...options
    });
  }

  /**
   * 현재 URL 확인
   * @param {string} expectedPath - 예상 경로
   */
  async expectUrl(expectedPath) {
    const currentUrl = this.page.url();
    if (!currentUrl.includes(expectedPath)) {
      throw new Error(`URL 불일치. 예상 경로: "${expectedPath}", 현재 URL: "${currentUrl}"`);
    }
  }

  /**
   * 페이지 제목 확인
   * @param {string} expectedTitle - 예상 제목
   */
  async expectTitle(expectedTitle) {
    const title = await this.page.title();
    if (!title.includes(expectedTitle)) {
      throw new Error(`제목 불일치. 예상: "${expectedTitle}", 실제: "${title}"`);
    }
  }

  /**
   * 엘리먼트 텍스트 확인
   * @param {string} selector - 엘리먼트 선택자
   * @param {string} expectedText - 예상 텍스트
   */
  async expectElementText(selector, expectedText) {
    await this.waitForElement(selector);
    const element = await this.page.locator(selector);
    const text = await element.textContent();
    if (!text.includes(expectedText)) {
      throw new Error(`텍스트 불일치. 선택자: "${selector}", 예상: "${expectedText}", 실제: "${text}"`);
    }
  }

  /**
   * 디버그 정보 출력
   * @param {string} message - 디버그 메시지
   */
  async debug(message) {
    console.log(`🐛 [DEBUG] ${message} - URL: ${this.page.url()}`);
  }
}

module.exports = BasePage;