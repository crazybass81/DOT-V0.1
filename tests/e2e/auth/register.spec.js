/**
 * T133: 회원가입 플로우 E2E 테스트 작성
 * 신규 사용자 등록 및 계정 생성 검증
 * 다양한 사용자 타입별 회원가입 시나리오
 */

const { test, expect } = require('@playwright/test');
const { DatabaseHelper, utils } = require('../helpers/test-helpers');

/**
 * 회원가입 플로우 E2E 테스트 스위트
 * 한글 주석: 신규 사용자 등록 프로세스 검증
 */
test.describe('회원가입 플로우 E2E 테스트', () => {
  let dbHelper;
  let testData;

  // 테스트 데이터 생성
  test.beforeEach(async ({ page }) => {
    dbHelper = new DatabaseHelper();
    await dbHelper.cleanupTestData();

    // 고유한 테스트 데이터 생성
    const suffix = utils.generateTestId();
    testData = {
      name: `테스트사용자${suffix}`,
      email: `test${suffix}@e2e.test`,
      phone: `010-${String(suffix).slice(-4)}-${String(suffix).slice(-4)}`,
      password: 'test123!@#',
      confirmPassword: 'test123!@#'
    };

    // 회원가입 페이지로 이동
    await page.goto('/register');
  });

  test.afterEach(async () => {
    await dbHelper.close();
  });

  /**
   * 회원가입 폼 렌더링 테스트
   * 필수 요소들이 올바르게 표시되는지 확인
   */
  test.describe('회원가입 폼 렌더링', () => {
    test('회원가입 폼이 올바르게 렌더링되어야 한다', async ({ page }) => {
      // 페이지 제목 확인
      await expect(page).toHaveTitle(/회원가입/);

      // 필수 입력 필드 존재 확인
      await expect(page.locator('[data-testid="name-input"], input[name="name"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-input"], input[name="email"]')).toBeVisible();
      await expect(page.locator('[data-testid="phone-input"], input[name="phone"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-input"], input[name="password"]')).toBeVisible();
      await expect(page.locator('[data-testid="confirm-password-input"], input[name="confirmPassword"]')).toBeVisible();

      // 약관 동의 체크박스
      await expect(page.locator('[data-testid="terms-checkbox"], input[name="agreeTerms"]')).toBeVisible();
      await expect(page.locator('[data-testid="privacy-checkbox"], input[name="agreePrivacy"]')).toBeVisible();

      // 회원가입 버튼
      await expect(page.locator('[data-testid="register-button"], button[type="submit"]')).toBeVisible();

      // 로그인 링크
      await expect(page.locator('[data-testid="login-link"], .login-link')).toBeVisible();
    });

    test('사용자 타입 선택 옵션이 표시되어야 한다', async ({ page }) => {
      // 사용자 타입 라디오 버튼 또는 드롭다운
      await expect(page.locator('[data-testid="user-type-owner"], input[value="owner"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-type-worker"], input[value="worker"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-type-seeker"], input[value="seeker"]')).toBeVisible();
    });

    test('비밀번호 강도 인디케이터가 표시되어야 한다', async ({ page }) => {
      // 비밀번호 입력 시 강도 표시
      await page.fill('[data-testid="password-input"]', 'weak');
      await expect(page.locator('[data-testid="password-strength"], .password-strength')).toBeVisible();

      // 강한 비밀번호 입력
      await page.fill('[data-testid="password-input"]', 'StrongP@ssw0rd123!');
      await expect(page.locator('.password-strength-strong, .strength-high')).toBeVisible();
    });
  });

  /**
   * 성공적인 회원가입 테스트
   * 각 사용자 타입별 회원가입 시나리오
   */
  test.describe('회원가입 성공 시나리오', () => {
    test('구직자로 회원가입할 수 있어야 한다', async ({ page }) => {
      // 구직자 타입 선택
      await page.check('[data-testid="user-type-seeker"]');

      // 폼 입력
      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      // 약관 동의
      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');

      // 회원가입 버튼 클릭
      await page.click('[data-testid="register-button"]');

      // 성공 메시지 확인
      await expect(page.locator('.success-message, .MuiAlert-standardSuccess')).toBeVisible();

      // 이메일 인증 페이지로 리다이렉트 확인
      await expect(page).toHaveURL(/.*\/verify-email/);

      // 데이터베이스에 사용자 생성 확인
      const user = await dbHelper.pool.query(
        'SELECT * FROM users WHERE email = $1',
        [testData.email]
      );
      expect(user.rows).toHaveLength(1);
      expect(user.rows[0].status).toBe('pending_verification');
    });

    test('직원으로 회원가입할 수 있어야 한다', async ({ page }) => {
      await page.check('[data-testid="user-type-worker"]');

      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');

      await page.click('[data-testid="register-button"]');

      // 직원은 바로 구직 대시보드로 이동
      await expect(page).toHaveURL(/.*\/jobs/);

      // 사용자 생성 확인
      const user = await dbHelper.pool.query(
        'SELECT * FROM users WHERE email = $1',
        [testData.email]
      );
      expect(user.rows[0].status).toBe('active');
    });

    test('사업주로 회원가입할 수 있어야 한다', async ({ page }) => {
      await page.check('[data-testid="user-type-owner"]');

      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      // 사업자 등록번호 입력 (사업주인 경우)
      await page.fill('[data-testid="business-number-input"]', '123-45-67890');

      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');

      await page.click('[data-testid="register-button"]');

      // 사업장 등록 페이지로 리다이렉트
      await expect(page).toHaveURL(/.*\/business\/register/);

      // 사용자 생성 확인
      const user = await dbHelper.pool.query(
        'SELECT * FROM users WHERE email = $1',
        [testData.email]
      );
      expect(user.rows[0].status).toBe('active');
    });
  });

  /**
   * 폼 유효성 검사 테스트
   * 클라이언트 측 검증 동작 확인
   */
  test.describe('폼 유효성 검사', () => {
    test('필수 필드 누락 시 에러 메시지가 표시되어야 한다', async ({ page }) => {
      // 이름 없이 회원가입 시도
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.field-error, .MuiFormHelperText-root.Mui-error')).toContainText('이름을 입력해주세요');
    });

    test('이메일 형식 검증이 동작해야 한다', async ({ page }) => {
      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.field-error')).toContainText('올바른 이메일 형식을 입력해주세요');
    });

    test('전화번호 형식 검증이 동작해야 한다', async ({ page }) => {
      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', '123-456');
      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.field-error')).toContainText('올바른 전화번호 형식을 입력해주세요');
    });

    test('비밀번호 강도 검증이 동작해야 한다', async ({ page }) => {
      await page.fill('[data-testid="password-input"]', '123');
      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.field-error')).toContainText('비밀번호는 최소 8자 이상이어야 합니다');
    });

    test('비밀번호 확인 일치 검증이 동작해야 한다', async ({ page }) => {
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', 'different-password');
      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.field-error')).toContainText('비밀번호가 일치하지 않습니다');
    });

    test('약관 동의 검증이 동작해야 한다', async ({ page }) => {
      // 모든 필드 채우기
      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      // 약관 동의 없이 회원가입 시도
      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.field-error, .terms-error')).toContainText('이용약관에 동의해주세요');
    });
  });

  /**
   * 중복 검사 테스트
   * 이메일, 전화번호 중복 확인
   */
  test.describe('중복 검사', () => {
    test('중복된 이메일로 회원가입 시 에러 메시지가 표시되어야 한다', async ({ page }) => {
      // 기존 사용자 생성
      await dbHelper.createTestUser({
        id: 9999,
        name: '기존사용자',
        email: testData.email,
        phone: '010-9999-9999',
        status: 'active'
      });

      // 같은 이메일로 회원가입 시도
      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');

      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.error-message, .MuiAlert-standardError')).toContainText('이미 등록된 이메일입니다');
    });

    test('실시간 이메일 중복 검사가 동작해야 한다', async ({ page }) => {
      // 기존 사용자 생성
      await dbHelper.createTestUser({
        id: 9999,
        name: '기존사용자',
        email: 'existing@test.com',
        phone: '010-9999-9999',
        status: 'active'
      });

      // 이메일 입력 시 실시간 검사
      await page.fill('[data-testid="email-input"]', 'existing@test.com');
      await page.blur('[data-testid="email-input"]'); // 포커스 이동

      // 실시간 에러 메시지 확인
      await expect(page.locator('.email-duplicate-error')).toContainText('이미 사용 중인 이메일입니다');
    });

    test('중복된 전화번호로 회원가입 시 에러 메시지가 표시되어야 한다', async ({ page }) => {
      await dbHelper.createTestUser({
        id: 9999,
        name: '기존사용자',
        email: 'existing@test.com',
        phone: testData.phone,
        status: 'active'
      });

      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');

      await page.click('[data-testid="register-button"]');

      await expect(page.locator('.error-message')).toContainText('이미 등록된 전화번호입니다');
    });
  });

  /**
   * 이메일 인증 테스트
   * 이메일 발송 및 인증 링크 처리
   */
  test.describe('이메일 인증', () => {
    test('회원가입 후 인증 이메일이 발송되어야 한다', async ({ page }) => {
      await page.check('[data-testid="user-type-seeker"]');
      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');

      await page.click('[data-testid="register-button"]');

      // 이메일 인증 안내 페이지 확인
      await expect(page).toHaveURL(/.*\/verify-email/);
      await expect(page.locator('.verification-message')).toContainText('인증 이메일을 발송했습니다');
      await expect(page.locator('.verification-email')).toContainText(testData.email);
    });

    test('이메일 재발송 기능이 동작해야 한다', async ({ page }) => {
      // 회원가입 후 인증 페이지에서
      await page.goto('/verify-email?email=' + encodeURIComponent(testData.email));

      // 재발송 버튼 클릭
      await page.click('[data-testid="resend-email-button"]');

      await expect(page.locator('.success-message')).toContainText('인증 이메일을 다시 발송했습니다');

      // 재발송 버튼 비활성화 (1분 쿨다운)
      await expect(page.locator('[data-testid="resend-email-button"]')).toBeDisabled();
    });

    test('이메일 인증 링크 클릭 시 계정이 활성화되어야 한다', async ({ page }) => {
      // 테스트용 인증 토큰 생성
      const verificationToken = 'test-verification-token';

      // 사용자를 미인증 상태로 생성
      await dbHelper.createTestUser({
        ...testData,
        id: 9999,
        status: 'pending_verification'
      });

      // 인증 링크 클릭 시뮬레이션
      await page.goto(`/verify-email/confirm?token=${verificationToken}`);

      // 인증 성공 메시지 확인
      await expect(page.locator('.success-message')).toContainText('이메일 인증이 완료되었습니다');

      // 로그인 페이지로 리다이렉트
      await expect(page).toHaveURL(/.*\/login/);

      // 데이터베이스에서 계정 활성화 확인
      const user = await dbHelper.pool.query(
        'SELECT status FROM users WHERE email = $1',
        [testData.email]
      );
      expect(user.rows[0].status).toBe('active');
    });
  });

  /**
   * 사용자 경험 테스트
   * 로딩 상태, 진행률 표시 등
   */
  test.describe('사용자 경험', () => {
    test('회원가입 중 로딩 상태가 표시되어야 한다', async ({ page }) => {
      // 네트워크 지연 시뮬레이션
      await page.route('**/api/v1/auth/register', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });

      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);
      await page.fill('[data-testid="phone-input"]', testData.phone);
      await page.fill('[data-testid="password-input"]', testData.password);
      await page.fill('[data-testid="confirm-password-input"]', testData.confirmPassword);

      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');

      await page.click('[data-testid="register-button"]');

      // 로딩 스피너 확인
      await expect(page.locator('.loading-spinner, .MuiCircularProgress-root')).toBeVisible();
      await expect(page.locator('[data-testid="register-button"]')).toBeDisabled();
    });

    test('단계별 진행률이 표시되어야 한다', async ({ page }) => {
      // 다단계 회원가입인 경우
      await expect(page.locator('.progress-bar, .stepper')).toBeVisible();
      await expect(page.locator('.step-indicator')).toContainText('1/3');
    });

    test('폼 자동 저장 기능이 동작해야 한다', async ({ page }) => {
      // 정보 입력
      await page.fill('[data-testid="name-input"]', testData.name);
      await page.fill('[data-testid="email-input"]', testData.email);

      // 페이지 새로고침
      await page.reload();

      // 입력값 복원 확인
      await expect(page.locator('[data-testid="name-input"]')).toHaveValue(testData.name);
      await expect(page.locator('[data-testid="email-input"]')).toHaveValue(testData.email);
    });
  });

  /**
   * 접근성 테스트
   * 키보드 네비게이션, 스크린 리더 지원
   */
  test.describe('접근성', () => {
    test('키보드만으로 회원가입할 수 있어야 한다', async ({ page }) => {
      // Tab으로 필드 이동하며 입력
      await page.keyboard.press('Tab'); // 이름 필드로
      await page.keyboard.type(testData.name);

      await page.keyboard.press('Tab'); // 이메일 필드로
      await page.keyboard.type(testData.email);

      await page.keyboard.press('Tab'); // 전화번호 필드로
      await page.keyboard.type(testData.phone);

      await page.keyboard.press('Tab'); // 비밀번호 필드로
      await page.keyboard.type(testData.password);

      await page.keyboard.press('Tab'); // 비밀번호 확인 필드로
      await page.keyboard.type(testData.confirmPassword);

      await page.keyboard.press('Tab'); // 약관 체크박스로
      await page.keyboard.press('Space'); // 체크

      await page.keyboard.press('Tab'); // 개인정보 체크박스로
      await page.keyboard.press('Space'); // 체크

      await page.keyboard.press('Tab'); // 회원가입 버튼으로
      await page.keyboard.press('Enter'); // 제출

      await expect(page).toHaveURL(/.*\/verify-email/);
    });

    test('폼 라벨과 에러 메시지가 접근 가능해야 한다', async ({ page }) => {
      // 라벨 확인
      await expect(page.locator('label[for="name"], [aria-label*="이름"]')).toBeVisible();
      await expect(page.locator('label[for="email"], [aria-label*="이메일"]')).toBeVisible();

      // 에러 메시지 접근성 확인
      await page.click('[data-testid="register-button"]'); // 빈 폼 제출

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

    test('모바일에서 회원가입 폼이 올바르게 표시되어야 한다', async ({ page }) => {
      // 모바일 뷰포트에서 폼 요소들이 적절한 크기로 표시되는지 확인
      const nameInput = page.locator('[data-testid="name-input"]');
      const boundingBox = await nameInput.boundingBox();

      expect(boundingBox.height).toBeGreaterThan(40); // 최소 터치 타겟 크기
    });

    test('모바일에서 적절한 키보드가 표시되어야 한다', async ({ page }) => {
      // 이메일 입력 시 이메일 키보드
      const emailInput = page.locator('[data-testid="email-input"]');
      await expect(emailInput).toHaveAttribute('type', 'email');

      // 전화번호 입력 시 숫자 키보드
      const phoneInput = page.locator('[data-testid="phone-input"]');
      await expect(phoneInput).toHaveAttribute('type', 'tel');
    });
  });
});