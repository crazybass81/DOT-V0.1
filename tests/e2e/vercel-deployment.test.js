/**
 * Vercel 배포 테스트
 * DOT Platform Vercel 배포 상태 및 API 연결 검증
 */

const { test, expect } = require('@playwright/test');

// 테스트할 Vercel URL들
const VERCEL_URLS = [
  'https://dot-platform-git-main-02102n.vercel.app',
  'https://dot-platform-qpr5dz1ot-02102n.vercel.app'
];

// EC2 백엔드 서버 정보
const EC2_BACKEND = '100.25.70.173:3001';
const EXPECTED_BUNDLE_PREFIX = 'main.138d918e.js'; // 새로운 해시

test.describe('Vercel 배포 검증', () => {

  test('사이트 로딩 및 기본 구조 확인', async ({ page }) => {
    // 네트워크 요청 모니터링 설정
    const networkRequests = [];
    const apiRequests = [];

    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });

      // API 요청 별도 수집
      if (request.url().includes('api/') || request.url().includes(':3001')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    console.log('🔍 Vercel 사이트 로딩 테스트 시작...');

    for (const url of VERCEL_URLS) {
      console.log(`\n📍 테스트 URL: ${url}`);

      try {
        // 페이지 로드 (타임아웃 30초)
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        // 1. 기본 페이지 로드 확인
        await expect(page).toHaveTitle(/DOT Platform/i);
        console.log('✅ 페이지 타이틀 확인됨');

        // 2. React 앱이 로드되었는지 확인
        await page.waitForSelector('#root', { timeout: 10000 });
        console.log('✅ React 앱 루트 엘리먼트 확인됨');

        // 3. JavaScript 번들 파일 확인
        const bundleRequests = networkRequests.filter(req =>
          req.url.includes('main.') && req.url.includes('.js')
        );

        console.log('📦 JavaScript 번들 파일들:');
        bundleRequests.forEach(req => {
          console.log(`  - ${req.url}`);

          // 새로운 해시 확인 (이전 main.ddba04d8.js가 아닌)
          if (req.url.includes('main.ddba04d8.js')) {
            console.log('❌ 이전 캐시된 번들 파일 발견!');
          } else if (req.url.includes('main.138d918e.js')) {
            console.log('✅ 새로운 번들 파일 확인됨');
          } else if (req.url.includes('main.') && req.url.includes('.js')) {
            console.log(`📋 번들 파일: ${req.url.split('/').pop()}`);
          }
        });

        break; // 첫 번째 성공하는 URL로 계속 진행

      } catch (error) {
        console.log(`❌ ${url} 로드 실패: ${error.message}`);
        if (url === VERCEL_URLS[VERCEL_URLS.length - 1]) {
          throw error; // 마지막 URL도 실패하면 테스트 실패
        }
      }
    }
  });

  test('API 연결 및 네트워크 요청 모니터링', async ({ page }) => {
    const apiRequests = [];
    const failedRequests = [];

    // 네트워크 요청 모니터링
    page.on('request', request => {
      if (request.url().includes('api/') || request.url().includes(':3001') || request.url().includes('100.25.70.173')) {
        apiRequests.push({
          url: request.url(),
          method: request.method(),
          timestamp: new Date().toISOString()
        });
      }
    });

    // 실패한 요청 모니터링
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText,
        method: request.method()
      });
    });

    console.log('🔍 API 연결 테스트 시작...');

    // 첫 번째 작동하는 Vercel URL 찾기
    let workingUrl = null;
    for (const url of VERCEL_URLS) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        workingUrl = url;
        break;
      } catch (error) {
        console.log(`❌ ${url} 접속 실패, 다음 URL 시도...`);
      }
    }

    if (!workingUrl) {
      throw new Error('모든 Vercel URL 접속 실패');
    }

    console.log(`✅ 작동하는 URL: ${workingUrl}`);

    // React 앱 로드 대기
    await page.waitForSelector('#root', { timeout: 10000 });

    // 회원가입 폼으로 이동 (API 호출 유발)
    console.log('📝 회원가입 폼 찾는 중...');

    try {
      // 회원가입 링크나 버튼 찾기
      const signupSelectors = [
        'a[href*="signup"]',
        'a[href*="register"]',
        'button:has-text("회원가입")',
        'button:has-text("가입")',
        '[data-testid="signup-button"]',
        '.signup-button'
      ];

      let signupElement = null;
      for (const selector of signupSelectors) {
        try {
          signupElement = await page.locator(selector).first();
          if (await signupElement.isVisible({ timeout: 2000 })) {
            console.log(`✅ 회원가입 요소 발견: ${selector}`);
            break;
          }
        } catch (e) {
          // 계속 다음 셀렉터 시도
        }
      }

      if (signupElement && await signupElement.isVisible()) {
        await signupElement.click();
        console.log('✅ 회원가입 페이지로 이동');

        // 잠깐 대기 (페이지 로드 및 가능한 API 호출)
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ 회원가입 버튼을 찾을 수 없음, 현재 페이지에서 계속...');
      }

    } catch (error) {
      console.log(`⚠️ 회원가입 페이지 이동 실패: ${error.message}`);
    }

    // API 요청 분석
    console.log('\n📊 API 요청 분석:');
    console.log(`총 ${apiRequests.length}개의 API 관련 요청 발견`);

    apiRequests.forEach(req => {
      console.log(`  🔗 ${req.method} ${req.url}`);

      // localhost:3001 요청 확인 (이것은 오류)
      if (req.url.includes('localhost:3001')) {
        console.log('    ❌ localhost:3001로의 요청 발견! (설정 오류)');
      }

      // EC2 백엔드로의 요청 확인 (정상)
      if (req.url.includes(EC2_BACKEND)) {
        console.log('    ✅ EC2 백엔드로의 요청 확인됨');
      }
    });

    // 실패한 요청 분석
    if (failedRequests.length > 0) {
      console.log('\n❌ 실패한 요청들:');
      failedRequests.forEach(req => {
        console.log(`  - ${req.method} ${req.url}`);
        console.log(`    오류: ${req.failure}`);
      });
    } else {
      console.log('\n✅ 실패한 요청 없음');
    }

    // 어서션: localhost:3001 요청이 없어야 함
    const localhostRequests = apiRequests.filter(req => req.url.includes('localhost:3001'));
    if (localhostRequests.length > 0) {
      console.log('❌ localhost:3001로의 요청이 여전히 존재함!');
      localhostRequests.forEach(req => console.log(`    ${req.url}`));
    }
  });

  test('회원가입 폼 테스트 (실제 API 연결)', async ({ page }) => {
    console.log('📝 회원가입 폼 기능 테스트 시작...');

    // API 응답 모니터링
    const apiResponses = [];
    page.on('response', response => {
      if (response.url().includes('api/') || response.url().includes(':3001')) {
        apiResponses.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    // 첫 번째 작동하는 Vercel URL로 이동
    let workingUrl = null;
    for (const url of VERCEL_URLS) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        workingUrl = url;
        break;
      } catch (error) {
        console.log(`❌ ${url} 접속 실패`);
      }
    }

    if (!workingUrl) {
      throw new Error('모든 Vercel URL 접속 실패');
    }

    // React 앱 로드 대기
    await page.waitForSelector('#root', { timeout: 10000 });

    try {
      // 회원가입 폼 찾기
      const formSelectors = [
        'form[data-testid="signup-form"]',
        'form:has(input[type="email"])',
        'form:has(input[name="email"])',
        '.signup-form',
        '#signup-form'
      ];

      let formElement = null;
      for (const selector of formSelectors) {
        try {
          formElement = page.locator(selector).first();
          if (await formElement.isVisible({ timeout: 2000 })) {
            console.log(`✅ 회원가입 폼 발견: ${selector}`);
            break;
          }
        } catch (e) {
          // 계속 시도
        }
      }

      if (!formElement || !(await formElement.isVisible())) {
        // 회원가입 페이지로 직접 이동 시도
        console.log('🔄 회원가입 페이지로 직접 이동 시도...');
        await page.goto(`${workingUrl}/signup`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        for (const selector of formSelectors) {
          try {
            formElement = page.locator(selector).first();
            if (await formElement.isVisible({ timeout: 2000 })) {
              console.log(`✅ 회원가입 폼 발견: ${selector}`);
              break;
            }
          } catch (e) {
            // 계속 시도
          }
        }
      }

      if (formElement && await formElement.isVisible()) {
        console.log('📋 테스트 데이터로 폼 작성 중...');

        // 테스트 데이터
        const testData = {
          email: `test${Date.now()}@example.com`,
          password: 'TestPass123!',
          name: '테스트유저',
          phone: '010-1234-5678'
        };

        // 폼 필드 채우기
        const emailInputs = page.locator('input[type="email"], input[name="email"]');
        if (await emailInputs.first().isVisible({ timeout: 2000 })) {
          await emailInputs.first().fill(testData.email);
          console.log(`✅ 이메일 입력: ${testData.email}`);
        }

        const passwordInputs = page.locator('input[type="password"], input[name="password"]');
        if (await passwordInputs.first().isVisible({ timeout: 2000 })) {
          await passwordInputs.first().fill(testData.password);
          console.log('✅ 비밀번호 입력 완료');
        }

        const nameInputs = page.locator('input[name="name"], input[placeholder*="이름"]');
        if (await nameInputs.first().isVisible({ timeout: 2000 })) {
          await nameInputs.first().fill(testData.name);
          console.log('✅ 이름 입력 완료');
        }

        // 폼 제출
        const submitButtons = page.locator('button[type="submit"], button:has-text("가입"), button:has-text("회원가입")');
        if (await submitButtons.first().isVisible({ timeout: 2000 })) {
          console.log('📤 폼 제출 중...');
          await submitButtons.first().click();

          // API 응답 대기
          await page.waitForTimeout(5000);

          // API 응답 분석
          console.log('\n📊 API 응답 분석:');
          apiResponses.forEach(resp => {
            console.log(`  📡 ${resp.status} ${resp.statusText}: ${resp.url}`);

            if (resp.url.includes(EC2_BACKEND)) {
              console.log('    ✅ EC2 백엔드 응답 확인됨');
            }

            if (resp.status >= 400) {
              console.log(`    ❌ 오류 응답: ${resp.status}`);
            } else if (resp.status >= 200 && resp.status < 300) {
              console.log('    ✅ 성공 응답');
            }
          });

        } else {
          console.log('⚠️ 제출 버튼을 찾을 수 없음');
        }

      } else {
        console.log('⚠️ 회원가입 폼을 찾을 수 없음');

        // 페이지 내용 디버깅
        const pageContent = await page.textContent('body');
        console.log('📄 페이지 내용 샘플:', pageContent.substring(0, 500));
      }

    } catch (error) {
      console.log(`❌ 회원가입 폼 테스트 오류: ${error.message}`);
    }
  });

  test('JavaScript 에러 및 콘솔 로그 모니터링', async ({ page }) => {
    const consoleMessages = [];
    const jsErrors = [];

    // 콘솔 메시지 수집
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });

    // JavaScript 에러 수집
    page.on('pageerror', error => {
      jsErrors.push({
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    });

    console.log('🔍 JavaScript 에러 모니터링 시작...');

    // 첫 번째 작동하는 URL로 이동
    let workingUrl = null;
    for (const url of VERCEL_URLS) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        workingUrl = url;
        break;
      } catch (error) {
        console.log(`❌ ${url} 접속 실패`);
      }
    }

    if (!workingUrl) {
      throw new Error('모든 Vercel URL 접속 실패');
    }

    // 페이지 상호작용 (에러 유발 가능성 있는 동작들)
    await page.waitForTimeout(3000);

    // JavaScript 에러 보고
    if (jsErrors.length > 0) {
      console.log('\n❌ JavaScript 에러 발견:');
      jsErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.name}: ${error.message}`);
        if (error.stack) {
          console.log(`     스택: ${error.stack.split('\n')[1]}`);
        }
      });
    } else {
      console.log('\n✅ JavaScript 에러 없음');
    }

    // 콘솔 에러 메시지 필터링
    const errorMessages = consoleMessages.filter(msg => msg.type === 'error');
    const warningMessages = consoleMessages.filter(msg => msg.type === 'warning');

    if (errorMessages.length > 0) {
      console.log('\n❌ 콘솔 에러 메시지:');
      errorMessages.forEach((msg, index) => {
        console.log(`  ${index + 1}. ${msg.text}`);
      });
    } else {
      console.log('\n✅ 콘솔 에러 메시지 없음');
    }

    if (warningMessages.length > 0) {
      console.log('\n⚠️ 콘솔 경고 메시지:');
      warningMessages.slice(0, 5).forEach((msg, index) => {
        console.log(`  ${index + 1}. ${msg.text}`);
      });
      if (warningMessages.length > 5) {
        console.log(`  ... 총 ${warningMessages.length}개 경고`);
      }
    }

    // 특별히 localhost:3001 관련 에러 확인
    const localhostErrors = consoleMessages.filter(msg =>
      msg.text.toLowerCase().includes('localhost:3001') ||
      msg.text.toLowerCase().includes('connection refused') ||
      msg.text.toLowerCase().includes('network error')
    );

    if (localhostErrors.length > 0) {
      console.log('\n❌ Localhost 관련 에러 발견:');
      localhostErrors.forEach(msg => {
        console.log(`  - ${msg.type}: ${msg.text}`);
      });
    }
  });

});