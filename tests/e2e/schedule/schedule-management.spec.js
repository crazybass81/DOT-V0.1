/**
 * T137: 일정 관리 E2E 테스트 작성
 * 근무 스케줄 생성, 수정, 삭제 및 직원 배정
 * 캘린더 뷰, 충돌 감지, 반복 일정 처리
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const { DatabaseHelper, scenarioHelpers, authHelpers } = require('../helpers/test-helpers');

/**
 * 일정 관리 E2E 테스트 스위트
 * 한글 주석: 근무 스케줄링과 캘린더 기능 검증
 */
test.describe('일정 관리 E2E 테스트', () => {
  let loginPage;
  let dbHelper;

  // 각 테스트 전 초기화
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dbHelper = new DatabaseHelper();

    // 테스트 데이터 설정
    await dbHelper.cleanupTestData();
    await scenarioHelpers.setupScenario('owner', dbHelper);

    // 사업주로 로그인
    await loginPage.navigate();
    await loginPage.loginAsOwner();
    await page.goto('/schedule');
  });

  test.afterEach(async () => {
    await dbHelper.close();
  });

  /**
   * 스케줄 생성 기능 테스트
   * 새로운 근무 일정 생성
   */
  test.describe('스케줄 생성', () => {
    test('기본 근무 스케줄을 생성할 수 있어야 한다', async ({ page }) => {
      // 새 스케줄 생성 버튼 클릭
      await page.click('[data-testid="new-schedule-button"]');

      // 스케줄 정보 입력
      await page.fill('[data-testid="schedule-name"]', '오전 근무');
      await page.fill('[data-testid="start-time"]', '09:00');
      await page.fill('[data-testid="end-time"]', '13:00');
      await page.selectOption('[data-testid="schedule-type"]', 'regular');

      // 근무 요일 선택
      await page.check('[data-testid="monday"]');
      await page.check('[data-testid="tuesday"]');
      await page.check('[data-testid="wednesday"]');
      await page.check('[data-testid="thursday"]');
      await page.check('[data-testid="friday"]');

      // 저장
      await page.click('[data-testid="save-schedule"]');

      // 성공 메시지 확인
      await expect(page.locator('.success-message')).toBeVisible();
      await expect(page.locator('text=스케줄이 생성되었습니다')).toBeVisible();

      // 캘린더에 표시 확인
      await expect(page.locator('[data-testid="schedule-오전 근무"]')).toBeVisible();
    });

    test('시간대별 스케줄을 생성할 수 있어야 한다', async ({ page }) => {
      // 오전 스케줄
      await page.click('[data-testid="new-schedule-button"]');
      await page.fill('[data-testid="schedule-name"]', '오전조');
      await page.fill('[data-testid="start-time"]', '06:00');
      await page.fill('[data-testid="end-time"]', '14:00');
      await page.click('[data-testid="save-schedule"]');

      // 오후 스케줄
      await page.click('[data-testid="new-schedule-button"]');
      await page.fill('[data-testid="schedule-name"]', '오후조');
      await page.fill('[data-testid="start-time"]', '14:00');
      await page.fill('[data-testid="end-time"]', '22:00');
      await page.click('[data-testid="save-schedule"]');

      // 야간 스케줄
      await page.click('[data-testid="new-schedule-button"]');
      await page.fill('[data-testid="schedule-name"]', '야간조');
      await page.fill('[data-testid="start-time"]', '22:00');
      await page.fill('[data-testid="end-time"]', '06:00');
      await page.check('[data-testid="overnight-shift"]');
      await page.click('[data-testid="save-schedule"]');

      // 모든 스케줄이 표시되는지 확인
      await expect(page.locator('[data-testid="schedule-오전조"]')).toBeVisible();
      await expect(page.locator('[data-testid="schedule-오후조"]')).toBeVisible();
      await expect(page.locator('[data-testid="schedule-야간조"]')).toBeVisible();
    });

    test('반복 일정을 설정할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="new-schedule-button"]');

      // 기본 정보 입력
      await page.fill('[data-testid="schedule-name"]', '주간 정기 회의');
      await page.fill('[data-testid="start-time"]', '10:00');
      await page.fill('[data-testid="end-time"]', '11:00');

      // 반복 설정
      await page.check('[data-testid="repeat-schedule"]');
      await page.selectOption('[data-testid="repeat-type"]', 'weekly');
      await page.fill('[data-testid="repeat-weeks"]', '4'); // 4주간 반복

      // 특정 요일만 선택
      await page.check('[data-testid="monday"]');

      await page.click('[data-testid="save-schedule"]');

      // 반복 일정 생성 확인
      await expect(page.locator('text=4주간 반복 일정이 생성되었습니다')).toBeVisible();

      // 캘린더에서 다음 주 확인
      await page.click('[data-testid="next-week"]');
      await expect(page.locator('[data-testid="schedule-주간 정기 회의"]')).toBeVisible();
    });

    test('휴게시간을 포함한 스케줄을 생성할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="new-schedule-button"]');

      await page.fill('[data-testid="schedule-name"]', '일반 근무');
      await page.fill('[data-testid="start-time"]', '09:00');
      await page.fill('[data-testid="end-time"]', '18:00');

      // 휴게시간 설정
      await page.check('[data-testid="include-break"]');
      await page.fill('[data-testid="break-start"]', '12:00');
      await page.fill('[data-testid="break-end"]', '13:00');

      await page.click('[data-testid="save-schedule"]');

      // 실제 근무시간 계산 확인 (9시간 - 1시간 휴게 = 8시간)
      await expect(page.locator('text=실근무시간: 8시간')).toBeVisible();
    });
  });

  /**
   * 스케줄 편집 기능 테스트
   * 기존 스케줄 수정
   */
  test.describe('스케줄 편집', () => {
    test.beforeEach(async ({ page }) => {
      // 테스트용 스케줄 생성
      await dbHelper.pool.query(`
        INSERT INTO schedules (id, business_id, name, start_time, end_time, days_of_week, created_by)
        VALUES (9001, 9001, '기본 스케줄', '09:00:00', '18:00:00', '{"monday": true, "friday": true}', 9000)
      `);
    });

    test('기존 스케줄의 시간을 수정할 수 있어야 한다', async ({ page }) => {
      // 스케줄 클릭하여 편집
      await page.click('[data-testid="schedule-기본 스케줄"]');
      await page.click('[data-testid="edit-schedule"]');

      // 시간 수정
      await page.fill('[data-testid="start-time"]', '08:00');
      await page.fill('[data-testid="end-time"]', '17:00');

      await page.click('[data-testid="save-schedule"]');

      // 수정 확인
      await expect(page.locator('text=스케줄이 수정되었습니다')).toBeVisible();
      await expect(page.locator('text=08:00 - 17:00')).toBeVisible();
    });

    test('스케줄에 직원을 배정할 수 있어야 한다', async ({ page }) => {
      // 테스트용 직원 데이터 추가
      await dbHelper.createTestUser({
        id: 9002,
        name: 'E2E 직원1',
        email: 'worker1@e2e.test',
        phone: '010-1111-1111',
        status: 'active'
      });

      await dbHelper.assignUserRole(9002, 9001, 'worker');

      await page.reload(); // 데이터 새로고침

      // 스케줄에 직원 배정
      await page.click('[data-testid="schedule-기본 스케줄"]');
      await page.click('[data-testid="assign-employees"]');

      await page.check('[data-testid="employee-9002"]');
      await page.click('[data-testid="save-assignment"]');

      // 배정 확인
      await expect(page.locator('text=E2E 직원1')).toBeVisible();
      await expect(page.locator('[data-testid="assigned-count"]')).toContainText('1명');
    });

    test('스케줄 충돌을 감지하고 경고해야 한다', async ({ page }) => {
      // 겹치는 시간대의 새 스케줄 생성 시도
      await page.click('[data-testid="new-schedule-button"]');
      await page.fill('[data-testid="schedule-name"]', '겹치는 스케줄');
      await page.fill('[data-testid="start-time"]', '10:00');
      await page.fill('[data-testid="end-time"]', '19:00');

      // 동일한 요일 선택
      await page.check('[data-testid="monday"]');

      await page.click('[data-testid="save-schedule"]');

      // 충돌 경고 확인
      await expect(page.locator('.conflict-warning')).toBeVisible();
      await expect(page.locator('text=기존 스케줄과 시간이 겹칩니다')).toBeVisible();
    });
  });

  /**
   * 캘린더 뷰 테스트
   * 월간/주간/일간 캘린더 표시
   */
  test.describe('캘린더 뷰', () => {
    test.beforeEach(async ({ page }) => {
      // 여러 스케줄 생성
      await dbHelper.pool.query(`
        INSERT INTO schedules (id, business_id, name, start_time, end_time, days_of_week, created_by) VALUES
        (9001, 9001, '오전 근무', '09:00:00', '13:00:00', '{"monday": true, "wednesday": true, "friday": true}', 9000),
        (9002, 9001, '오후 근무', '13:00:00', '18:00:00', '{"tuesday": true, "thursday": true}', 9000),
        (9003, 9001, '야간 근무', '18:00:00', '22:00:00', '{"saturday": true, "sunday": true}', 9000)
      `);
    });

    test('월간 캘린더에서 모든 스케줄이 표시되어야 한다', async ({ page }) => {
      // 월간 뷰 선택
      await page.click('[data-testid="month-view"]');

      // 각 스케줄이 해당 요일에 표시되는지 확인
      await expect(page.locator('[data-testid="monday"] .schedule-item')).toContainText('오전 근무');
      await expect(page.locator('[data-testid="tuesday"] .schedule-item')).toContainText('오후 근무');
      await expect(page.locator('[data-testid="saturday"] .schedule-item')).toContainText('야간 근무');
    });

    test('주간 캘린더에서 시간대별 스케줄이 정확히 표시되어야 한다', async ({ page }) => {
      // 주간 뷰 선택
      await page.click('[data-testid="week-view"]');

      // 시간대별 스케줄 확인
      const mondayColumn = page.locator('[data-testid="monday-column"]');
      await expect(mondayColumn.locator('.time-slot-09')).toContainText('오전 근무');

      const tuesdayColumn = page.locator('[data-testid="tuesday-column"]');
      await expect(tuesdayColumn.locator('.time-slot-13')).toContainText('오후 근무');
    });

    test('일간 캘린더에서 상세 스케줄 정보가 표시되어야 한다', async ({ page }) => {
      // 특정 날짜의 일간 뷰
      await page.click('[data-testid="day-view"]');
      await page.click('[data-testid="monday-date"]');

      // 해당 날짜의 스케줄 상세 정보 확인
      await expect(page.locator('.schedule-detail')).toBeVisible();
      await expect(page.locator('text=오전 근무')).toBeVisible();
      await expect(page.locator('text=09:00 - 13:00')).toBeVisible();
      await expect(page.locator('text=근무시간: 4시간')).toBeVisible();
    });

    test('캘린더 간 네비게이션이 올바르게 동작해야 한다', async ({ page }) => {
      // 다음 달로 이동
      await page.click('[data-testid="next-month"]');

      // 월 변경 확인
      const currentMonth = await page.locator('[data-testid="current-month"]').textContent();
      expect(currentMonth).toContain('2024년 2월');

      // 이전 달로 돌아가기
      await page.click('[data-testid="prev-month"]');

      const prevMonth = await page.locator('[data-testid="current-month"]').textContent();
      expect(prevMonth).toContain('2024년 1월');
    });
  });

  /**
   * 드래그 앤 드롭 기능 테스트
   * 스케줄 이동 및 시간 조정
   */
  test.describe('드래그 앤 드롭', () => {
    test.beforeEach(async ({ page }) => {
      await dbHelper.pool.query(`
        INSERT INTO schedules (id, business_id, name, start_time, end_time, days_of_week, created_by)
        VALUES (9001, 9001, '이동 테스트', '10:00:00', '14:00:00', '{"monday": true}', 9000)
      `);
    });

    test('스케줄을 다른 요일로 드래그할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="week-view"]');

      // 월요일 스케줄을 화요일로 드래그
      await page.dragAndDrop(
        '[data-testid="schedule-이동 테스트"]',
        '[data-testid="tuesday-column"] .time-slot-10'
      );

      // 이동 확인 다이얼로그
      await page.click('[data-testid="confirm-move"]');

      // 이동 결과 확인
      await expect(page.locator('[data-testid="tuesday-column"] .schedule-item')).toContainText('이동 테스트');
      await expect(page.locator('[data-testid="monday-column"] .schedule-item')).not.toBeVisible();
    });

    test('스케줄 시간을 드래그로 조정할 수 있어야 한다', async ({ page }) => {
      await page.click('[data-testid="week-view"]');

      // 스케줄 끝시간을 아래로 드래그하여 연장
      await page.dragAndDrop(
        '[data-testid="schedule-이동 테스트"] .resize-handle-bottom',
        '.time-slot-16'
      );

      await page.click('[data-testid="confirm-resize"]');

      // 시간 변경 확인
      await expect(page.locator('text=10:00 - 16:00')).toBeVisible();
    });
  });

  /**
   * 대량 스케줄 관리 테스트
   * 여러 스케줄 동시 처리
   */
  test.describe('대량 스케줄 관리', () => {
    test('여러 스케줄을 선택하여 일괄 삭제할 수 있어야 한다', async ({ page }) => {
      // 여러 스케줄 생성
      for (let i = 1; i <= 5; i++) {
        await dbHelper.pool.query(`
          INSERT INTO schedules (id, business_id, name, start_time, end_time, days_of_week, created_by)
          VALUES (${9000 + i}, 9001, '삭제 테스트 ${i}', '09:00:00', '17:00:00', '{"monday": true}', 9000)
        `);
      }

      await page.reload();

      // 다중 선택 모드 활성화
      await page.click('[data-testid="multi-select-mode"]');

      // 여러 스케줄 선택
      await page.check('[data-testid="select-schedule-9001"]');
      await page.check('[data-testid="select-schedule-9002"]');
      await page.check('[data-testid="select-schedule-9003"]');

      // 일괄 삭제
      await page.click('[data-testid="bulk-delete"]');
      await page.click('[data-testid="confirm-delete"]');

      // 삭제 확인
      await expect(page.locator('text=3개 스케줄이 삭제되었습니다')).toBeVisible();
    });

    test('템플릿에서 일괄 스케줄을 생성할 수 있어야 한다', async ({ page }) => {
      // 템플릿 사용 버튼 클릭
      await page.click('[data-testid="use-template"]');

      // 미리 정의된 템플릿 선택
      await page.selectOption('[data-testid="template-select"]', 'restaurant-shifts');

      // 적용할 날짜 범위 선택
      await page.fill('[data-testid="start-date"]', '2024-01-15');
      await page.fill('[data-testid="end-date"]', '2024-01-21');

      await page.click('[data-testid="apply-template"]');

      // 템플릿 적용 확인
      await expect(page.locator('text=음식점 교대 근무 템플릿이 적용되었습니다')).toBeVisible();
      await expect(page.locator('[data-testid="schedule-오전조"]')).toBeVisible();
      await expect(page.locator('[data-testid="schedule-오후조"]')).toBeVisible();
      await expect(page.locator('[data-testid="schedule-야간조"]')).toBeVisible();
    });

    test('CSV 파일로 스케줄을 일괄 가져올 수 있어야 한다', async ({ page }) => {
      // CSV 파일 업로드 시뮬레이션
      const csvContent = `
        이름,시작시간,종료시간,요일,직원
        "주간 근무1","09:00","17:00","월,화,수,목,금","직원1,직원2"
        "야간 근무1","18:00","02:00","월,화,수,목,금","직원3"
        "주말 근무","10:00","18:00","토,일","직원1,직원3"
      `;

      await page.click('[data-testid="import-csv"]');

      // 파일 선택 시뮬레이션
      await page.setInputFiles('[data-testid="csv-file"]', {
        name: 'schedules.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent)
      });

      await page.click('[data-testid="upload-csv"]');

      // 가져오기 결과 확인
      await expect(page.locator('text=3개 스케줄이 생성되었습니다')).toBeVisible();
      await expect(page.locator('[data-testid="schedule-주간 근무1"]')).toBeVisible();
    });
  });

  /**
   * 권한 관리 테스트
   * 역할별 스케줄 관리 권한
   */
  test.describe('권한 관리', () => {
    test('일반 직원은 스케줄을 조회만 할 수 있어야 한다', async ({ page }) => {
      // 직원으로 다시 로그인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsWorker();
      await page.goto('/schedule');

      // 조회는 가능하지만 편집 불가능 확인
      await expect(page.locator('[data-testid="schedule-list"]')).toBeVisible();
      await expect(page.locator('[data-testid="new-schedule-button"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="edit-schedule"]')).not.toBeVisible();
    });

    test('관리자는 제한적 스케줄 편집이 가능해야 한다', async ({ page }) => {
      // 관리자로 로그인
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.click('[data-testid="confirm-button"]');

      await loginPage.loginAsAdmin();
      await page.goto('/schedule');

      // 스케줄 편집은 가능하지만 삭제 불가능
      await expect(page.locator('[data-testid="edit-schedule"]')).toBeVisible();
      await expect(page.locator('[data-testid="delete-schedule"]')).not.toBeVisible();
    });
  });

  /**
   * 알림 기능 테스트
   * 스케줄 변경 알림
   */
  test.describe('알림 기능', () => {
    test('스케줄 변경 시 해당 직원들에게 알림이 전송되어야 한다', async ({ page }) => {
      // 직원이 배정된 스케줄 수정
      await dbHelper.pool.query(`
        INSERT INTO schedules (id, business_id, name, start_time, end_time, days_of_week, created_by)
        VALUES (9001, 9001, '알림 테스트', '09:00:00', '17:00:00', '{"monday": true}', 9000)
      `);

      await dbHelper.pool.query(`
        INSERT INTO schedule_assignments (schedule_id, user_id, assigned_by)
        VALUES (9001, 9001, 9000)
      `);

      await page.reload();

      // 스케줄 시간 변경
      await page.click('[data-testid="schedule-알림 테스트"]');
      await page.click('[data-testid="edit-schedule"]');
      await page.fill('[data-testid="start-time"]', '08:00');
      await page.click('[data-testid="save-schedule"]');

      // 알림 발송 확인
      await expect(page.locator('.notification-sent')).toBeVisible();
      await expect(page.locator('text=배정된 직원들에게 알림을 전송했습니다')).toBeVisible();

      // 데이터베이스에 알림 저장 확인
      const notifications = await dbHelper.pool.query(
        'SELECT * FROM notifications WHERE user_id = $1 AND type = $2',
        [9001, 'schedule_changed']
      );

      expect(notifications.rows).toHaveLength(1);
    });

    test('스케줄 시작 1시간 전 알림이 설정되어야 한다', async ({ page }) => {
      await page.click('[data-testid="new-schedule-button"]');

      await page.fill('[data-testid="schedule-name"]', '자동 알림 테스트');
      await page.fill('[data-testid="start-time"]', '09:00');
      await page.fill('[data-testid="end-time"]', '17:00');

      // 자동 알림 설정
      await page.check('[data-testid="auto-reminder"]');
      await page.selectOption('[data-testid="reminder-time"]', '60'); // 60분 전

      await page.click('[data-testid="save-schedule"]');

      // 알림 스케줄 설정 확인
      await expect(page.locator('text=시작 1시간 전 자동 알림이 설정되었습니다')).toBeVisible();
    });
  });

  /**
   * 모바일 환경 테스트
   * 터치 인터페이스 지원
   */
  test.describe('모바일 환경', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('모바일에서 캘린더가 적절히 표시되어야 한다', async ({ page }) => {
      // 모바일 캘린더 뷰 확인
      await expect(page.locator('.mobile-calendar')).toBeVisible();

      // 터치 스크롤이 동작하는지 확인
      await page.touchscreen.tap(200, 300);
      await page.touchscreen.tap(200, 400);

      // 스케줄 아이템이 터치하기 적절한 크기인지 확인
      const scheduleItem = page.locator('.schedule-item').first();
      if (await scheduleItem.count() > 0) {
        const boundingBox = await scheduleItem.boundingBox();
        expect(boundingBox.height).toBeGreaterThan(44); // 최소 터치 타겟
      }
    });

    test('모바일에서 스와이프로 주간 네비게이션이 가능해야 한다', async ({ page }) => {
      await page.click('[data-testid="week-view"]');

      // 왼쪽 스와이프 (다음 주)
      await page.touchscreen.swipe(300, 400, 100, 400, 100);

      // 주 변경 확인
      await expect(page.locator('[data-testid="week-header"]')).toContainText('2024년 1월 22일');

      // 오른쪽 스와이프 (이전 주)
      await page.touchscreen.swipe(100, 400, 300, 400, 100);

      await expect(page.locator('[data-testid="week-header"]')).toContainText('2024년 1월 15일');
    });
  });

  /**
   * 성능 테스트
   * 대량 스케줄 처리 성능
   */
  test.describe('성능 테스트', () => {
    test('100개 스케줄이 있어도 캘린더가 3초 이내 로딩되어야 한다', async ({ page }) => {
      // 100개 테스트 스케줄 생성
      const schedules = [];
      for (let i = 1; i <= 100; i++) {
        schedules.push(`(${9000 + i}, 9001, '테스트 스케줄 ${i}', '09:00:00', '17:00:00', '{"monday": true}', 9000)`);
      }

      await dbHelper.pool.query(`
        INSERT INTO schedules (id, business_id, name, start_time, end_time, days_of_week, created_by)
        VALUES ${schedules.join(', ')}
      `);

      const startTime = Date.now();

      // 페이지 새로고침
      await page.reload();

      // 캘린더 로딩 완료 대기
      await expect(page.locator('[data-testid="calendar-loaded"]')).toBeVisible({ timeout: 3000 });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000);
    });
  });
});