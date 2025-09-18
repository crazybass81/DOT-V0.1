/**
 * 스케줄 CRUD E2E 테스트
 *
 * 테스트 시나리오:
 * 1. 스케줄 생성
 * 2. 스케줄 조회
 * 3. 스케줄 수정
 * 4. 스케줄 삭제
 * 5. 스케줄 복사
 * 6. 스케줄 충돌 검사
 */

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { SchedulePage } = require('../pages/SchedulePage');
const { testUsers, testBusinesses } = require('../fixtures/users');
const {
  DatabaseHelper,
  authHelpers,
  utils
} = require('../helpers/test-helpers');

test.describe('스케줄 CRUD', () => {
  let loginPage;
  let schedulePage;
  let dbHelper;

  test.beforeAll(async () => {
    dbHelper = new DatabaseHelper();
  });

  test.afterAll(async () => {
    await dbHelper.cleanupTestData();
    await dbHelper.close();
  });

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    schedulePage = new SchedulePage(page);
  });

  test.describe('스케줄 생성', () => {
    test('주간 스케줄 생성', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 새 스케줄 생성 버튼
      await page.click('button:has-text("새 스케줄")');

      // 스케줄 생성 폼 표시
      await expect(page.locator('.schedule-form')).toBeVisible();

      // 스케줄 정보 입력
      await page.fill('input[name="scheduleName"]', '주간 근무 스케줄');
      await page.selectOption('select[name="scheduleType"]', 'weekly');

      // 시작일 선택 (다음 월요일)
      const nextMonday = new Date();
      const day = nextMonday.getDay();
      const diff = day === 0 ? 1 : (8 - day);
      nextMonday.setDate(nextMonday.getDate() + diff);
      await page.fill('input[name="startDate"]', nextMonday.toISOString().split('T')[0]);

      // 종료일 선택 (다음 일요일)
      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextSunday.getDate() + 6);
      await page.fill('input[name="endDate"]', nextSunday.toISOString().split('T')[0]);

      // 근무 시간 설정
      await page.fill('input[name="defaultStartTime"]', '09:00');
      await page.fill('input[name="defaultEndTime"]', '18:00');

      // 휴게 시간 설정
      await page.fill('input[name="breakDuration"]', '60');

      // 저장
      await page.click('button:has-text("스케줄 생성")');

      // 성공 메시지 확인
      await expect(page.locator('.toast-success')).toContainText('스케줄이 생성되었습니다');

      // 생성된 스케줄 목록에 표시
      await expect(page.locator('.schedule-list')).toContainText('주간 근무 스케줄');
    });

    test('교대 근무 스케줄 생성', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 새 스케줄 생성
      await page.click('button:has-text("새 스케줄")');

      // 교대 근무 선택
      await page.selectOption('select[name="scheduleType"]', 'shift');

      // 스케줄명 입력
      await page.fill('input[name="scheduleName"]', '3교대 근무');

      // 교대 시간 설정
      await page.click('button:has-text("교대 추가")');

      // 1조 (주간)
      await page.fill('.shift-row:nth-child(1) input[name="shiftName"]', '주간조');
      await page.fill('.shift-row:nth-child(1) input[name="startTime"]', '07:00');
      await page.fill('.shift-row:nth-child(1) input[name="endTime"]', '15:00');

      // 2조 (오후)
      await page.click('button:has-text("교대 추가")');
      await page.fill('.shift-row:nth-child(2) input[name="shiftName"]', '오후조');
      await page.fill('.shift-row:nth-child(2) input[name="startTime"]', '15:00');
      await page.fill('.shift-row:nth-child(2) input[name="endTime"]', '23:00');

      // 3조 (야간)
      await page.click('button:has-text("교대 추가")');
      await page.fill('.shift-row:nth-child(3) input[name="shiftName"]', '야간조');
      await page.fill('.shift-row:nth-child(3) input[name="startTime"]', '23:00');
      await page.fill('.shift-row:nth-child(3) input[name="endTime"]', '07:00');

      // 교대 주기 설정
      await page.fill('input[name="rotationDays"]', '7');

      // 저장
      await page.click('button:has-text("스케줄 생성")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('교대 스케줄이 생성되었습니다');

      // 교대 정보 표시
      await expect(page.locator('.shift-schedule-card')).toContainText('3교대 근무');
      await expect(page.locator('.shift-details')).toContainText('주간조');
      await expect(page.locator('.shift-details')).toContainText('오후조');
      await expect(page.locator('.shift-details')).toContainText('야간조');
    });

    test('유연 근무 스케줄 생성', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 새 스케줄 생성
      await page.click('button:has-text("새 스케줄")');

      // 유연 근무 선택
      await page.selectOption('select[name="scheduleType"]', 'flexible');

      // 스케줄명 입력
      await page.fill('input[name="scheduleName"]', '유연 근무제');

      // 코어 타임 설정
      await page.check('input[name="hasCoreTime"]');
      await page.fill('input[name="coreStartTime"]', '10:00');
      await page.fill('input[name="coreEndTime"]', '16:00');

      // 최소/최대 근무시간
      await page.fill('input[name="minDailyHours"]', '6');
      await page.fill('input[name="maxDailyHours"]', '10');

      // 주당 표준 근무시간
      await page.fill('input[name="weeklyHours"]', '40');

      // 선택 근무 시간대
      await page.fill('input[name="flexStartTime"]', '07:00');
      await page.fill('input[name="flexEndTime"]', '22:00');

      // 저장
      await page.click('button:has-text("스케줄 생성")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('유연 근무 스케줄이 생성되었습니다');

      // 유연 근무 정보 표시
      await expect(page.locator('.flexible-schedule-card')).toContainText('코어 타임: 10:00 - 16:00');
    });
  });

  test.describe('스케줄 조회', () => {
    test('주간 캘린더 뷰', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 내 스케줄 페이지로 이동
      await page.click('nav >> text=내 스케줄');

      // 주간 뷰 선택
      await page.click('button:has-text("주간")');

      // 주간 캘린더 표시
      await expect(page.locator('.weekly-calendar')).toBeVisible();

      // 요일별 스케줄 표시
      const days = ['월', '화', '수', '목', '금', '토', '일'];
      for (const day of days) {
        await expect(page.locator('.calendar-header')).toContainText(day);
      }

      // 스케줄 카드 표시
      await expect(page.locator('.schedule-card')).toHaveCount.greaterThan(0);

      // 스케줄 상세 정보
      const scheduleCard = page.locator('.schedule-card').first();
      await expect(scheduleCard).toContainText('09:00');
      await expect(scheduleCard).toContainText('18:00');
    });

    test('월간 캘린더 뷰', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 내 스케줄 페이지로 이동
      await page.click('nav >> text=내 스케줄');

      // 월간 뷰 선택
      await page.click('button:has-text("월간")');

      // 월간 캘린더 표시
      await expect(page.locator('.monthly-calendar')).toBeVisible();

      // 달력 그리드 표시
      await expect(page.locator('.calendar-grid')).toBeVisible();

      // 날짜 셀 확인 (최소 28개)
      await expect(page.locator('.calendar-date')).toHaveCount.greaterThanOrEqual(28);

      // 스케줄이 있는 날짜 표시
      await expect(page.locator('.has-schedule')).toHaveCount.greaterThan(0);

      // 날짜 클릭 시 상세 정보
      await page.click('.has-schedule').first();
      await expect(page.locator('.schedule-detail-popup')).toBeVisible();
    });

    test('리스트 뷰', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 내 스케줄 페이지로 이동
      await page.click('nav >> text=내 스케줄');

      // 리스트 뷰 선택
      await page.click('button:has-text("목록")');

      // 스케줄 목록 표시
      await expect(page.locator('.schedule-list-view')).toBeVisible();

      // 스케줄 항목
      await expect(page.locator('.schedule-list-item')).toHaveCount.greaterThan(0);

      // 각 항목 정보
      const firstItem = page.locator('.schedule-list-item').first();
      await expect(firstItem.locator('.schedule-date')).toBeVisible();
      await expect(firstItem.locator('.schedule-time')).toBeVisible();
      await expect(firstItem.locator('.schedule-duration')).toBeVisible();
      await expect(firstItem.locator('.schedule-status')).toBeVisible();

      // 필터링
      await page.selectOption('select[name="statusFilter"]', 'upcoming');
      await expect(page.locator('.schedule-list-item')).toHaveCount.greaterThan(0);
    });
  });

  test.describe('스케줄 수정', () => {
    test('근무 시간 변경', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 기존 스케줄 선택
      await page.click('.schedule-list-item').first();

      // 편집 모드 진입
      await page.click('button:has-text("편집")');

      // 시간 변경
      await page.fill('input[name="startTime"]', '08:30');
      await page.fill('input[name="endTime"]', '17:30');

      // 변경 사항 저장
      await page.click('button:has-text("저장")');

      // 확인 다이얼로그
      await expect(page.locator('.confirm-dialog')).toContainText('스케줄을 변경하시겠습니까?');
      await page.click('.confirm-dialog >> button:has-text("확인")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('스케줄이 수정되었습니다');

      // 변경된 시간 확인
      await expect(page.locator('.schedule-time')).toContainText('08:30 - 17:30');
    });

    test('직원 할당 변경', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 스케줄 선택
      await page.click('.schedule-list-item').first();

      // 직원 할당 탭
      await page.click('tab:has-text("직원 할당")');

      // 직원 목록 표시
      await expect(page.locator('.employee-list')).toBeVisible();

      // 직원 선택
      await page.check('.employee-checkbox').nth(1);
      await page.check('.employee-checkbox').nth(2);

      // 기존 직원 제거
      await page.uncheck('.employee-checkbox').first();

      // 변경 사항 저장
      await page.click('button:has-text("할당 저장")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('직원 할당이 변경되었습니다');

      // 알림 발송 옵션
      await expect(page.locator('.notification-option')).toBeVisible();
      await page.check('input[name="sendNotification"]');
      await page.click('button:has-text("알림 발송")');
    });

    test('반복 패턴 수정', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 반복 스케줄 선택
      await page.click('.recurring-schedule').first();

      // 편집 모드
      await page.click('button:has-text("편집")');

      // 반복 설정 변경
      await page.selectOption('select[name="recurrenceType"]', 'weekly');
      await page.check('input[name="monday"]');
      await page.check('input[name="wednesday"]');
      await page.check('input[name="friday"]');

      // 반복 종료일 설정
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);
      await page.fill('input[name="recurrenceEndDate"]', endDate.toISOString().split('T')[0]);

      // 저장
      await page.click('button:has-text("저장")');

      // 변경 범위 선택
      await expect(page.locator('.update-scope-dialog')).toBeVisible();
      await page.click('label:has-text("이후 모든 일정")');
      await page.click('button:has-text("적용")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('반복 패턴이 수정되었습니다');
    });
  });

  test.describe('스케줄 삭제', () => {
    test('단일 스케줄 삭제', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 스케줄 선택
      await page.click('.schedule-list-item').first();

      // 삭제 버튼 클릭
      await page.click('button:has-text("삭제")');

      // 확인 다이얼로그
      await expect(page.locator('.delete-confirm-dialog')).toBeVisible();
      await expect(page.locator('.delete-confirm-dialog')).toContainText('정말 삭제하시겠습니까?');

      // 삭제 사유 입력
      await page.fill('textarea[name="deleteReason"]', '일정 변경으로 인한 삭제');

      // 삭제 확인
      await page.click('.delete-confirm-dialog >> button:has-text("삭제")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('스케줄이 삭제되었습니다');

      // 목록에서 제거 확인
      await expect(page.locator('.schedule-list')).not.toContainText('삭제된 스케줄명');
    });

    test('반복 스케줄 삭제', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 반복 스케줄 선택
      await page.click('.recurring-schedule').first();

      // 삭제 버튼 클릭
      await page.click('button:has-text("삭제")');

      // 삭제 범위 선택
      await expect(page.locator('.delete-scope-dialog')).toBeVisible();
      await page.click('label:has-text("이 일정만")');

      // 삭제 확인
      await page.click('button:has-text("삭제 진행")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('선택한 일정이 삭제되었습니다');
    });

    test('일괄 삭제', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 선택 모드 활성화
      await page.click('button:has-text("선택")');

      // 여러 스케줄 선택
      await page.check('.schedule-checkbox').nth(0);
      await page.check('.schedule-checkbox').nth(1);
      await page.check('.schedule-checkbox').nth(2);

      // 일괄 삭제
      await page.click('button:has-text("선택 삭제")');

      // 확인 다이얼로그
      await expect(page.locator('.batch-delete-dialog')).toContainText('3개의 스케줄을 삭제');

      // 삭제 확인
      await page.click('.batch-delete-dialog >> button:has-text("모두 삭제")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('3개의 스케줄이 삭제되었습니다');
    });
  });

  test.describe('스케줄 복사', () => {
    test('주간 스케줄 복사', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 기존 스케줄 선택
      await page.click('.schedule-list-item').first();

      // 복사 버튼 클릭
      await page.click('button:has-text("복사")');

      // 복사 옵션 다이얼로그
      await expect(page.locator('.copy-dialog')).toBeVisible();

      // 대상 주 선택
      await page.click('button:has-text("다음 주")');

      // 복사 옵션
      await page.check('input[name="copyEmployees"]');
      await page.uncheck('input[name="copyNotes"]');

      // 복사 실행
      await page.click('button:has-text("복사 실행")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('스케줄이 복사되었습니다');

      // 복사된 스케줄 확인
      await page.click('button:has-text("다음 주")');
      await expect(page.locator('.schedule-card')).toContainText('복사됨');
    });

    test('템플릿으로 저장', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 스케줄 선택
      await page.click('.schedule-list-item').first();

      // 템플릿으로 저장
      await page.click('button:has-text("템플릿으로 저장")');

      // 템플릿 정보 입력
      await expect(page.locator('.template-dialog')).toBeVisible();
      await page.fill('input[name="templateName"]', '표준 주간 스케줄');
      await page.fill('textarea[name="templateDescription"]', '기본 9-6 근무 스케줄');

      // 카테고리 선택
      await page.selectOption('select[name="templateCategory"]', 'regular');

      // 저장
      await page.click('button:has-text("템플릿 저장")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('템플릿이 저장되었습니다');

      // 템플릿 목록에서 확인
      await page.click('tab:has-text("템플릿")');
      await expect(page.locator('.template-list')).toContainText('표준 주간 스케줄');
    });

    test('템플릿에서 스케줄 생성', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 템플릿 탭
      await page.click('tab:has-text("템플릿")');

      // 템플릿 선택
      await page.click('.template-card').first();

      // 적용 버튼
      await page.click('button:has-text("템플릿 적용")');

      // 적용 기간 선택
      await expect(page.locator('.apply-template-dialog')).toBeVisible();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7);
      await page.fill('input[name="applyStartDate"]', startDate.toISOString().split('T')[0]);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      await page.fill('input[name="applyEndDate"]', endDate.toISOString().split('T')[0]);

      // 직원 선택
      await page.click('button:has-text("직원 선택")');
      await page.check('.employee-checkbox').nth(0);
      await page.check('.employee-checkbox').nth(1);

      // 적용
      await page.click('button:has-text("적용")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('템플릿이 적용되었습니다');
    });
  });

  test.describe('스케줄 충돌 검사', () => {
    test('시간 중복 감지', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 새 스케줄 생성
      await page.click('button:has-text("새 스케줄")');

      // 기존 스케줄과 중복되는 시간 입력
      await page.fill('input[name="startTime"]', '09:00');
      await page.fill('input[name="endTime"]', '18:00');
      await page.fill('input[name="scheduleDate"]', new Date().toISOString().split('T')[0]);

      // 직원 선택
      await page.click('button:has-text("직원 선택")');
      await page.check('.employee-checkbox').first(); // 이미 스케줄이 있는 직원

      // 저장 시도
      await page.click('button:has-text("스케줄 생성")');

      // 충돌 경고
      await expect(page.locator('.conflict-warning')).toBeVisible();
      await expect(page.locator('.conflict-warning')).toContainText('스케줄 충돌 감지');

      // 충돌 상세 정보
      await expect(page.locator('.conflict-details')).toContainText('기존 스케줄');
      await expect(page.locator('.conflict-employee')).toBeVisible();

      // 해결 옵션
      await expect(page.locator('button:has-text("기존 스케줄 수정")')).toBeVisible();
      await expect(page.locator('button:has-text("새 스케줄 조정")')).toBeVisible();
      await expect(page.locator('button:has-text("강제 생성")')).toBeVisible();
    });

    test('휴무일 충돌 체크', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 새 스케줄 생성
      await page.click('button:has-text("새 스케줄")');

      // 공휴일 날짜 선택 (예: 설날)
      const holiday = new Date('2024-02-10');
      await page.fill('input[name="scheduleDate"]', holiday.toISOString().split('T')[0]);

      // 시간 입력
      await page.fill('input[name="startTime"]', '09:00');
      await page.fill('input[name="endTime"]', '18:00');

      // 저장 시도
      await page.click('button:has-text("스케줄 생성")');

      // 휴무일 경고
      await expect(page.locator('.holiday-warning')).toBeVisible();
      await expect(page.locator('.holiday-warning')).toContainText('공휴일입니다');

      // 휴일 근무 확인
      await expect(page.locator('.holiday-work-confirm')).toContainText('휴일 근무로 설정');
      await expect(page.locator('.overtime-rate-info')).toContainText('휴일 수당 적용');

      // 계속 진행
      await page.click('button:has-text("휴일 근무 생성")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('휴일 근무 스케줄이 생성되었습니다');
    });

    test('최대 근무시간 초과 경고', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 새 스케줄 생성
      await page.click('button:has-text("새 스케줄")');

      // 장시간 근무 입력 (12시간 초과)
      await page.fill('input[name="startTime"]', '06:00');
      await page.fill('input[name="endTime"]', '23:00');

      // 저장 시도
      await page.click('button:has-text("스케줄 생성")');

      // 근로기준법 경고
      await expect(page.locator('.labor-law-warning')).toBeVisible();
      await expect(page.locator('.labor-law-warning')).toContainText('1일 최대 근무시간 초과');
      await expect(page.locator('.legal-limit-info')).toContainText('법정 근로시간: 8시간');
      await expect(page.locator('.overtime-info')).toContainText('연장 근로: 9시간');

      // 관리자 승인 필요
      await expect(page.locator('.approval-required')).toContainText('특별 승인 필요');

      // 사유 입력
      await page.fill('textarea[name="overtimeReason"]', '긴급 프로젝트 마감');
      await page.click('button:has-text("승인 요청")');
    });
  });
});