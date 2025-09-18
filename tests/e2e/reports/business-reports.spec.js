/**
 * T139: 업무 보고서 E2E 테스트 작성
 * 출근 현황, 급여 통계, 매출 분석 등 다양한 비즈니스 리포트
 * 차트 생성, 데이터 내보내기, 실시간 대시보드 검증
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const { DatabaseHelper, scenarioHelpers, authHelpers } = require('../helpers/test-helpers');

/**
 * 업무 보고서 E2E 테스트 스위트
 * 한글 주석: 비즈니스 인텔리전스 및 리포팅 기능 검증
 */
test.describe('업무 보고서 E2E 테스트', () => {
  let loginPage;
  let dbHelper;

  // 각 테스트 전 초기화
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dbHelper = new DatabaseHelper();

    // 테스트 데이터 설정
    await dbHelper.cleanupTestData();
    await scenarioHelpers.setupScenario('owner', dbHelper);

    // 리포트용 테스트 데이터 생성
    await setupReportTestData();

    // 사업주로 로그인
    await loginPage.navigate();
    await loginPage.loginAsOwner();
    await page.goto('/reports');
  });

  test.afterEach(async () => {
    await dbHelper.close();
  });

  // 리포트 테스트를 위한 데이터 설정
  async function setupReportTestData() {
    // 직원 데이터
    await dbHelper.pool.query(`
      INSERT INTO employees (id, user_id, business_id, employee_number, position, department, salary_type, base_salary, hourly_rate)
      VALUES
      (9001, 9001, 9001, 'EMP001', '매니저', '영업팀', 'monthly', 3000000, NULL),
      (9002, 9002, 9001, 'EMP002', '직원', '개발팀', 'hourly', NULL, 15000),
      (9003, 9003, 9001, 'EMP003', '직원', '영업팀', 'hourly', NULL, 12000),
      (9004, 9004, 9001, 'EMP004', '인턴', '개발팀', 'hourly', NULL, 10000)
    `);

    // 출근 데이터 (최근 2주간)
    const attendanceData = [];
    for (let day = 1; day <= 14; day++) {
      const date = `2024-01-${String(day).padStart(2, '0')}`;
      // 각 직원별 출근 데이터
      attendanceData.push(`(9001, 9001, '${date}', '09:00:00', '18:00:00', '08:00:00', 'checked_out')`);
      attendanceData.push(`(9002, 9001, '${date}', '10:00:00', '19:00:00', '08:00:00', 'checked_out')`);
      attendanceData.push(`(9003, 9001, '${date}', '09:30:00', '17:30:00', '07:00:00', 'checked_out')`);
      // 인턴은 격일 출근
      if (day % 2 === 0) {
        attendanceData.push(`(9004, 9001, '${date}', '10:00:00', '16:00:00', '05:00:00', 'checked_out')`);
      }
    }

    await dbHelper.pool.query(`
      INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, status)
      VALUES ${attendanceData.join(', ')}
    `);

    // 급여 데이터
    await dbHelper.pool.query(`
      INSERT INTO pay_statements (id, user_id, business_id, pay_period, base_pay, overtime_pay, total_pay, deductions, net_pay)
      VALUES
      (9001, 9001, 9001, '2024-01', 3000000, 0, 3000000, 500000, 2500000),
      (9002, 9002, 9001, '2024-01', 1680000, 120000, 1800000, 300000, 1500000),
      (9003, 9003, 9001, '2024-01', 980000, 0, 980000, 150000, 830000),
      (9004, 9004, 9001, '2024-01', 350000, 0, 350000, 50000, 300000)
    `);

    // 매출 데이터 (가상)
    await dbHelper.pool.query(`
      INSERT INTO sales_records (id, business_id, sale_date, amount, customer_type, payment_method)
      VALUES
      (9001, 9001, '2024-01-15', 500000, 'walk-in', 'cash'),
      (9002, 9001, '2024-01-15', 750000, 'regular', 'card'),
      (9003, 9001, '2024-01-16', 300000, 'walk-in', 'cash'),
      (9004, 9001, '2024-01-16', 1200000, 'vip', 'transfer'),
      (9005, 9001, '2024-01-17', 450000, 'regular', 'card')
    `);
  }

  /**
   * 출근 현황 보고서 테스트
   * 직원별 출근율, 지각 현황 등
   */
  test.describe('출근 현황 보고서', () => {
    test('출근율 통계가 올바르게 표시되어야 한다', async ({ page }) => {
      // 출근 현황 보고서 선택
      await page.click('[data-testid="attendance-report"]');

      // 기간 설정
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      // 리포트 로딩 대기
      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 전체 출근율 확인
      await expect(page.locator('[data-testid="overall-attendance-rate"]')).toContainText('89.3%'); // 50/56일

      // 직원별 출근율 확인
      await expect(page.locator('[data-testid="employee-9001-rate"]')).toContainText('100%');
      await expect(page.locator('[data-testid="employee-9002-rate"]')).toContainText('100%');
      await expect(page.locator('[data-testid="employee-9004-rate"]')).toContainText('50%'); // 격일 출근
    });

    test('부서별 출근 현황을 확인할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="attendance-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');

      // 부서별 보기 선택
      await page.selectOption('[data-testid="view-type"]', 'by-department');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 부서별 통계 확인
      await expect(page.locator('[data-testid="dept-영업팀-attendance"]')).toContainText('93.3%');
      await expect(page.locator('[data-testid="dept-개발팀-attendance"]')).toContainText('85.7%');
    });

    test('지각 및 조퇴 현황을 분석할 수 있어야 한다', async ({ page }) => {
      // 지각 데이터 추가
      await dbHelper.pool.query(`
        UPDATE attendance SET check_in_time = '09:30:00', late_minutes = 30
        WHERE user_id = 9002 AND date = '2024-01-10'
      `);

      await page.reload();
      await page.click('[data-testid="attendance-report"]');
      await page.click('[data-testid="tardiness-analysis"]');

      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 지각 통계 확인
      await expect(page.locator('[data-testid="total-late-incidents"]')).toContainText('1건');
      await expect(page.locator('[data-testid="average-late-time"]')).toContainText('30분');
      await expect(page.locator('[data-testid="employee-9002-late"]')).toContainText('1회');
    });

    test('출근 현황 차트가 정확히 표시되어야 한다', async ({ page }) => {
      await page.click('[data-testid="attendance-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 차트 요소 확인
      await expect(page.locator('.attendance-chart')).toBeVisible();
      await expect(page.locator('.chart-legend')).toBeVisible();

      // 차트 데이터 포인트 확인
      await expect(page.locator('.chart-data-point')).toHaveCount(14); // 14일간
    });
  });

  /**
   * 급여 통계 보고서 테스트
   * 부서별, 직급별 급여 분석
   */
  test.describe('급여 통계 보고서', () => {
    test('전체 급여 통계가 올바르게 계산되어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-report"]');
      await page.selectOption('[data-testid="report-period"]', '2024-01');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 전체 급여 통계 확인
      await expect(page.locator('[data-testid="total-payroll"]')).toContainText('6,130,000원');
      await expect(page.locator('[data-testid="total-deductions"]')).toContainText('1,000,000원');
      await expect(page.locator('[data-testid="total-net-pay"]')).toContainText('5,130,000원');
    });

    test('부서별 급여 현황을 분석할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-report"]');
      await page.selectOption('[data-testid="report-period"]', '2024-01');
      await page.selectOption('[data-testid="breakdown-type"]', 'department');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 부서별 급여 확인
      await expect(page.locator('[data-testid="dept-영업팀-payroll"]')).toContainText('3,980,000원');
      await expect(page.locator('[data-testid="dept-개발팀-payroll"]')).toContainText('2,150,000원');
    });

    test('급여 분포 차트가 표시되어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-report"]');
      await page.selectOption('[data-testid="report-period"]', '2024-01');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 급여 분포 차트 확인
      await expect(page.locator('.salary-distribution-chart')).toBeVisible();
      await expect(page.locator('.average-salary-line')).toBeVisible();

      // 차트 범례 확인
      await expect(page.locator('.chart-legend')).toContainText('월급');
      await expect(page.locator('.chart-legend')).toContainText('시급');
    });

    test('연봉 대비 실수령액 비율을 계산할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-report"]');
      await page.click('[data-testid="annual-analysis"]');
      await page.selectOption('[data-testid="analysis-year"]', '2024');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 연봉 분석 확인
      await expect(page.locator('[data-testid="annual-gross"]')).toContainText('73,560,000원'); // 12개월
      await expect(page.locator('[data-testid="annual-net"]')).toContainText('61,560,000원');
      await expect(page.locator('[data-testid="net-ratio"]')).toContainText('83.7%');
    });
  });

  /**
   * 매출 분석 보고서 테스트
   * 일별, 월별 매출 현황
   */
  test.describe('매출 분석 보고서', () => {
    test('일별 매출 통계를 확인할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="sales-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-15');
      await page.fill('[data-testid="end-date"]', '2024-01-17');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 일별 매출 확인
      await expect(page.locator('[data-testid="sales-2024-01-15"]')).toContainText('1,250,000원');
      await expect(page.locator('[data-testid="sales-2024-01-16"]')).toContainText('1,500,000원');
      await expect(page.locator('[data-testid="sales-2024-01-17"]')).toContainText('450,000원');

      // 총 매출 확인
      await expect(page.locator('[data-testid="total-sales"]')).toContainText('3,200,000원');
    });

    test('결제 방법별 매출 분석이 가능해야 한다', async ({ page }) => {
      await page.click('[data-testid="sales-report"]');
      await page.selectOption('[data-testid="analysis-type"]', 'by-payment-method');
      await page.fill('[data-testid="start-date"]', '2024-01-15');
      await page.fill('[data-testid="end-date"]', '2024-01-17');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 결제 방법별 매출 확인
      await expect(page.locator('[data-testid="payment-cash"]')).toContainText('750,000원'); // 23.4%
      await expect(page.locator('[data-testid="payment-card"]')).toContainText('1,200,000원'); // 37.5%
      await expect(page.locator('[data-testid="payment-transfer"]')).toContainText('1,200,000원'); // 37.5%
    });

    test('고객 유형별 매출 분석을 확인할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="sales-report"]');
      await page.selectOption('[data-testid="analysis-type"]', 'by-customer-type');
      await page.fill('[data-testid="start-date"]', '2024-01-15');
      await page.fill('[data-testid="end-date"]', '2024-01-17');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 고객 유형별 매출 확인
      await expect(page.locator('[data-testid="customer-walk-in"]')).toContainText('750,000원');
      await expect(page.locator('[data-testid="customer-regular"]')).toContainText('1,200,000원');
      await expect(page.locator('[data-testid="customer-vip"]')).toContainText('1,200,000원');
    });

    test('매출 트렌드 차트가 표시되어야 한다', async ({ page }) => {
      await page.click('[data-testid="sales-report"]');
      await page.click('[data-testid="trend-analysis"]');
      await page.selectOption('[data-testid="trend-period"]', 'monthly');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 트렌드 차트 확인
      await expect(page.locator('.sales-trend-chart')).toBeVisible();
      await expect(page.locator('.trend-line')).toBeVisible();
      await expect(page.locator('.moving-average')).toBeVisible();
    });
  });

  /**
   * 생산성 분석 보고서 테스트
   * 직원별 업무 효율성 분석
   */
  test.describe('생산성 분석 보고서', () => {
    test('직원별 시간당 생산성을 계산할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="productivity-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 직원별 생산성 지표 확인
      await expect(page.locator('[data-testid="employee-9001-productivity"]')).toBeVisible();
      await expect(page.locator('[data-testid="hours-per-week"]')).toContainText('40시간');
      await expect(page.locator('[data-testid="productivity-score"]')).toBeVisible();
    });

    test('부서별 생산성 비교가 가능해야 한다', async ({ page }) => {
      await page.click('[data-testid="productivity-report"]');
      await page.selectOption('[data-testid="comparison-type"]', 'department');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 부서별 생산성 비교 차트
      await expect(page.locator('.department-productivity-chart')).toBeVisible();
      await expect(page.locator('[data-testid="dept-영업팀-score"]')).toBeVisible();
      await expect(page.locator('[data-testid="dept-개발팀-score"]')).toBeVisible();
    });

    test('근무 패턴 분석을 확인할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="productivity-report"]');
      await page.click('[data-testid="work-pattern-analysis"]');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 근무 패턴 분석 결과
      await expect(page.locator('.work-pattern-heatmap')).toBeVisible();
      await expect(page.locator('[data-testid="peak-hours"]')).toContainText('14:00-16:00');
      await expect(page.locator('[data-testid="average-work-hours"]')).toContainText('7.5시간');
    });
  });

  /**
   * 리포트 내보내기 테스트
   * Excel, PDF, CSV 형식 지원
   */
  test.describe('리포트 내보내기', () => {
    test('Excel 형식으로 내보낼 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="attendance-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // Excel 내보내기
      await page.click('[data-testid="export-excel"]');

      // 다운로드 확인
      await expect(page.locator('.export-success')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('text=출근현황보고서_2024-01-01_2024-01-14.xlsx')).toBeVisible();
    });

    test('PDF 형식으로 내보낼 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-report"]');
      await page.selectOption('[data-testid="report-period"]', '2024-01');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // PDF 내보내기
      await page.click('[data-testid="export-pdf"]');

      // PDF 생성 옵션 설정
      await page.check('[data-testid="include-charts"]');
      await page.check('[data-testid="include-summary"]');
      await page.click('[data-testid="generate-pdf"]');

      // PDF 생성 완료 확인
      await expect(page.locator('.pdf-ready')).toBeVisible({ timeout: 20000 });
      await expect(page.locator('text=급여통계보고서_2024-01.pdf')).toBeVisible();
    });

    test('CSV 형식으로 원시 데이터를 내보낼 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="sales-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-15');
      await page.fill('[data-testid="end-date"]', '2024-01-17');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // CSV 내보내기
      await page.click('[data-testid="export-csv"]');

      // 원시 데이터 내보내기 확인
      await expect(page.locator('.csv-export-complete')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=매출데이터_2024-01-15_2024-01-17.csv')).toBeVisible();
    });

    test('이메일로 리포트를 전송할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="attendance-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-01-14');
      await page.click('[data-testid="generate-report"]');

      await expect(page.locator('.report-container')).toBeVisible({ timeout: 10000 });

      // 이메일 전송
      await page.click('[data-testid="email-report"]');
      await page.fill('[data-testid="recipient-email"]', 'manager@company.com');
      await page.fill('[data-testid="email-subject"]', '주간 출근 현황 보고서');
      await page.fill('[data-testid="email-message"]', '첨부된 보고서를 확인해주세요.');
      await page.selectOption('[data-testid="email-format"]', 'pdf');
      await page.click('[data-testid="send-email"]');

      // 전송 완료 확인
      await expect(page.locator('.email-sent')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=보고서가 이메일로 전송되었습니다')).toBeVisible();
    });
  });

  /**
   * 실시간 대시보드 테스트
   * 실시간 업데이트 및 알림
   */
  test.describe('실시간 대시보드', () => {
    test('실시간 출근 현황이 업데이트되어야 한다', async ({ page }) => {
      await page.click('[data-testid="real-time-dashboard"]');

      // 초기 출근 현황 확인
      await expect(page.locator('[data-testid="current-attendance"]')).toContainText('2명 출근 중');

      // 새로운 출근 데이터 시뮬레이션
      await dbHelper.pool.query(`
        INSERT INTO attendance (user_id, business_id, date, check_in_time, status)
        VALUES (9004, 9001, CURRENT_DATE, CURRENT_TIME, 'checked_in')
      `);

      // WebSocket을 통한 실시간 업데이트 시뮬레이션
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('attendance-update', {
          detail: { type: 'check_in', userId: 9004, count: 3 }
        }));
      });

      // 업데이트된 출근 현황 확인
      await expect(page.locator('[data-testid="current-attendance"]')).toContainText('3명 출근 중');
    });

    test('실시간 매출 현황이 표시되어야 한다', async ({ page }) => {
      await page.click('[data-testid="real-time-dashboard"]');

      // 초기 매출 현황
      await expect(page.locator('[data-testid="today-sales"]')).toBeVisible();

      // 새로운 매출 데이터 추가
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('sales-update', {
          detail: { amount: 150000, total: 350000 }
        }));
      });

      // 실시간 매출 업데이트 확인
      await expect(page.locator('[data-testid="today-sales"]')).toContainText('350,000원');
    });

    test('알림 및 경고가 표시되어야 한다', async ({ page }) => {
      await page.click('[data-testid="real-time-dashboard"]');

      // 지각 알림 시뮬레이션
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('tardiness-alert', {
          detail: {
            type: 'late_arrival',
            employee: 'EMP002',
            minutes: 30,
            message: 'EMP002 직원이 30분 지각했습니다'
          }
        }));
      });

      // 알림 표시 확인
      await expect(page.locator('.alert-notification')).toBeVisible();
      await expect(page.locator('.alert-notification')).toContainText('EMP002 직원이 30분 지각했습니다');
    });

    test('대시보드 위젯을 커스터마이징할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="real-time-dashboard"]');
      await page.click('[data-testid="customize-dashboard"]');

      // 위젯 추가/제거
      await page.check('[data-testid="widget-productivity-meter"]');
      await page.uncheck('[data-testid="widget-weather"]');
      await page.click('[data-testid="save-layout"]');

      // 커스터마이징 결과 확인
      await expect(page.locator('[data-testid="productivity-meter-widget"]')).toBeVisible();
      await expect(page.locator('[data-testid="weather-widget"]')).not.toBeVisible();
    });
  });

  /**
   * 스케줄된 리포트 테스트
   * 자동 생성 및 전송
   */
  test.describe('스케줄된 리포트', () => {
    test('주간 리포트 스케줄을 설정할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="scheduled-reports"]');
      await page.click('[data-testid="create-schedule"]');

      // 스케줄 설정
      await page.fill('[data-testid="schedule-name"]', '주간 출근 현황');
      await page.selectOption('[data-testid="report-type"]', 'attendance');
      await page.selectOption('[data-testid="frequency"]', 'weekly');
      await page.selectOption('[data-testid="day-of-week"]', 'monday');
      await page.fill('[data-testid="send-time"]', '09:00');
      await page.fill('[data-testid="recipients"]', 'hr@company.com,manager@company.com');

      await page.click('[data-testid="save-schedule"]');

      // 스케줄 생성 확인
      await expect(page.locator('.schedule-created')).toBeVisible();
      await expect(page.locator('[data-testid="schedule-주간 출근 현황"]')).toBeVisible();
    });

    test('월간 급여 리포트를 자동 생성할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="scheduled-reports"]');
      await page.click('[data-testid="create-schedule"]');

      // 월간 급여 리포트 설정
      await page.fill('[data-testid="schedule-name"]', '월간 급여 통계');
      await page.selectOption('[data-testid="report-type"]', 'payroll');
      await page.selectOption('[data-testid="frequency"]', 'monthly');
      await page.selectOption('[data-testid="day-of-month"]', '1'); // 매월 1일
      await page.selectOption('[data-testid="format"]', 'pdf');

      await page.click('[data-testid="save-schedule"]');

      // 자동 생성 스케줄 확인
      await expect(page.locator('[data-testid="schedule-월간 급여 통계"]')).toBeVisible();
    });

    test('스케줄된 리포트를 수정할 수 있어야 한다', async ({ page }) => {
      // 기존 스케줄 편집
      await page.click('[data-testid="scheduled-reports"]');
      await page.click('[data-testid="schedule-주간 출근 현황"] [data-testid="edit-schedule"]');

      // 수신자 변경
      await page.fill('[data-testid="recipients"]', 'hr@company.com');
      await page.selectOption('[data-testid="format"]', 'excel');

      await page.click('[data-testid="save-changes"]');

      // 수정 확인
      await expect(page.locator('.schedule-updated')).toBeVisible();
    });
  });

  /**
   * 권한 및 보안 테스트
   * 리포트 접근 권한 관리
   */
  test.describe('권한 및 보안', () => {
    test('관리자는 제한적 리포트만 접근할 수 있어야 한다', async ({ page }) => {
      // 관리자로 로그인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsAdmin();
      await page.goto('/reports');

      // 접근 가능한 리포트 확인
      await expect(page.locator('[data-testid="attendance-report"]')).toBeVisible();
      await expect(page.locator('[data-testid="productivity-report"]')).toBeVisible();

      // 접근 불가능한 리포트 확인
      await expect(page.locator('[data-testid="payroll-report"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="sales-report"]')).not.toBeVisible();
    });

    test('일반 직원은 자신 관련 리포트만 볼 수 있어야 한다', async ({ page }) => {
      // 직원으로 로그인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsWorker();
      await page.goto('/reports/my-reports');

      // 개인 리포트만 접근 가능
      await expect(page.locator('[data-testid="my-attendance"]')).toBeVisible();
      await expect(page.locator('[data-testid="my-payroll"]')).toBeVisible();

      // 전체 리포트 접근 불가
      await expect(page.locator('[data-testid="all-employees-report"]')).not.toBeVisible();
    });

    test('민감한 데이터 접근 시 추가 인증이 요구되어야 한다', async ({ page }) => {
      await page.click('[data-testid="payroll-report"]');

      // 급여 데이터 접근 시 재인증 요구
      await expect(page.locator('.re-authentication-modal')).toBeVisible();
      await page.fill('[data-testid="confirm-password"]', 'test123!@#');
      await page.click('[data-testid="authenticate"]');

      // 인증 후 리포트 접근
      await expect(page.locator('.report-container')).toBeVisible();
    });
  });

  /**
   * 성능 테스트
   * 대용량 데이터 리포트 생성 성능
   */
  test.describe('성능 테스트', () => {
    test('1년치 출근 데이터 리포트가 30초 이내 생성되어야 한다', async ({ page }) => {
      // 대량 출근 데이터 생성 (365일 * 4명)
      const bulkData = [];
      for (let day = 1; day <= 365; day++) {
        const date = new Date(2024, 0, day).toISOString().split('T')[0];
        bulkData.push(`(9001, 9001, '${date}', '09:00:00', '18:00:00', '08:00:00', 'checked_out')`);
        bulkData.push(`(9002, 9001, '${date}', '10:00:00', '19:00:00', '08:00:00', 'checked_out')`);
        if (bulkData.length >= 100) {
          await dbHelper.pool.query(`
            INSERT INTO attendance (user_id, business_id, date, check_in_time, check_out_time, work_hours, status)
            VALUES ${bulkData.join(', ')}
          `);
          bulkData.length = 0;
        }
      }

      const startTime = Date.now();

      // 연간 리포트 생성
      await page.click('[data-testid="attendance-report"]');
      await page.fill('[data-testid="start-date"]', '2024-01-01');
      await page.fill('[data-testid="end-date"]', '2024-12-31');
      await page.click('[data-testid="generate-report"]');

      // 리포트 생성 완료 대기
      await expect(page.locator('.report-container')).toBeVisible({ timeout: 30000 });

      const reportTime = Date.now() - startTime;
      expect(reportTime).toBeLessThan(30000);

      // 리포트 정확성 확인
      await expect(page.locator('[data-testid="total-work-days"]')).toContainText('730일'); // 2명 * 365일
    });
  });
});