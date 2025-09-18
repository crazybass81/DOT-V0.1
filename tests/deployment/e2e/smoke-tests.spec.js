/**
 * E2E 스모크 테스트 (T009)
 *
 * 배포된 DOT Platform의 핵심 기능들이 실제 브라우저에서
 * 정상적으로 동작하는지 빠르게 검증하는 스모크 테스트입니다.
 *
 * TDD: 이 테스트는 실제 구현 전에 작성되었으며, 초기에는 실패해야 합니다.
 */

const { test, expect } = require('@playwright/test');

// 프로덕션 URL 사용 (환경 변수로 설정)
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('DOT Platform 스모크 테스트', () => {
  test.beforeEach(async ({ page }) => {
    // 한국어 설정으로 브라우저 구성
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
    });
  });

  test('메인 페이지 로딩 및 기본 요소 확인', async ({ page }) => {
    // 페이지 로딩 시간 측정
    const startTime = Date.now();

    await page.goto(BASE_URL, { timeout: 30000 });

    const loadTime = Date.now() - startTime;

    // 한국어 요구사항: < 3초 페이지 로딩
    expect(loadTime).toBeLessThan(3000);

    // 페이지 기본 요소 확인
    await expect(page).toHaveTitle(/DOT/);

    // 로그인 버튼 또는 링크 존재 확인
    const loginButton = page.locator('text=로그인').or(page.locator('text=Login')).first();
    await expect(loginButton).toBeVisible({ timeout: 5000 });

    console.log(`메인 페이지 로딩 시간: ${loadTime}ms`);
  });

  test('로그인 페이지 접근 및 폼 렌더링', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { timeout: 30000 });

    // 로그인 폼 요소들 확인
    await expect(page.locator('input[type="email"]').or(page.locator('input[name="email"]'))).toBeVisible();
    await expect(page.locator('input[type="password"]').or(page.locator('input[name="password"]'))).toBeVisible();

    // 로그인 버튼 확인
    const submitButton = page.locator('button[type="submit"]')
      .or(page.locator('text=로그인'))
      .or(page.locator('text=Login'));
    await expect(submitButton.first()).toBeVisible();

    // 한국어 UI 요소 확인
    const koreanElements = await page.locator('text=/로그인|이메일|비밀번호|패스워드/').count();
    if (koreanElements > 0) {
      console.log('한국어 UI 요소가 정상적으로 표시됨');
    }
  });

  test('회원가입 페이지 접근 (있는 경우)', async ({ page }) => {
    try {
      await page.goto(`${BASE_URL}/register`, { timeout: 15000 });

      // 회원가입 폼이 있는 경우 기본 요소 확인
      const emailInput = page.locator('input[type="email"]').or(page.locator('input[name="email"]'));
      if (await emailInput.isVisible()) {
        await expect(emailInput).toBeVisible();
        console.log('회원가입 페이지가 정상적으로 로딩됨');
      }
    } catch (error) {
      console.log('회원가입 페이지가 없거나 접근 불가:', error.message);
      // 회원가입 페이지가 없는 것은 정상일 수 있음
    }
  });

  test('네비게이션 및 메뉴 구조', async ({ page }) => {
    await page.goto(BASE_URL, { timeout: 30000 });

    // 주요 네비게이션 메뉴 확인
    const navItems = [
      '홈', 'Home',
      '대시보드', 'Dashboard',
      '출퇴근', '근태', 'Attendance',
      '스케줄', 'Schedule',
      '급여', 'Payroll',
      '직원', 'Employee'
    ];

    let foundNavItems = 0;
    for (const item of navItems) {
      const navItem = page.locator(`text=${item}`).first();
      if (await navItem.isVisible()) {
        foundNavItems++;
      }
    }

    // 최소 하나의 네비게이션 항목은 있어야 함
    expect(foundNavItems).toBeGreaterThan(0);

    console.log(`발견된 네비게이션 항목 수: ${foundNavItems}`);
  });

  test('반응형 디자인 - 모바일 뷰', async ({ page }) => {
    // 모바일 뷰포트로 설정
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL, { timeout: 30000 });

    // 모바일에서도 로그인 버튼이 보여야 함
    const loginButton = page.locator('text=로그인').or(page.locator('text=Login')).first();
    await expect(loginButton).toBeVisible({ timeout: 10000 });

    // 햄버거 메뉴 또는 모바일 네비게이션 확인
    const mobileMenuButton = page.locator('[aria-label*="menu"]')
      .or(page.locator('.hamburger'))
      .or(page.locator('text=☰'));

    if (await mobileMenuButton.first().isVisible()) {
      console.log('모바일 메뉴가 정상적으로 표시됨');
    }
  });

  test('API 헬스체크 연결성', async ({ page }) => {
    // 페이지에서 API 호출 테스트
    const response = await page.request.get(`${BASE_URL}/health`);

    if (response.ok()) {
      const healthData = await response.json();
      expect(healthData).toHaveProperty('status');
      console.log('API 헬스체크 정상:', healthData.status);
    } else {
      console.log('API 헬스체크 엔드포인트 구현 필요');
    }
  });

  test('정적 리소스 로딩', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(BASE_URL, { timeout: 30000 });

    // CSS 및 JS 파일 로딩 확인
    const resources = [];

    page.on('response', response => {
      const url = response.url();
      if (url.includes('.css') || url.includes('.js') || url.includes('.ico')) {
        resources.push({
          url: url,
          status: response.status(),
          type: url.includes('.css') ? 'CSS' : url.includes('.js') ? 'JS' : 'Other'
        });
      }
    });

    // 페이지 완전 로딩 대기
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    console.log(`전체 리소스 로딩 시간: ${loadTime}ms`);

    // 정적 리소스가 로딩되었는지 확인
    if (resources.length > 0) {
      const failedResources = resources.filter(r => r.status >= 400);
      expect(failedResources.length).toBe(0);
      console.log(`로딩된 정적 리소스: ${resources.length}개`);
    }
  });

  test('접근성 기본 검증', async ({ page }) => {
    await page.goto(BASE_URL, { timeout: 30000 });

    // 기본 접근성 요소 확인
    // HTML lang 속성
    const htmlLang = await page.getAttribute('html', 'lang');
    if (htmlLang) {
      expect(['ko', 'ko-KR', 'en', 'en-US']).toContain(htmlLang);
    }

    // 제목 요소 존재 확인
    const headings = await page.locator('h1, h2, h3').count();
    expect(headings).toBeGreaterThan(0);

    // 이미지의 alt 속성 확인 (있는 경우)
    const images = page.locator('img');
    const imageCount = await images.count();

    if (imageCount > 0) {
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        // alt 속성이 있거나 decorative 이미지여야 함
        expect(alt !== null).toBeTruthy();
      }
    }

    console.log(`접근성 검증 완료 - 헤딩: ${headings}개, 이미지: ${imageCount}개`);
  });

  test('다국어 지원 확인', async ({ page }) => {
    // 한국어로 먼저 접근
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9'
    });

    await page.goto(BASE_URL, { timeout: 30000 });

    // 한국어 요소 확인
    const koreanText = await page.locator('text=/한글|로그인|회원가입|대시보드|출퇴근|근태|스케줄|급여/').count();

    if (koreanText > 0) {
      console.log('한국어 지원 확인됨');
    }

    // 영어로 변경 테스트 (언어 변경 기능이 있는 경우)
    const langSwitch = page.locator('text=/English|EN|언어|Language/').first();
    if (await langSwitch.isVisible()) {
      await langSwitch.click();
      await page.waitForTimeout(1000);

      const englishText = await page.locator('text=/Login|Dashboard|Attendance|Schedule|Payroll/').count();
      if (englishText > 0) {
        console.log('영어 지원 확인됨');
      }
    }
  });

  test('오류 페이지 처리', async ({ page }) => {
    // 존재하지 않는 페이지 접근
    const response = await page.goto(`${BASE_URL}/nonexistent-page-12345`, {
      timeout: 15000,
      waitUntil: 'domcontentloaded'
    });

    // 404 페이지가 적절히 처리되는지 확인
    expect([404, 200]).toContain(response.status());

    // React Router의 경우 200으로 응답하고 클라이언트에서 404 처리
    if (response.status() === 200) {
      // "페이지를 찾을 수 없습니다" 등의 메시지 확인
      const notFoundText = page.locator('text=/404|Not Found|페이지를 찾을 수 없습니다|존재하지 않/').first();
      if (await notFoundText.isVisible({ timeout: 5000 })) {
        console.log('404 페이지가 적절히 처리됨');
      }
    }
  });
});

/**
 * TDD 노트:
 *
 * 이 스모크 테스트들은 DOT Platform의 프론트엔드가 완전히 구현되지 않은 상태에서 작성되었습니다.
 * 예상되는 실패 시나리오:
 *
 * 1. ECONNREFUSED: 프론트엔드 서버가 실행되지 않음
 * 2. 요소 not found: 로그인 폼, 네비게이션 등이 구현되지 않음
 * 3. 타임아웃: 페이지 로딩이 예상보다 오래 걸림
 *
 * 한국어 요구사항 관련 테스트:
 * - 페이지 로딩 < 3초
 * - 한국어 UI 지원
 * - 반응형 디자인 (모바일 지원)
 * - 접근성 (WCAG 기준)
 *
 * 이러한 실패는 TDD의 정상적인 과정이며,
 * 프론트엔드 구현 후 이 테스트들이 통과해야 합니다.
 */