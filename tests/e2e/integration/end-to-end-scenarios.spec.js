/**
 * T140: 통합 시나리오 E2E 테스트 작성
 * 전체 비즈니스 플로우를 시뮬레이션하는 종합적인 시나리오
 * 실제 사용자 여정을 따라 모든 시스템 기능 통합 검증
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const AttendancePage = require('../pages/AttendancePage');
const { DatabaseHelper, scenarioHelpers, authHelpers, networkHelpers } = require('../helpers/test-helpers');

/**
 * 통합 시나리오 E2E 테스트 스위트
 * 한글 주석: 실제 비즈니스 환경을 시뮬레이션하는 종합 테스트
 */
test.describe('통합 시나리오 E2E 테스트', () => {
  let loginPage;
  let attendancePage;
  let dbHelper;

  // 전체 테스트 시작 전 한 번만 실행
  test.beforeAll(async () => {
    dbHelper = new DatabaseHelper();
    await dbHelper.cleanupTestData();
    await setupIntegrationTestData();
  });

  // 각 테스트 전 초기화
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    attendancePage = new AttendancePage(page);

    // 위치 권한 허용
    await page.context().grantPermissions(['geolocation']);
    await page.setGeolocation({ latitude: 37.5665, longitude: 126.9780 });
  });

  test.afterAll(async () => {
    await dbHelper.close();
  });

  // 통합 테스트를 위한 완전한 데이터 설정
  async function setupIntegrationTestData() {
    // 사업주 및 사업장 설정
    await scenarioHelpers.setupScenario('owner', dbHelper);

    // 다양한 역할의 사용자들 생성
    const users = [
      { id: 9002, name: 'E2E 관리자', email: 'admin@e2e.test', phone: '010-2222-2222', status: 'active' },
      { id: 9003, name: 'E2E 직원1', email: 'worker1@e2e.test', phone: '010-3333-3333', status: 'active' },
      { id: 9004, name: 'E2E 직원2', email: 'worker2@e2e.test', phone: '010-4444-4444', status: 'active' },
      { id: 9005, name: 'E2E 구직자', email: 'seeker@e2e.test', phone: '010-5555-5555', status: 'active' }
    ];

    for (const user of users) {
      await dbHelper.createTestUser(user);
    }

    // 역할 할당
    await dbHelper.assignUserRole(9002, 9001, 'admin', { manageUsers: true, viewReports: true });
    await dbHelper.assignUserRole(9003, 9001, 'worker', {});
    await dbHelper.assignUserRole(9004, 9001, 'worker', {});

    // 직원 정보 설정
    await dbHelper.pool.query(`
      INSERT INTO employees (id, user_id, business_id, employee_number, position, department, salary_type, base_salary, hourly_rate)
      VALUES
      (9001, 9000, 9001, 'EMP000', '사업주', '경영진', 'monthly', 5000000, NULL),
      (9002, 9002, 9001, 'EMP002', '관리자', '관리팀', 'monthly', 3500000, NULL),
      (9003, 9003, 9001, 'EMP003', '매니저', '영업팀', 'monthly', 3000000, NULL),
      (9004, 9004, 9001, 'EMP004', '직원', '개발팀', 'hourly', NULL, 18000)
    `);

    // 스케줄 설정
    await dbHelper.pool.query(`
      INSERT INTO schedules (id, business_id, name, start_time, end_time, days_of_week, created_by)
      VALUES
      (9001, 9001, '정규 근무', '09:00:00', '18:00:00', '{"monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true}', 9000),
      (9002, 9001, '시간제 근무', '10:00:00', '15:00:00', '{"monday": true, "wednesday": true, "friday": true}', 9000)
    `);

    // 스케줄 배정
    await dbHelper.pool.query(`
      INSERT INTO schedule_assignments (schedule_id, user_id, assigned_by)
      VALUES
      (9001, 9002, 9000),
      (9001, 9003, 9000),
      (9002, 9004, 9000)
    `);
  }

  /**
   * 시나리오 1: 새로운 직원 온보딩 플로우
   * 구직자 가입 → 면접 → 채용 → 온보딩 → 첫 출근
   */
  test.describe('시나리오 1: 신규 직원 온보딩', () => {
    test('구직자부터 정식 직원까지의 전체 플로우가 동작해야 한다', async ({ page }) => {
      // 1단계: 구직자 회원가입
      await page.goto('/register');
      await page.selectOption('[data-testid="user-type"]', 'seeker');
      await page.fill('[data-testid="name"]', 'E2E 신규직원');
      await page.fill('[data-testid="email"]', 'newbie@e2e.test');
      await page.fill('[data-testid="phone"]', '010-9999-9999');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.fill('[data-testid="confirm-password"]', 'test123!@#');
      await page.click('[data-testid="register-button"]');

      await expect(page.locator('text=회원가입이 완료되었습니다')).toBeVisible();

      // 2단계: 구직자 로그인 및 채용공고 지원
      await page.goto('/login');
      await page.fill('[data-testid="email"]', 'newbie@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await expect(page).toHaveURL(/.*\/jobs/);

      // 채용공고 지원
      await page.click('[data-testid="job-posting-9001"]');
      await page.fill('[data-testid="cover-letter"]', '성실하게 근무하겠습니다.');
      await page.click('[data-testid="apply-job"]');

      await expect(page.locator('text=지원이 완료되었습니다')).toBeVisible();

      // 3단계: 사업주 관점에서 지원자 검토 및 채용
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsOwner();
      await page.goto('/hr/applicants');

      // 지원자 검토
      await page.click('[data-testid="applicant-newbie@e2e.test"]');
      await page.click('[data-testid="approve-application"]');
      await page.fill('[data-testid="position"]', '신입 개발자');
      await page.fill('[data-testid="salary"]', '2500000');
      await page.selectOption('[data-testid="department"]', '개발팀');
      await page.click('[data-testid="confirm-hire"]');

      await expect(page.locator('text=채용이 완료되었습니다')).toBeVisible();

      // 4단계: 신규 직원 온보딩
      await page.goto('/hr/onboarding');
      await page.click('[data-testid="new-employee-newbie@e2e.test"]');

      // 온보딩 체크리스트 완료
      await page.check('[data-testid="documents-submitted"]');
      await page.check('[data-testid="equipment-provided"]');
      await page.check('[data-testid="system-access-granted"]');
      await page.check('[data-testid="orientation-completed"]');
      await page.click('[data-testid="complete-onboarding"]');

      await expect(page.locator('text=온보딩이 완료되었습니다')).toBeVisible();

      // 5단계: 신규 직원 첫 출근
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.goto('/login');
      await page.fill('[data-testid="email"]', 'newbie@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      // 첫 출근 (출근 페이지로 자동 리다이렉트)
      await expect(page).toHaveURL(/.*\/attendance/);

      await page.clock.setFixedTime(new Date('2024-01-15T09:00:00'));
      await page.click('[data-testid="check-in-button"]');
      await attendancePage.waitForGpsCheck();

      await expect(page.locator('text=첫 출근을 축하합니다!')).toBeVisible();
      await attendancePage.expectCheckInSuccess();
    });
  });

  /**
   * 시나리오 2: 일반적인 하루 업무 플로우
   * 출근 → 업무 → 휴게시간 → 업무 → 퇴근 → 일일 보고서
   */
  test.describe('시나리오 2: 일반적인 업무일 플로우', () => {
    test('직원의 하루 전체 업무 사이클이 올바르게 동작해야 한다', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.navigate();
      await page.fill('[data-testid="email"]', 'worker1@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      // 1단계: 출근
      await page.clock.setFixedTime(new Date('2024-01-15T09:00:00'));
      await attendancePage.navigate();
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();
      await attendancePage.expectCheckInSuccess();

      // 2단계: 오전 업무 (업무 일지 작성)
      await page.goto('/tasks');
      await page.click('[data-testid="add-task"]');
      await page.fill('[data-testid="task-title"]', '월간 보고서 작성');
      await page.fill('[data-testid="task-description"]', '1월 영업 실적 정리 및 분석');
      await page.selectOption('[data-testid="task-priority"]', 'high');
      await page.click('[data-testid="save-task"]');

      await expect(page.locator('text=업무가 등록되었습니다')).toBeVisible();

      // 업무 진행
      await page.click('[data-testid="start-task"]');
      await page.clock.setFixedTime(new Date('2024-01-15T11:30:00'));
      await page.click('[data-testid="task-progress-50"]');

      // 3단계: 점심 휴게시간
      await page.clock.setFixedTime(new Date('2024-01-15T12:00:00'));
      await attendancePage.navigate();
      await page.click('[data-testid="break-start-button"]');

      await expect(page.locator('text=휴게시간이 시작되었습니다')).toBeVisible();

      await page.clock.setFixedTime(new Date('2024-01-15T13:00:00'));
      await page.click('[data-testid="break-end-button"]');

      await expect(page.locator('text=휴게시간이 종료되었습니다')).toBeVisible();

      // 4단계: 오후 업무 완료
      await page.goto('/tasks');
      await page.click('[data-testid="task-월간 보고서 작성"]');
      await page.clock.setFixedTime(new Date('2024-01-15T16:00:00'));
      await page.click('[data-testid="complete-task"]');
      await page.fill('[data-testid="completion-note"]', '보고서 작성 완료. 부서장 검토 요청');
      await page.click('[data-testid="submit-completion"]');

      await expect(page.locator('text=업무가 완료되었습니다')).toBeVisible();

      // 5단계: 추가 업무 및 문서 작업
      await page.goto('/documents');
      await page.click('[data-testid="upload-document"]');
      await page.setInputFiles('[data-testid="file-input"]', {
        name: '영업실적_1월.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('fake excel content')
      });
      await page.fill('[data-testid="document-description"]', '1월 영업실적 데이터');
      await page.click('[data-testid="upload-button"]');

      await expect(page.locator('text=문서가 업로드되었습니다')).toBeVisible();

      // 6단계: 퇴근
      await page.clock.setFixedTime(new Date('2024-01-15T18:00:00'));
      await attendancePage.navigate();
      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();
      await attendancePage.expectCheckOutSuccess();

      // 근무시간 확인 (9시간 - 1시간 휴게 = 8시간)
      await attendancePage.expectWorkHours('8시간 0분');

      // 7단계: 일일 업무 보고서 자동 생성 확인
      await page.goto('/reports/daily');
      await expect(page.locator('[data-testid="daily-summary-2024-01-15"]')).toBeVisible();
      await expect(page.locator('.work-hours')).toContainText('8시간');
      await expect(page.locator('.tasks-completed')).toContainText('1건');
      await expect(page.locator('.documents-uploaded')).toContainText('1건');
    });
  });

  /**
   * 시나리오 3: 급여 처리 전체 사이클
   * 근무 데이터 축적 → 급여 계산 → 승인 → 명세서 발송 → 세무 처리
   */
  test.describe('시나리오 3: 월말 급여 처리 사이클', () => {
    test('한 달간의 근무 데이터부터 급여 지급까지 전체 프로세스가 동작해야 한다', async ({ page }) => {
      // 1단계: 한 달간의 근무 데이터 누적 (시뮬레이션)
      const workDays = [];
      for (let day = 1; day <= 31; day++) {
        if (day % 7 !== 0 && day % 7 !== 6) { // 주말 제외
          workDays.push(`(9003, 9001, '2024-01-${String(day).padStart(2, '0')}', '09:00:00', '18:00:00', '08:00:00', 'checked_out')`);
          workDays.push(`(9004, 9001, '2024-01-${String(day).padStart(2, '0')}', '10:00:00', '15:00:00', '04:00:00', 'checked_out')`);
        }
      }

      await dbHelper.pool.query(`
        INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, status)
        VALUES ${workDays.join(', ')}
      `);

      // 2단계: 사업주가 급여 계산 시작
      await loginPage.navigate();
      await loginPage.loginAsOwner();
      await page.goto('/payroll');

      await page.click('[data-testid="calculate-payroll"]');
      await page.selectOption('[data-testid="payroll-month"]', '2024-01');
      await page.click('[data-testid="start-calculation"]');

      // 계산 완료 대기
      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 15000 });

      // 급여 계산 결과 확인
      const monthlyEmployee = page.locator('[data-testid="employee-9003"]');
      await expect(monthlyEmployee.locator('.total-pay')).toContainText('3,000,000원');

      const hourlyEmployee = page.locator('[data-testid="employee-9004"]');
      const expectedPay = 23 * 4 * 18000; // 23일 * 4시간 * 18,000원
      await expect(hourlyEmployee.locator('.total-pay')).toContainText(`${expectedPay.toLocaleString()}원`);

      // 3단계: 급여 데이터 검토 및 수정
      await monthlyEmployee.click('[data-testid="edit-payroll"]');
      await page.fill('[data-testid="bonus-amount"]', '200000');
      await page.fill('[data-testid="bonus-reason"]', '우수사원 성과급');
      await page.click('[data-testid="save-changes"]');

      await expect(monthlyEmployee.locator('.total-pay')).toContainText('3,200,000원');

      // 4단계: 관리자 검토 및 승인 요청
      await page.click('[data-testid="request-approval"]');
      await page.fill('[data-testid="approval-note"]', '2024년 1월 급여 승인 요청');
      await page.click('[data-testid="submit-for-approval"]');

      await expect(page.locator('text=관리자에게 승인 요청되었습니다')).toBeVisible();

      // 5단계: 관리자 승인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.fill('[data-testid="email"]', 'admin@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await page.goto('/payroll/approval');
      await page.click('[data-testid="pending-approval-2024-01"]');
      await page.click('[data-testid="approve-payroll"]');
      await page.fill('[data-testid="approval-comment"]', '검토 완료. 승인합니다.');
      await page.click('[data-testid="confirm-approval"]');

      await expect(page.locator('text=급여가 승인되었습니다')).toBeVisible();

      // 6단계: 급여 명세서 생성 및 발송
      await page.click('[data-testid="generate-paystubs"]');
      await page.check('[data-testid="email-to-employees"]');
      await page.click('[data-testid="generate-and-send"]');

      await expect(page.locator('.paystubs-sent')).toBeVisible({ timeout: 20000 });
      await expect(page.locator('text=급여명세서가 직원들에게 발송되었습니다')).toBeVisible();

      // 7단계: 직원이 명세서 확인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.fill('[data-testid="email"]', 'worker1@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await page.goto('/payroll/my-paystub');
      await page.selectOption('[data-testid="paystub-month"]', '2024-01');

      // 명세서 내용 확인
      await expect(page.locator('.paystub-detail')).toBeVisible();
      await expect(page.locator('.base-salary')).toContainText('3,000,000원');
      await expect(page.locator('.bonus')).toContainText('200,000원');
      await expect(page.locator('.net-pay')).toBeVisible();

      // 8단계: 세무 신고 자료 준비 (사업주)
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsOwner();
      await page.goto('/tax/monthly-report');

      await page.selectOption('[data-testid="tax-month"]', '2024-01');
      await page.click('[data-testid="generate-tax-report"]');

      await expect(page.locator('.tax-report-ready')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid="total-payroll-tax"]')).toBeVisible();
      await expect(page.locator('[data-testid="withholding-tax"]')).toBeVisible();
    });
  });

  /**
   * 시나리오 4: 비상 상황 대응 플로우
   * 시스템 장애 → 오프라인 모드 → 복구 → 데이터 동기화
   */
  test.describe('시나리오 4: 시스템 장애 대응', () => {
    test('네트워크 장애 상황에서 오프라인 모드가 동작하고 복구 시 동기화되어야 한다', async ({ page }) => {
      // 1단계: 정상 출근
      await loginPage.navigate();
      await page.fill('[data-testid="email"]', 'worker1@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await page.clock.setFixedTime(new Date('2024-01-15T09:00:00'));
      await attendancePage.navigate();
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();
      await attendancePage.expectCheckInSuccess();

      // 2단계: 네트워크 장애 발생
      await page.context().setOffline(true);

      // 3단계: 오프라인 상태에서 퇴근 시도
      await page.clock.setFixedTime(new Date('2024-01-15T18:00:00'));
      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();

      // 오프라인 모드 확인
      await expect(page.locator('.offline-mode')).toBeVisible();
      await expect(page.locator('text=오프라인 모드로 기록되었습니다')).toBeVisible();

      // 로컬 스토리지에 저장 확인
      const offlineData = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('offline-attendance') || '[]');
      });
      expect(offlineData).toHaveLength(1);
      expect(offlineData[0].type).toBe('check_out');

      // 4단계: 추가 오프라인 작업 (업무 일지)
      await page.goto('/tasks');
      await page.click('[data-testid="add-task"]');
      await page.fill('[data-testid="task-title"]', '네트워크 장애 대응 보고서');
      await page.fill('[data-testid="task-description"]', '오프라인 상황에서의 업무 처리');
      await page.click('[data-testid="save-task"]');

      // 오프라인 저장 확인
      await expect(page.locator('.offline-saved')).toBeVisible();

      // 5단계: 네트워크 복구
      await page.context().setOffline(false);

      // 6단계: 자동 동기화 대기
      await expect(page.locator('.sync-in-progress')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.sync-complete')).toBeVisible({ timeout: 10000 });

      // 동기화 완료 확인
      await expect(page.locator('text=오프라인 데이터가 동기화되었습니다')).toBeVisible();

      // 7단계: 동기화 결과 확인
      await attendancePage.navigate();
      await attendancePage.expectStatus('checked_out');
      await attendancePage.expectWorkHours('8시간 0분');

      // 8단계: 관리자 관점에서 장애 로그 확인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.fill('[data-testid="email"]', 'admin@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await page.goto('/admin/system-logs');
      await page.selectOption('[data-testid="log-type"]', 'offline_sync');

      // 오프라인 동기화 로그 확인
      await expect(page.locator('.sync-log-entry')).toBeVisible();
      await expect(page.locator('.log-type-offline')).toContainText('오프라인 데이터 동기화');
      await expect(page.locator('.sync-status-success')).toBeVisible();
    });
  });

  /**
   * 시나리오 5: 다중 사업장 관리 플로우
   * 본점 관리 → 지점 추가 → 직원 이동 → 통합 보고서
   */
  test.describe('시나리오 5: 다중 사업장 운영', () => {
    test('본점과 지점을 운영하는 다중 사업장 시나리오가 동작해야 한다', async ({ page }) => {
      // 1단계: 사업주가 지점 추가
      await loginPage.navigate();
      await loginPage.loginAsOwner();
      await page.goto('/business/branches');

      await page.click('[data-testid="add-branch"]');
      await page.fill('[data-testid="branch-name"]', '강남점');
      await page.fill('[data-testid="branch-address"]', '서울시 강남구 테헤란로 123');
      await page.fill('[data-testid="branch-phone"]', '02-1234-5678');

      // 지점 위치 설정 (GPS 좌표)
      await page.fill('[data-testid="latitude"]', '37.5013');
      await page.fill('[data-testid="longitude"]', '127.0394');
      await page.fill('[data-testid="gps-radius"]', '100');

      await page.click('[data-testid="save-branch"]');

      await expect(page.locator('text=지점이 추가되었습니다')).toBeVisible();

      // 2단계: 지점 관리자 임명
      await page.click('[data-testid="branch-강남점"]');
      await page.click('[data-testid="assign-manager"]');
      await page.selectOption('[data-testid="manager-select"]', '9002'); // 관리자 임명
      await page.click('[data-testid="confirm-assignment"]');

      await expect(page.locator('text=지점 관리자가 임명되었습니다')).toBeVisible();

      // 3단계: 직원을 지점으로 이동
      await page.goto('/hr/employees');
      await page.click('[data-testid="employee-9004"]');
      await page.click('[data-testid="transfer-employee"]');
      await page.selectOption('[data-testid="target-branch"]', '강남점');
      await page.fill('[data-testid="transfer-reason"]', '지점 개발팀 신설');
      await page.fill('[data-testid="effective-date"]', '2024-01-16');
      await page.click('[data-testid="confirm-transfer"]');

      await expect(page.locator('text=직원 이동이 완료되었습니다')).toBeVisible();

      // 4단계: 지점 관리자 관점에서 확인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.fill('[data-testid="email"]', 'admin@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      // 지점 대시보드 확인
      await page.goto('/branch/dashboard');
      await expect(page.locator('[data-testid="branch-name"]')).toContainText('강남점');
      await expect(page.locator('[data-testid="total-employees"]')).toContainText('1명');

      // 5단계: 이동된 직원의 지점에서 출근
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.fill('[data-testid="email"]', 'worker2@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      // 지점 위치에서 출근 (좌표 변경)
      await page.setGeolocation({ latitude: 37.5013, longitude: 127.0394 });

      await page.clock.setFixedTime(new Date('2024-01-16T10:00:00'));
      await attendancePage.navigate();
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 지점 출근 성공 확인
      await attendancePage.expectCheckInSuccess();
      await expect(page.locator('[data-testid="workplace"]')).toContainText('강남점');

      // 6단계: 통합 보고서 확인 (사업주)
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsOwner();
      await page.goto('/reports/multi-branch');

      await page.selectOption('[data-testid="report-type"]', 'attendance');
      await page.fill('[data-testid="start-date"]', '2024-01-16');
      await page.fill('[data-testid="end-date"]', '2024-01-16');
      await page.click('[data-testid="generate-report"]');

      // 지점별 출근 현황 확인
      await expect(page.locator('[data-testid="branch-본점-attendance"]')).toContainText('1명');
      await expect(page.locator('[data-testid="branch-강남점-attendance"]')).toContainText('1명');
      await expect(page.locator('[data-testid="total-attendance"]')).toContainText('2명');
    });
  });

  /**
   * 시나리오 6: 연말정산 전체 프로세스
   * 연간 급여 데이터 집계 → 소득공제 신청 → 세액 계산 → 환급/추징
   */
  test.describe('시나리오 6: 연말정산 프로세스', () => {
    test('연말정산 전체 프로세스가 순차적으로 동작해야 한다', async ({ page }) => {
      // 1단계: 연간 급여 데이터 준비 (12개월)
      const payrollData = [];
      for (let month = 1; month <= 12; month++) {
        const period = `2024-${String(month).padStart(2, '0')}`;
        payrollData.push(`(${9001 + month}, 9003, 9001, '${period}', 3000000, 0, 3000000, 500000, 2500000)`);
        payrollData.push(`(${9020 + month}, 9004, 9001, '${period}', 720000, 0, 720000, 100000, 620000)`);
      }

      await dbHelper.pool.query(`
        INSERT INTO pay_statements (id, user_id, business_id, pay_period, base_pay, overtime_pay, total_pay, deductions, net_pay)
        VALUES ${payrollData.join(', ')}
      `);

      // 2단계: 직원이 소득공제 자료 제출
      await loginPage.navigate();
      await page.fill('[data-testid="email"]', 'worker1@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await page.goto('/tax/year-end-settlement');

      // 소득공제 신청서 작성
      await page.fill('[data-testid="medical-expenses"]', '1500000');
      await page.fill('[data-testid="education-expenses"]', '500000');
      await page.fill('[data-testid="donation"]', '300000');
      await page.fill('[data-testid="insurance-premium"]', '1200000');

      // 부양가족 정보
      await page.click('[data-testid="add-dependent"]');
      await page.fill('[data-testid="dependent-name"]', '홍길동');
      await page.selectOption('[data-testid="dependent-relation"]', 'child');
      await page.fill('[data-testid="dependent-age"]', '8');

      // 증빙서류 업로드
      await page.setInputFiles('[data-testid="medical-receipts"]', {
        name: '의료비영수증.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake pdf content')
      });

      await page.click('[data-testid="submit-settlement"]');

      await expect(page.locator('text=연말정산 신청이 완료되었습니다')).toBeVisible();

      // 3단계: 사업주/관리자 검토
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.fill('[data-testid="email"]', 'admin@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await page.goto('/tax/settlement-review');

      // 직원별 연말정산 검토
      await page.click('[data-testid="employee-9003-settlement"]');

      // 제출 자료 검토
      await expect(page.locator('.settlement-summary')).toBeVisible();
      await expect(page.locator('[data-testid="annual-income"]')).toContainText('36,000,000원');
      await expect(page.locator('[data-testid="total-deductions"]')).toContainText('3,500,000원');

      // 검토 완료 및 승인
      await page.click('[data-testid="approve-settlement"]');
      await page.fill('[data-testid="review-comment"]', '제출 서류 검토 완료');
      await page.click('[data-testid="confirm-approval"]');

      // 4단계: 세액 계산 및 정산
      await page.click('[data-testid="calculate-settlement"]');

      await expect(page.locator('.calculation-complete')).toBeVisible({ timeout: 15000 });

      // 정산 결과 확인
      await expect(page.locator('[data-testid="calculated-tax"]')).toBeVisible();
      await expect(page.locator('[data-testid="withheld-tax"]')).toBeVisible();
      await expect(page.locator('[data-testid="settlement-amount"]')).toBeVisible();

      const settlementType = await page.locator('[data-testid="settlement-type"]').textContent();
      expect(['환급', '추징']).toContain(settlementType);

      // 5단계: 원천징수영수증 발급
      await page.click('[data-testid="issue-certificate"]');
      await page.check('[data-testid="select-all-employees"]');
      await page.click('[data-testid="generate-certificates"]');

      await expect(page.locator('.certificates-ready')).toBeVisible({ timeout: 20000 });

      // 6단계: 직원 확인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await page.fill('[data-testid="email"]', 'worker1@e2e.test');
      await page.fill('[data-testid="password"]', 'test123!@#');
      await page.click('[data-testid="login-button"]');

      await page.goto('/tax/my-settlement');

      // 정산 결과 및 영수증 확인
      await expect(page.locator('.settlement-result')).toBeVisible();
      await expect(page.locator('[data-testid="download-certificate"]')).toBeVisible();

      // 원천징수영수증 다운로드
      await page.click('[data-testid="download-certificate"]');

      await expect(page.locator('.download-complete')).toBeVisible();
    });
  });

  /**
   * 성능 및 안정성 테스트
   * 대용량 데이터와 동시 접속 상황
   */
  test.describe('성능 및 안정성 테스트', () => {
    test('대용량 데이터 환경에서 시스템이 안정적으로 동작해야 한다', async ({ page }) => {
      // 대량 데이터 생성 (1000명 직원, 1년치 출근 데이터)
      console.log('대량 테스트 데이터 생성 중...');

      // 성능 테스트를 위한 간소화된 데이터
      const bulkUsers = [];
      for (let i = 100; i < 150; i++) { // 50명으로 축소
        bulkUsers.push(`(${9000 + i}, 'E2E 직원${i}', 'worker${i}@e2e.test', '010-${String(i).padStart(4, '0')}-1234', 'active')`);
      }

      await dbHelper.pool.query(`
        INSERT INTO users (id, name, email, phone, status)
        VALUES ${bulkUsers.join(', ')}
      `);

      // 성능 테스트 시작
      const startTime = Date.now();

      await loginPage.navigate();
      await loginPage.loginAsOwner();

      // 전체 직원 목록 로딩 성능 테스트
      await page.goto('/hr/employees');

      // 페이지 로딩 완료 대기
      await expect(page.locator('[data-testid="employee-list-loaded"]')).toBeVisible({ timeout: 10000 });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(10000); // 10초 이내

      // 대량 데이터 검색 성능 테스트
      const searchStart = Date.now();

      await page.fill('[data-testid="employee-search"]', '직원1');
      await page.keyboard.press('Enter');

      await expect(page.locator('[data-testid="search-results"]')).toBeVisible({ timeout: 5000 });

      const searchTime = Date.now() - searchStart;
      expect(searchTime).toBeLessThan(5000); // 5초 이내

      // 대량 보고서 생성 성능 테스트
      const reportStart = Date.now();

      await page.goto('/reports/attendance');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-31');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 30000 });

      const reportTime = Date.now() - reportStart;
      expect(reportTime).toBeLessThan(30000); // 30초 이내

      console.log(`성능 테스트 완료 - 로딩: ${loadTime}ms, 검색: ${searchTime}ms, 리포트: ${reportTime}ms`);
    });

    test('동시 사용자 접속 시나리오가 안정적으로 처리되어야 한다', async ({ browser }) => {
      // 다중 브라우저 컨텍스트로 동시 접속 시뮬레이션
      const contexts = [];
      const pages = [];

      try {
        // 5명의 사용자가 동시 로그인
        for (let i = 0; i < 5; i++) {
          const context = await browser.newContext();
          const page = await context.newPage();
          const pageLoginPage = new LoginPage(page);

          contexts.push(context);
          pages.push(page);

          // 동시 로그인 시도
          await pageLoginPage.navigate();
          await page.fill('[data-testid="email"]', `worker${i + 1}@e2e.test`);
          await page.fill('[data-testid="password"]', 'test123!@#');
        }

        // 모든 페이지에서 동시에 로그인 버튼 클릭
        await Promise.all(pages.map(page => page.click('[data-testid="login-button"]')));

        // 모든 로그인이 성공했는지 확인
        for (const page of pages) {
          await expect(page.locator('[data-testid="user-menu"]')).toBeVisible({ timeout: 10000 });
        }

        // 동시 출근 처리
        const checkInTime = new Date('2024-01-15T09:00:00');
        for (const page of pages) {
          await page.clock.setFixedTime(checkInTime);
          await page.goto('/attendance');
        }

        // 동시 출근 시도
        await Promise.all(pages.map(async page => {
          await page.click('[data-testid="check-in-button"]');
          // GPS 체크 대기는 개별적으로
          await page.waitForSelector('.gps-check-complete', { timeout: 5000 }).catch(() => {});
        }));

        // 출근 성공 확인
        let successCount = 0;
        for (const page of pages) {
          try {
            await expect(page.locator('.check-in-success')).toBeVisible({ timeout: 5000 });
            successCount++;
          } catch (e) {
            // 일부 실패는 허용 (동시성 제어)
          }
        }

        // 최소 80% 성공률 요구
        expect(successCount).toBeGreaterThanOrEqual(4);

      } finally {
        // 리소스 정리
        for (const context of contexts) {
          await context.close();
        }
      }
    });
  });
});