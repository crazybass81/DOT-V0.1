/**
 * 근태 이력 조회 E2E 테스트
 *
 * 테스트 시나리오:
 * 1. 개인 근태 이력 조회
 * 2. 기간별 필터링
 * 3. 근태 상세 정보 확인
 * 4. 통계 및 요약
 * 5. 데이터 내보내기
 */

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { AttendancePage } = require('../pages/AttendancePage');
const { testUsers, testBusinesses } = require('../fixtures/users');
const {
  waitForElement,
  waitForApiResponse,
  downloadFile,
  parseCSV
} = require('../helpers/test-helpers');

test.describe('근태 이력 조회', () => {
  let loginPage;
  let attendancePage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    attendancePage = new AttendancePage(page);
  });

  test.describe('개인 근태 이력', () => {
    test('월간 근태 이력 조회', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 월간 뷰 선택
      await page.click('button:has-text("월간")');

      // 현재 월 데이터 로딩 확인
      await expect(page.locator('.month-header')).toContainText(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }));

      // 캘린더 뷰 표시
      await expect(page.locator('.attendance-calendar')).toBeVisible();

      // 근태 기록이 있는 날짜 표시
      await expect(page.locator('.calendar-day.has-record')).toHaveCount.greaterThan(0);

      // 요약 정보 확인
      await expect(page.locator('.monthly-summary')).toBeVisible();
      await expect(page.locator('.total-work-days')).toContainText('총 근무일');
      await expect(page.locator('.total-work-hours')).toContainText('총 근무시간');
    });

    test('주간 근태 이력 조회', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 주간 뷰 선택
      await page.click('button:has-text("주간")');

      // 주간 데이터 표시
      await expect(page.locator('.week-view')).toBeVisible();
      await expect(page.locator('.week-day')).toHaveCount(7);

      // 각 날짜별 근태 정보
      const monday = page.locator('.week-day').first();
      await expect(monday.locator('.date')).toBeVisible();
      await expect(monday.locator('.check-in-time')).toBeVisible();
      await expect(monday.locator('.check-out-time')).toBeVisible();
      await expect(monday.locator('.work-hours')).toBeVisible();
    });

    test('일일 근태 상세 조회', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 특정 날짜 클릭
      await page.click('.calendar-day.has-record').first();

      // 상세 정보 모달 표시
      await expect(page.locator('.attendance-detail-modal')).toBeVisible();

      // 상세 정보 확인
      await expect(page.locator('.detail-date')).toBeVisible();
      await expect(page.locator('.check-in-detail')).toContainText('출근');
      await expect(page.locator('.check-out-detail')).toContainText('퇴근');
      await expect(page.locator('.break-time-detail')).toContainText('휴게시간');
      await expect(page.locator('.actual-work-hours')).toContainText('실 근무시간');

      // 위치 정보 (GPS 체크인인 경우)
      if (await page.locator('.location-info').isVisible()) {
        await expect(page.locator('.check-in-location')).toContainText('출근 위치');
        await expect(page.locator('.check-out-location')).toContainText('퇴근 위치');
      }

      // 체크인 방법 표시
      await expect(page.locator('.checkin-method')).toBeVisible();
    });
  });

  test.describe('기간 필터링', () => {
    test('날짜 범위 선택', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 날짜 범위 선택 버튼
      await page.click('button:has-text("기간 선택")');

      // 날짜 선택기 표시
      await expect(page.locator('.date-range-picker')).toBeVisible();

      // 시작일 선택 (이번 달 1일)
      const firstDay = new Date();
      firstDay.setDate(1);
      await page.fill('input[name="startDate"]', firstDay.toISOString().split('T')[0]);

      // 종료일 선택 (오늘)
      const today = new Date();
      await page.fill('input[name="endDate"]', today.toISOString().split('T')[0]);

      // 적용 버튼
      const apiResponse = waitForApiResponse(page, '/api/attendance/history');
      await page.click('button:has-text("적용")');

      // API 호출 확인
      await apiResponse;

      // 선택된 기간 표시
      await expect(page.locator('.selected-period')).toBeVisible();
      await expect(page.locator('.selected-period')).toContainText(`${firstDay.toLocaleDateString('ko-KR')} ~ ${today.toLocaleDateString('ko-KR')}`);
    });

    test('빠른 기간 선택', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 이번 주 선택
      await page.click('button:has-text("이번 주")');
      await expect(page.locator('.selected-period')).toContainText('이번 주');

      // 지난 주 선택
      await page.click('button:has-text("지난 주")');
      await expect(page.locator('.selected-period')).toContainText('지난 주');

      // 이번 달 선택
      await page.click('button:has-text("이번 달")');
      await expect(page.locator('.selected-period')).toContainText('이번 달');

      // 지난 달 선택
      await page.click('button:has-text("지난 달")');
      await expect(page.locator('.selected-period')).toContainText('지난 달');

      // 최근 3개월 선택
      await page.click('button:has-text("최근 3개월")');
      await expect(page.locator('.selected-period')).toContainText('최근 3개월');
    });

    test('근태 유형별 필터', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 필터 옵션 열기
      await page.click('button:has-text("필터")');

      // 정상 출근만 보기
      await page.check('input[name="normalAttendance"]');
      await page.uncheck('input[name="lateAttendance"]');
      await page.uncheck('input[name="earlyLeave"]');
      await page.uncheck('input[name="absence"]');

      // 필터 적용
      await page.click('button:has-text("필터 적용")');

      // 정상 출근 기록만 표시 확인
      await expect(page.locator('.attendance-record')).toHaveCount.greaterThan(0);
      const records = await page.locator('.attendance-record').all();
      for (const record of records) {
        await expect(record.locator('.status-badge')).toContainText('정상');
      }
    });
  });

  test.describe('근태 통계', () => {
    test('월간 근태 통계', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 통계 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("통계")');

      // 월간 통계 확인
      await expect(page.locator('.statistics-container')).toBeVisible();

      // 주요 지표
      await expect(page.locator('.stat-card.total-days')).toContainText('총 근무일');
      await expect(page.locator('.stat-card.total-hours')).toContainText('총 근무시간');
      await expect(page.locator('.stat-card.average-hours')).toContainText('일평균 근무시간');
      await expect(page.locator('.stat-card.overtime-hours')).toContainText('초과근무');

      // 출근 현황
      await expect(page.locator('.attendance-breakdown')).toBeVisible();
      await expect(page.locator('.normal-attendance-count')).toContainText('정상 출근');
      await expect(page.locator('.late-attendance-count')).toContainText('지각');
      await expect(page.locator('.early-leave-count')).toContainText('조퇴');
      await expect(page.locator('.absence-count')).toContainText('결근');
    });

    test('시간대별 출퇴근 패턴', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 통계 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("통계")');

      // 패턴 분석 섹션
      await page.click('button:has-text("패턴 분석")');

      // 출근 시간 분포 차트
      await expect(page.locator('.check-in-pattern-chart')).toBeVisible();
      await expect(page.locator('.peak-check-in-time')).toContainText('주요 출근 시간');

      // 퇴근 시간 분포 차트
      await expect(page.locator('.check-out-pattern-chart')).toBeVisible();
      await expect(page.locator('.peak-check-out-time')).toContainText('주요 퇴근 시간');

      // 요일별 패턴
      await expect(page.locator('.weekday-pattern')).toBeVisible();
    });

    test('연간 근태 트렌드', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 통계 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("통계")');

      // 연간 뷰 선택
      await page.click('button:has-text("연간")');

      // 연간 트렌드 차트
      await expect(page.locator('.yearly-trend-chart')).toBeVisible();

      // 월별 데이터 포인트
      await expect(page.locator('.month-data-point')).toHaveCount(12);

      // 연간 요약
      await expect(page.locator('.yearly-summary')).toBeVisible();
      await expect(page.locator('.total-annual-days')).toContainText('연간 근무일');
      await expect(page.locator('.total-annual-hours')).toContainText('연간 근무시간');
    });
  });

  test.describe('데이터 내보내기', () => {
    test('Excel 파일로 내보내기', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 내보내기 버튼 클릭
      await page.click('button:has-text("내보내기")');

      // 내보내기 옵션 모달
      await expect(page.locator('.export-modal')).toBeVisible();

      // Excel 형식 선택
      await page.click('label:has-text("Excel (.xlsx)")');

      // 포함할 데이터 선택
      await page.check('input[name="includeDetails"]');
      await page.check('input[name="includeSummary"]');
      await page.check('input[name="includeStatistics"]');

      // 다운로드 시작
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('button:has-text("다운로드")')
      ]);

      // 파일명 확인
      expect(download.suggestedFilename()).toMatch(/attendance.*\.xlsx/);

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('파일이 다운로드되었습니다');
    });

    test('PDF 보고서 생성', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 월간 보고서 생성
      await page.click('button:has-text("월간 보고서")');

      // PDF 미리보기 모달
      await expect(page.locator('.pdf-preview-modal')).toBeVisible();

      // 보고서 내용 확인
      await expect(page.locator('.report-header')).toContainText('월간 근태 보고서');
      await expect(page.locator('.report-period')).toBeVisible();
      await expect(page.locator('.report-summary')).toBeVisible();
      await expect(page.locator('.report-details')).toBeVisible();

      // PDF 다운로드
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('button:has-text("PDF 다운로드")')
      ]);

      // 파일명 확인
      expect(download.suggestedFilename()).toMatch(/monthly-report.*\.pdf/);
    });

    test('CSV 데이터 내보내기', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 이력 페이지로 이동
      await page.click('nav >> text=내 근태');
      await page.click('tab:has-text("근태 이력")');

      // 내보내기 버튼 클릭
      await page.click('button:has-text("내보내기")');

      // CSV 형식 선택
      await page.click('label:has-text("CSV (.csv)")');

      // 다운로드
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('button:has-text("다운로드")')
      ]);

      // 파일명 확인
      expect(download.suggestedFilename()).toMatch(/attendance.*\.csv/);

      // CSV 파일 내용 검증 (옵션)
      const path = await download.path();
      if (path) {
        // CSV 파일 파싱 및 검증 로직
        // const csvContent = await parseCSV(path);
        // expect(csvContent.headers).toContain('날짜');
        // expect(csvContent.headers).toContain('출근시간');
        // expect(csvContent.headers).toContain('퇴근시간');
      }
    });
  });

  test.describe('팀 근태 이력 (관리자)', () => {
    test('팀원 근태 현황 조회', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 팀 근태 페이지로 이동
      await page.click('nav >> text=팀 근태');

      // 팀원 목록 표시
      await expect(page.locator('.team-member-list')).toBeVisible();
      await expect(page.locator('.team-member')).toHaveCount.greaterThan(0);

      // 각 팀원의 상태 표시
      const firstMember = page.locator('.team-member').first();
      await expect(firstMember.locator('.member-name')).toBeVisible();
      await expect(firstMember.locator('.attendance-status')).toBeVisible();
      await expect(firstMember.locator('.today-hours')).toBeVisible();
    });

    test('개별 직원 근태 상세 조회', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 팀 근태 페이지로 이동
      await page.click('nav >> text=팀 근태');

      // 특정 직원 선택
      await page.click('.team-member').first();

      // 직원 상세 근태 모달
      await expect(page.locator('.employee-attendance-modal')).toBeVisible();

      // 직원 정보
      await expect(page.locator('.employee-info')).toBeVisible();
      await expect(page.locator('.employee-name')).toBeVisible();
      await expect(page.locator('.employee-position')).toBeVisible();

      // 근태 이력
      await expect(page.locator('.attendance-history-table')).toBeVisible();
      await expect(page.locator('.history-row')).toHaveCount.greaterThan(0);

      // 통계 요약
      await expect(page.locator('.employee-statistics')).toBeVisible();
    });

    test('팀 전체 근태 보고서', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 팀 근태 페이지로 이동
      await page.click('nav >> text=팀 근태');

      // 팀 보고서 버튼
      await page.click('button:has-text("팀 보고서")');

      // 보고서 생성 옵션
      await expect(page.locator('.team-report-modal')).toBeVisible();

      // 기간 선택
      await page.click('button:has-text("이번 달")');

      // 포함 옵션
      await page.check('input[name="includeAllMembers"]');
      await page.check('input[name="includeStatistics"]');
      await page.check('input[name="includeCharts"]');

      // 보고서 생성
      const apiResponse = waitForApiResponse(page, '/api/attendance/team-report');
      await page.click('button:has-text("보고서 생성")');

      // API 응답 대기
      await apiResponse;

      // 보고서 미리보기
      await expect(page.locator('.report-preview')).toBeVisible();
      await expect(page.locator('.team-summary')).toBeVisible();
      await expect(page.locator('.member-details')).toBeVisible();
    });
  });
});