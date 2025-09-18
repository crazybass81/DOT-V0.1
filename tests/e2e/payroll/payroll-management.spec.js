/**
 * T138: 급여 관리 E2E 테스트 작성
 * 급여 계산, 명세서 생성, 세금 처리, 지급 내역 관리
 * 다양한 급여 형태와 공제 항목 처리 검증
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const { DatabaseHelper, scenarioHelpers, authHelpers } = require('../helpers/test-helpers');

/**
 * 급여 관리 E2E 테스트 스위트
 * 한글 주석: 급여 계산 및 명세서 생성 검증
 */
test.describe('급여 관리 E2E 테스트', () => {
  let loginPage;
  let dbHelper;

  // 각 테스트 전 초기화
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dbHelper = new DatabaseHelper();

    // 테스트 데이터 설정
    await dbHelper.cleanupTestData();
    await scenarioHelpers.setupScenario('owner', dbHelper);

    // 급여 관련 기본 데이터 설정
    await dbHelper.pool.query(`
      INSERT INTO employees (id, user_id, business_id, employee_number, position, salary_type, base_salary, hourly_rate)
      VALUES
      (9001, 9001, 9001, 'EMP001', '매니저', 'monthly', 3000000, NULL),
      (9002, 9002, 9001, 'EMP002', '직원', 'hourly', NULL, 15000)
    `);

    // 출근 기록 데이터
    await dbHelper.pool.query(`
      INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, status)
      VALUES
      (9001, 9001, '2024-01-15', '09:00:00', '18:00:00', '08:00:00', 'checked_out'),
      (9001, 9001, '2024-01-16', '09:00:00', '18:00:00', '08:00:00', 'checked_out'),
      (9002, 9001, '2024-01-15', '10:00:00', '19:00:00', '08:00:00', 'checked_out'),
      (9002, 9001, '2024-01-16', '10:00:00', '15:00:00', '04:00:00', 'checked_out')
    `);

    // 사업주로 로그인
    await loginPage.navigate();
    await loginPage.loginAsOwner();
    await page.goto('/payroll');
  });

  test.afterEach(async () => {
    await dbHelper.close();
  });

  /**
   * 급여 계산 기능 테스트
   * 시간당/월급 계산 로직 검증
   */
  test.describe('급여 계산', () => {
    test('월급 직원의 급여가 올바르게 계산되어야 한다', async ({ page }) => {
      // 급여 계산 시작
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      // 계산 완료 대기
      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 월급 직원 급여 확인
      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');
      await expect(monthlyEmployee.locator('.base-salary')).toContainText('3,000,000원');
      await expect(monthlyEmployee.locator('.total-pay')).toContainText('3,000,000원');
    });

    test('시간급 직원의 급여가 올바르게 계산되어야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 시간급 직원 급여 확인 (12시간 × 15,000원 = 180,000원)
      const hourlyEmployee = page.locator('[data-testid="employee-9002"]');
      await expect(hourlyEmployee.locator('.work-hours')).toContainText('12시간');
      await expect(hourlyEmployee.locator('.hourly-rate')).toContainText('15,000원');
      await expect(hourlyEmployee.locator('.total-pay')).toContainText('180,000원');
    });

    test('야간 근무 수당이 정확히 적용되어야 한다', async ({ page }) => {
      // 야간 근무 데이터 추가
      await dbHelper.pool.query(`
        INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, overtime_hours, night_hours, status)
        VALUES (9002, 9001, '2024-01-17', '22:00:00', '06:00:00', '08:00:00', '00:00:00', '08:00:00', 'checked_out')
      `);

      await page.reload();
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 야간 수당 확인 (시급의 50% 가산)
      const hourlyEmployee = page.locator('[data-testid="employee-9002"]');
      await expect(hourlyEmployee.locator('.night-allowance')).toContainText('60,000원'); // 8시간 × 15,000 × 0.5
      await expect(hourlyEmployee.locator('.total-pay')).toContainText('300,000원'); // 기본 + 야간수당
    });

    test('연장 근무 수당이 정확히 계산되어야 한다', async ({ page }) => {
      // 연장 근무 데이터 추가
      await dbHelper.pool.query(`
        INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, overtime_hours, status)
        VALUES (9002, 9001, '2024-01-18', '09:00:00', '20:00:00', '10:00:00', '02:00:00', 'checked_out')
      `);

      await page.reload();
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 연장 근무 수당 확인 (시급의 50% 가산)
      const hourlyEmployee = page.locator('[data-testid="employee-9002"]');
      await expect(hourlyEmployee.locator('.overtime-allowance')).toContainText('15,000원'); // 2시간 × 15,000 × 0.5
    });

    test('휴일 근무 수당이 올바르게 적용되어야 한다', async ({ page }) => {
      // 휴일 근무 데이터 추가 (일요일)
      await dbHelper.pool.query(`
        INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, holiday_hours, status)
        VALUES (9002, 9001, '2024-01-14', '09:00:00', '17:00:00', '08:00:00', '08:00:00', 'checked_out')
      `);

      await page.reload();
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 휴일 수당 확인 (시급의 100% 가산)
      const hourlyEmployee = page.locator('[data-testid="employee-9002"]');
      await expect(hourlyEmployee.locator('.holiday-allowance')).toContainText('120,000원'); // 8시간 × 15,000 × 1.0
    });
  });

  /**
   * 공제 항목 처리 테스트
   * 세금, 보험료, 기타 공제 계산
   */
  test.describe('공제 항목 처리', () => {
    test('소득세가 올바르게 계산되어야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 월급 직원 소득세 확인 (3,000,000원 기준)
      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');
      await expect(monthlyEmployee.locator('.income-tax')).toContainText('180,000원'); // 6% 가정
      await expect(monthlyEmployee.locator('.local-tax')).toContainText('18,000원'); // 소득세의 10%
    });

    test('4대 보험이 정확히 공제되어야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');

      // 국민연금 (4.5%)
      await expect(monthlyEmployee.locator('.national-pension')).toContainText('135,000원');

      // 건강보험 (3.545%)
      await expect(monthlyEmployee.locator('.health-insurance')).toContainText('106,350원');

      // 장기요양보험 (건강보험의 12.81%)
      await expect(monthlyEmployee.locator('.care-insurance')).toContainText('13,623원');

      // 고용보험 (0.9%)
      await expect(monthlyEmployee.locator('.employment-insurance')).toContainText('27,000원');
    });

    test('사용자 정의 공제 항목을 추가할 수 있어야 한다', async ({ page }) => {
      // 공제 항목 추가
      await page.click('[data-testid="add-deduction"]');
      await page.fill('[data-testid="deduction-name"]', '식대');
      await page.selectOption('[data-testid="deduction-type"]', 'fixed');
      await page.fill('[data-testid="deduction-amount"]', '100000');
      await page.click('[data-testid="save-deduction"]');

      // 급여 계산
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 사용자 정의 공제 확인
      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');
      await expect(monthlyEmployee.locator('.custom-deduction-식대')).toContainText('100,000원');
    });

    test('차등 세율이 올바르게 적용되어야 한다', async ({ page }) => {
      // 고액 급여 직원 추가
      await dbHelper.pool.query(`
        INSERT INTO employees (id, user_id, business_id, employee_number, position, salary_type, base_salary)
        VALUES (9003, 9003, 9001, 'EMP003', '임원', 'monthly', 10000000)
      `);

      await dbHelper.createTestUser({
        id: 9003,
        name: 'E2E 임원',
        email: 'executive@e2e.test',
        phone: '010-3333-3333',
        status: 'active'
      });

      await page.reload();
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 고액 급여자 세율 확인 (누진세율 적용)
      const executiveEmployee = page.locator('[data-testid="employee-9003"]');
      await expect(executiveEmployee.locator('.income-tax')).toContainText('950,000원'); // 높은 세율 적용
    });
  });

  /**
   * 급여 명세서 생성 테스트
   * PDF 생성 및 이메일 발송
   */
  test.describe('급여 명세서 생성', () => {
    test('급여 명세서 PDF를 생성할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // PDF 생성
      await page.click('[data-testid="generate-paystubs"]');

      // PDF 생성 대기
      await expect(page.locator('.pdf-generation-complete')).toBeVisible({ timeout: 15000 });

      // 다운로드 링크 확인
      await expect(page.locator('[data-testid="download-paystubs"]')).toBeVisible();
      await expect(page.locator('text=급여명세서_2024년1월.pdf')).toBeVisible();
    });

    test('개별 직원 명세서를 생성할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 개별 명세서 생성
      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');
      await monthlyEmployee.click('[data-testid="generate-individual-paystub"]');

      // 개별 PDF 생성 확인
      await expect(page.locator('.individual-pdf-ready')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=EMP001_급여명세서_2024년1월.pdf')).toBeVisible();
    });

    test('급여 명세서에 모든 항목이 포함되어야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 명세서 미리보기
      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');
      await monthlyEmployee.click('[data-testid="preview-paystub"]');

      // 미리보기 창에서 항목 확인
      const preview = page.locator('.paystub-preview');
      await expect(preview.locator('.employee-info')).toContainText('EMP001');
      await expect(preview.locator('.base-salary')).toContainText('3,000,000');
      await expect(preview.locator('.income-tax')).toContainText('180,000');
      await expect(preview.locator('.national-pension')).toContainText('135,000');
      await expect(preview.locator('.net-pay')).toBeVisible();
    });

    test('명세서를 이메일로 발송할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 이메일 발송
      await page.click('[data-testid="email-paystubs"]');
      await page.check('[data-testid="select-all-employees"]');
      await page.click('[data-testid="send-emails"]');

      // 발송 확인
      await expect(page.locator('.email-sent-success')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=2명에게 급여명세서가 발송되었습니다')).toBeVisible();
    });
  });

  /**
   * 급여 대장 관리 테스트
   * 급여 이력 조회 및 수정
   */
  test.describe('급여 대장 관리', () => {
    test('월별 급여 대장을 조회할 수 있어야 한다', async ({ page }) => {
      // 여러 달의 급여 데이터 생성
      await page.click('[data-testid="payroll-history"]');

      // 월별 필터
      await page.selectOption('[data-testid="history-month"]', '2024-01');
      await page.click('[data-testid="apply-filter"]');

      // 급여 대장 확인
      await expect(page.locator('.payroll-summary')).toBeVisible();
      await expect(page.locator('.total-employees')).toContainText('2명');
      await expect(page.locator('.total-payroll')).toContainText('3,180,000원');
    });

    test('급여 내역을 수정할 수 있어야 한다', async ({ page }) => {
      // 급여 계산 후 수정
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 급여 수정
      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');
      await monthlyEmployee.click('[data-testid="edit-payroll"]');

      // 보너스 추가
      await page.fill('[data-testid="bonus-amount"]', '500000');
      await page.fill('[data-testid="bonus-reason"]', '성과급');
      await page.click('[data-testid="save-changes"]');

      // 수정 결과 확인
      await expect(monthlyEmployee.locator('.bonus')).toContainText('500,000원');
      await expect(monthlyEmployee.locator('.total-pay')).toContainText('3,500,000원');
    });

    test('급여 승인 프로세스가 동작해야 한다', async ({ page }) => {
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 10000 });

      // 급여 승인
      await page.click('[data-testid="submit-for-approval"]');

      // 승인 상태 확인
      await expect(page.locator('.approval-pending')).toBeVisible();
      await expect(page.locator('text=승인 대기 중')).toBeVisible();

      // 승인 처리
      await page.click('[data-testid="approve-payroll"]');
      await page.fill('[data-testid="approval-comment"]', '2024년 1월 급여 승인');
      await page.click('[data-testid="confirm-approval"]');

      // 승인 완료 확인
      await expect(page.locator('.approval-completed')).toBeVisible();
      await expect(page.locator('text=급여가 승인되었습니다')).toBeVisible();
    });
  });

  /**
   * 급여 통계 및 분석 테스트
   * 급여 현황 대시보드
   */
  test.describe('급여 통계 분석', () => {
    test('월별 급여 통계를 확인할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-analytics"]');

      // 차트 로딩 대기
      await expect(page.locator('.analytics-charts')).toBeVisible({ timeout: 10000 });

      // 통계 정보 확인
      await expect(page.locator('.total-payroll-chart')).toBeVisible();
      await expect(page.locator('.department-breakdown')).toBeVisible();
      await expect(page.locator('.overtime-trend')).toBeVisible();
    });

    test('부서별 급여 현황을 조회할 수 있어야 한다', async ({ page }) => {
      // 부서 정보 추가
      await dbHelper.pool.query(`
        UPDATE employees SET department = '영업팀' WHERE id = 9001;
        UPDATE employees SET department = '개발팀' WHERE id = 9002;
      `);

      await page.click('[data-testid="payroll-analytics"]');
      await page.click('[data-testid="department-analysis"]');

      // 부서별 통계 확인
      await expect(page.locator('[data-testid="dept-영업팀"]')).toContainText('3,000,000원');
      await expect(page.locator('[data-testid="dept-개발팀"]')).toContainText('180,000원');
    });

    test('연봉 총액 및 세금 통계를 확인할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-analytics"]');
      await page.click('[data-testid="annual-summary"]');

      // 연간 통계 확인
      await expect(page.locator('.annual-payroll')).toContainText('38,160,000원'); // 12개월 기준
      await expect(page.locator('.total-tax')).toContainText('2,376,000원');
      await expect(page.locator('.total-insurance')).toContainText('3,374,760원');
    });
  });

  /**
   * 세무 신고 지원 테스트
   * 원천징수영수증, 연말정산 등
   */
  test.describe('세무 신고 지원', () => {
    test('원천징수영수증을 생성할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="tax-documents"]');

      // 원천징수영수증 생성
      await page.click('[data-testid="generate-withholding-certificate"]');
      await page.selectOption('[data-testid="tax-year"]', '2024');
      await page.check('[data-testid="select-all-employees"]');
      await page.click('[data-testid="generate-certificates"]');

      // 생성 완료 확인
      await expect(page.locator('.certificates-generated')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('text=원천징수영수증이 생성되었습니다')).toBeVisible();
    });

    test('연말정산 자료를 준비할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="tax-documents"]');
      await page.click('[data-testid="year-end-settlement"]');

      // 연말정산 자료 생성
      await page.selectOption('[data-testid="settlement-year"]', '2024');
      await page.click('[data-testid="prepare-settlement"]');

      // 자료 준비 완료 확인
      await expect(page.locator('.settlement-ready')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.employee-tax-summary')).toBeVisible();
    });

    test('사업자 신고 자료를 내보낼 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="tax-documents"]');
      await page.click('[data-testid="business-tax-export"]');

      // 신고 자료 내보내기
      await page.selectOption('[data-testid="export-period"]', '2024-Q1');
      await page.selectOption('[data-testid="export-format"]', 'excel');
      await page.click('[data-testid="export-data"]');

      // 내보내기 완료 확인
      await expect(page.locator('.export-completed')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=사업자신고자료_2024Q1.xlsx')).toBeVisible();
    });
  });

  /**
   * 보안 및 권한 테스트
   * 급여 정보 보안 처리
   */
  test.describe('보안 및 권한', () => {
    test('일반 직원은 자신의 급여만 조회할 수 있어야 한다', async ({ page }) => {
      // 직원으로 로그인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsWorker();
      await page.goto('/payroll/my-payroll');

      // 자신의 급여만 표시 확인
      await expect(page.locator('[data-testid="my-salary-info"]')).toBeVisible();
      await expect(page.locator('[data-testid="other-employee-salary"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="payroll-management"]')).not.toBeVisible();
    });

    test('급여 데이터 접근 시 감사 로그가 기록되어야 한다', async ({ page }) => {
      // 급여 조회
      await page.click('[data-testid="view-payroll-details"]');
      await page.locator('[data-testid="employee-9001"]').click();

      // 감사 로그 확인 (관리자 페이지)
      await page.goto('/admin/audit-logs');
      await page.selectOption('[data-testid="log-type"]', 'payroll_access');

      await expect(page.locator('.audit-log-entry')).toContainText('급여 정보 조회');
      await expect(page.locator('.log-user')).toContainText('E2E 사업주');
    });

    test('급여 데이터 수정 시 변경 이력이 기록되어야 한다', async ({ page }) => {
      // 급여 수정
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      const monthlyEmployee = page.locator('[data-testid="employee-9001"]');
      await monthlyEmployee.click('[data-testid="edit-payroll"]');
      await page.fill('[data-testid="bonus-amount"]', '300000');
      await page.click('[data-testid="save-changes"]');

      // 변경 이력 확인
      await monthlyEmployee.click('[data-testid="view-history"]');

      await expect(page.locator('.change-history')).toBeVisible();
      await expect(page.locator('.history-entry')).toContainText('보너스 추가: 300,000원');
    });
  });

  /**
   * 모바일 환경 테스트
   * 모바일에서 급여 조회
   */
  test.describe('모바일 환경', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('모바일에서 급여 계산기가 적절히 표시되어야 한다', async ({ page }) => {
      // 모바일 뷰 확인
      await expect(page.locator('.mobile-payroll-layout')).toBeVisible();

      // 터치 스크롤 확인
      await page.touchscreen.swipe(200, 400, 200, 200, 100);

      // 계산 버튼이 터치하기 적절한 크기인지 확인
      const calculateButton = page.locator('[data-testid="calculate-payroll"]');
      const boundingBox = await calculateButton.boundingBox();
      expect(boundingBox.height).toBeGreaterThan(44);
    });
  });

  /**
   * 성능 테스트
   * 대량 직원 급여 계산 성능
   */
  test.describe('성능 테스트', () => {
    test('100명 직원 급여 계산이 30초 이내 완료되어야 한다', async ({ page }) => {
      // 100명 직원 데이터 생성
      const employees = [];
      for (let i = 3; i <= 102; i++) {
        employees.push(`(${9000 + i}, ${9000 + i}, 9001, 'EMP${String(i).padStart(3, '0')}', '직원', 'hourly', NULL, 15000)`);
      }

      await dbHelper.pool.query(`
        INSERT INTO employees (id, user_id, business_id, employee_number, position, salary_type, base_salary, hourly_rate)
        VALUES ${employees.join(', ')}
      `);

      // 출근 데이터도 생성 (간단히 몇 명만)
      const attendance = [];
      for (let i = 3; i <= 12; i++) {
        attendance.push(`(${9000 + i}, 9001, '2024-01-15', '09:00:00', '18:00:00', '08:00:00', 'checked_out')`);
      }

      await dbHelper.pool.query(`
        INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, status)
        VALUES ${attendance.join(', ')}
      `);

      const startTime = Date.now();

      // 급여 계산 시작
      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      // 계산 완료 대기
      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 30000 });

      const calculationTime = Date.now() - startTime;
      expect(calculationTime).toBeLessThan(30000);

      // 결과 건수 확인
      await expect(page.locator('.calculated-employees-count')).toContainText('102명');
    });
  });
});