/**
 * 스케줄 알림 E2E 테스트
 *
 * 테스트 시나리오:
 * 1. 스케줄 생성 알림
 * 2. 스케줄 변경 알림
 * 3. 리마인더 알림
 * 4. 긴급 알림
 * 5. 알림 설정 관리
 */

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { SchedulePage } = require('../pages/SchedulePage');
const { testUsers, testBusinesses } = require('../fixtures/users');
const {
  DatabaseHelper,
  networkHelpers,
  utils
} = require('../helpers/test-helpers');

test.describe('스케줄 알림', () => {
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

  test.describe('스케줄 생성 알림', () => {
    test('새 스케줄 할당 알림', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 생성 페이지로 이동
      await page.click('nav >> text=스케줄 관리');
      await page.click('button:has-text("새 스케줄")');

      // 스케줄 정보 입력
      await page.fill('input[name="scheduleName"]', '긴급 근무');
      await page.fill('input[name="scheduleDate"]', new Date().toISOString().split('T')[0]);
      await page.fill('input[name="startTime"]', '14:00');
      await page.fill('input[name="endTime"]', '22:00');

      // 직원 선택
      await page.click('button:has-text("직원 선택")');
      await page.check('.employee-checkbox').nth(0);
      await page.check('.employee-checkbox').nth(1);

      // 알림 옵션 설정
      await page.check('input[name="sendNotification"]');
      await page.selectOption('select[name="notificationType"]', 'immediate');

      // 알림 메시지 커스터마이징
      await page.fill('textarea[name="notificationMessage"]', '긴급 근무 일정이 추가되었습니다. 확인 부탁드립니다.');

      // 스케줄 생성
      await page.click('button:has-text("스케줄 생성")');

      // 알림 발송 확인
      await expect(page.locator('.notification-sent')).toBeVisible();
      await expect(page.locator('.notification-sent')).toContainText('2명에게 알림이 발송되었습니다');

      // 알림 로그 확인
      await page.click('tab:has-text("알림 이력")');
      await expect(page.locator('.notification-log')).toContainText('스케줄 생성 알림');
      await expect(page.locator('.notification-recipients')).toContainText('2명');
    });

    test('다중 채널 알림 발송', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 생성 페이지로 이동
      await page.click('nav >> text=스케줄 관리');
      await page.click('button:has-text("새 스케줄")');

      // 기본 정보 입력
      await page.fill('input[name="scheduleName"]', '주말 특별 근무');

      // 알림 채널 설정
      await page.click('button:has-text("알림 설정")');

      // 다중 채널 선택
      await page.check('input[name="pushNotification"]');
      await page.check('input[name="emailNotification"]');
      await page.check('input[name="smsNotification"]');
      await page.check('input[name="inAppNotification"]');

      // 채널별 메시지 설정
      await page.fill('textarea[name="pushMessage"]', '새로운 근무 일정이 등록되었습니다.');
      await page.fill('textarea[name="emailSubject"]', '[DOT] 근무 일정 안내');
      await page.fill('textarea[name="smsMessage"]', '근무일정: 주말 특별근무 배정');

      // 발송 시간 설정
      await page.selectOption('select[name="sendTiming"]', 'scheduled');
      await page.fill('input[name="scheduledTime"]', '18:00');

      // 스케줄 생성 및 알림 예약
      await page.click('button:has-text("생성 및 알림 예약")');

      // 예약 확인
      await expect(page.locator('.scheduled-notification')).toBeVisible();
      await expect(page.locator('.scheduled-notification')).toContainText('18:00에 발송 예정');
    });

    test('그룹 알림 발송', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리 페이지로 이동
      await page.click('nav >> text=스케줄 관리');

      // 팀 전체 스케줄 생성
      await page.click('button:has-text("팀 스케줄")');

      // 팀 선택
      await page.selectOption('select[name="teamId"]', 'kitchen-team');

      // 스케줄 정보
      await page.fill('input[name="scheduleName"]', '주방팀 전체 회의');
      await page.fill('input[name="scheduleDate"]', new Date().toISOString().split('T')[0]);
      await page.fill('input[name="startTime"]', '15:00');
      await page.fill('input[name="endTime"]', '16:00');

      // 그룹 알림 설정
      await page.check('input[name="groupNotification"]');
      await page.selectOption('select[name="notificationPriority"]', 'high');

      // 생성
      await page.click('button:has-text("팀 스케줄 생성")');

      // 그룹 알림 발송 확인
      await expect(page.locator('.group-notification-sent')).toBeVisible();
      await expect(page.locator('.team-members-notified')).toContainText('주방팀 전체');
    });
  });

  test.describe('스케줄 변경 알림', () => {
    test('시간 변경 알림', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 기존 스케줄 수정
      await page.click('nav >> text=스케줄 관리');
      await page.click('.schedule-item').first();
      await page.click('button:has-text("편집")');

      // 시간 변경
      const originalTime = await page.inputValue('input[name="startTime"]');
      await page.fill('input[name="startTime"]', '10:00'); // 변경된 시작 시간

      // 변경 알림 설정
      await page.check('input[name="notifyChanges"]');
      await page.fill('textarea[name="changeReason"]', '고객 요청으로 인한 시간 조정');

      // 저장
      await page.click('button:has-text("변경사항 저장")');

      // 변경 알림 발송 확인
      await expect(page.locator('.change-notification')).toBeVisible();
      await expect(page.locator('.change-details')).toContainText(`${originalTime} → 10:00`);

      // 영향받는 직원 목록
      await expect(page.locator('.affected-employees')).toBeVisible();
      await expect(page.locator('.notification-status')).toContainText('발송 완료');
    });

    test('스케줄 취소 알림', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 스케줄 관리로 이동
      await page.click('nav >> text=스케줄 관리');

      // 스케줄 선택
      await page.click('.schedule-item').first();

      // 취소 버튼 클릭
      await page.click('button:has-text("스케줄 취소")');

      // 취소 사유 입력
      await expect(page.locator('.cancel-dialog')).toBeVisible();
      await page.fill('textarea[name="cancelReason"]', '날씨 악화로 인한 영업 중단');

      // 긴급 알림 옵션
      await page.check('input[name="urgentNotification"]');
      await page.check('input[name="sendSMS"]'); // SMS도 발송

      // 취소 확인
      await page.click('button:has-text("취소 진행")');

      // 긴급 알림 발송 확인
      await expect(page.locator('.urgent-notification-sent')).toBeVisible();
      await expect(page.locator('.notification-channels')).toContainText('푸시, SMS');

      // 읽음 확인 추적
      await expect(page.locator('.read-receipt-tracking')).toBeVisible();
    });

    test('대체 인력 요청 알림', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 내 스케줄로 이동
      await page.click('nav >> text=내 스케줄');

      // 스케줄 선택
      await page.click('.my-schedule-item').first();

      // 대체 요청
      await page.click('button:has-text("대체 요청")');

      // 대체 요청 폼
      await expect(page.locator('.substitute-request-form')).toBeVisible();

      // 사유 입력
      await page.fill('textarea[name="requestReason"]', '가족 경조사');

      // 희망 대체자 선택 (선택사항)
      await page.click('button:has-text("대체자 제안")');
      await page.check('.substitute-suggestion').first();

      // 요청 제출
      await page.click('button:has-text("대체 요청 제출")');

      // 알림 발송 확인
      await expect(page.locator('.substitute-notification')).toBeVisible();
      await expect(page.locator('.notification-recipients')).toContainText('관리자');
      await expect(page.locator('.notification-recipients')).toContainText('가능한 대체 인력');

      // 요청 상태 추적
      await expect(page.locator('.request-status')).toContainText('대기 중');
    });
  });

  test.describe('리마인더 알림', () => {
    test('출근 전 리마인더', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 알림 설정으로 이동
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=알림 설정');

      // 리마인더 설정 섹션
      await page.click('tab:has-text("리마인더")');

      // 출근 리마인더 활성화
      await page.check('input[name="enableWorkReminder"]');

      // 리마인더 시간 설정
      await page.selectOption('select[name="reminderTiming"]', '30'); // 30분 전

      // 리마인더 방법 선택
      await page.check('input[name="pushReminder"]');
      await page.check('input[name="emailReminder"]');

      // 저장
      await page.click('button:has-text("설정 저장")');

      // 테스트 리마인더 발송
      await page.click('button:has-text("테스트 리마인더")');

      // 테스트 알림 확인
      await expect(page.locator('.test-reminder-sent')).toBeVisible();
      await expect(page.locator('.reminder-preview')).toContainText('30분 후 근무 시작');
    });

    test('일일 스케줄 요약 알림', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 알림 설정
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=알림 설정');

      // 일일 요약 설정
      await page.click('tab:has-text("일일 요약")');

      // 요약 알림 활성화
      await page.check('input[name="enableDailySummary"]');

      // 발송 시간 설정
      await page.fill('input[name="summaryTime"]', '07:00');

      // 포함 내용 선택
      await page.check('input[name="includeTodaySchedule"]');
      await page.check('input[name="includeTomorrowSchedule"]');
      await page.check('input[name="includeTeamSchedule"]');
      await page.check('input[name="includeAnnouncements"]');

      // 저장
      await page.click('button:has-text("설정 저장")');

      // 샘플 요약 보기
      await page.click('button:has-text("샘플 보기")');

      // 샘플 요약 확인
      await expect(page.locator('.summary-preview')).toBeVisible();
      await expect(page.locator('.today-schedule-preview')).toContainText('오늘의 근무');
      await expect(page.locator('.tomorrow-schedule-preview')).toContainText('내일의 근무');
    });

    test('주간 스케줄 알림', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 알림 설정
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=알림 설정');

      // 주간 알림 설정
      await page.click('tab:has-text("주간 알림")');

      // 주간 알림 활성화
      await page.check('input[name="enableWeeklySummary"]');

      // 발송 요일 선택
      await page.selectOption('select[name="weeklyDay"]', 'sunday'); // 일요일

      // 발송 시간 설정
      await page.fill('input[name="weeklyTime"]', '20:00');

      // 저장
      await page.click('button:has-text("설정 저장")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('주간 알림이 설정되었습니다');
    });
  });

  test.describe('긴급 알림', () => {
    test('즉시 출근 요청 알림', async ({ page, context }) => {
      // 두 개의 브라우저 컨텍스트 (관리자, 직원)
      const managerPage = page;
      const workerContext = await context.browser().newContext();
      const workerPage = await workerContext.newPage();

      // 관리자 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await managerPage.waitForURL('**/dashboard');

      // 직원 로그인
      const workerLoginPage = new LoginPage(workerPage);
      await workerLoginPage.goto();
      await workerLoginPage.login(testUsers.worker.email, testUsers.worker.password);
      await workerPage.waitForURL('**/dashboard');

      // 관리자: 긴급 출근 요청
      await managerPage.click('nav >> text=긴급 요청');
      await managerPage.click('button:has-text("긴급 출근 요청")');

      // 직원 선택
      await managerPage.check('.available-worker').first();

      // 긴급 메시지 입력
      await managerPage.fill('textarea[name="urgentMessage"]', '고객 급증으로 즉시 출근 필요');

      // 인센티브 설정
      await managerPage.check('input[name="offerIncentive"]');
      await managerPage.fill('input[name="incentiveAmount"]', '20000');

      // 발송
      await managerPage.click('button:has-text("긴급 요청 발송")');

      // 직원: 실시간 알림 수신
      await workerPage.waitForTimeout(1000);
      await expect(workerPage.locator('.urgent-notification-popup')).toBeVisible();
      await expect(workerPage.locator('.urgent-message')).toContainText('즉시 출근 필요');
      await expect(workerPage.locator('.incentive-info')).toContainText('20,000원');

      // 직원: 응답
      await workerPage.click('button:has-text("수락")');

      // 관리자: 응답 확인
      await managerPage.waitForTimeout(1000);
      await expect(managerPage.locator('.response-received')).toBeVisible();
      await expect(managerPage.locator('.accepted-workers')).toContainText('1명 수락');

      // 정리
      await workerContext.close();
    });

    test('비상 상황 전체 알림', async ({ page }) => {
      // Owner로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.owner.email, testUsers.owner.password);
      await page.waitForURL('**/dashboard');

      // 비상 알림 페이지
      await page.click('nav >> text=비상 관리');
      await page.click('button:has-text("비상 알림")');

      // 비상 상황 유형 선택
      await page.selectOption('select[name="emergencyType"]', 'natural_disaster');

      // 메시지 입력
      await page.fill('textarea[name="emergencyMessage"]',
        '태풍 경보로 인해 오늘 영업을 중단합니다. 직원 여러분은 안전한 곳에서 대기해주세요.');

      // 대상 선택
      await page.check('input[name="notifyAllEmployees"]');
      await page.check('input[name="notifyCustomers"]'); // 고객도 포함

      // 다중 채널 발송
      await page.check('input[name="useSMS"]');
      await page.check('input[name="usePush"]');
      await page.check('input[name="useEmail"]');
      await page.check('input[name="usePhoneCall"]'); // 음성 통화

      // 발송 확인
      await page.click('button:has-text("비상 알림 발송")');

      // 2차 확인
      await expect(page.locator('.emergency-confirm')).toBeVisible();
      await page.fill('input[name="confirmCode"]', 'EMERGENCY');
      await page.click('button:has-text("최종 발송")');

      // 발송 결과
      await expect(page.locator('.emergency-sent')).toBeVisible();
      await expect(page.locator('.total-recipients')).toContainText('전체 직원');
      await expect(page.locator('.delivery-status')).toContainText('발송 중');
    });

    test('스케줄 충돌 긴급 해결 알림', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 알림 센터에서 충돌 확인
      await page.click('button[aria-label="알림"]');

      // 충돌 알림 클릭
      await page.click('.conflict-alert').first();

      // 충돌 상세 정보
      await expect(page.locator('.conflict-detail-modal')).toBeVisible();
      await expect(page.locator('.conflict-type')).toContainText('인력 부족');
      await expect(page.locator('.shortage-info')).toContainText('2명 부족');

      // 해결 방안 선택
      await page.click('button:has-text("대체 인력 요청")');

      // 가능한 직원 목록
      await expect(page.locator('.available-substitutes')).toBeVisible();

      // 직원 선택 및 요청
      await page.check('.substitute-candidate').nth(0);
      await page.check('.substitute-candidate').nth(1);

      // 긴급 요청 발송
      await page.click('button:has-text("긴급 대체 요청")');

      // 발송 확인
      await expect(page.locator('.urgent-request-sent')).toBeVisible();
      await expect(page.locator('.request-tracking')).toContainText('응답 대기 중');
    });
  });

  test.describe('알림 설정 관리', () => {
    test('개인 알림 선호도 설정', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 알림 설정 페이지
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=알림 설정');

      // 알림 유형별 설정
      await page.click('tab:has-text("알림 유형")');

      // 스케줄 알림
      await page.check('input[name="scheduleCreated"]');
      await page.check('input[name="scheduleModified"]');
      await page.uncheck('input[name="scheduleDeleted"]'); // 삭제는 받지 않음

      // 근태 알림
      await page.check('input[name="attendanceReminder"]');
      await page.uncheck('input[name="overtimeAlert"]');

      // 공지사항
      await page.check('input[name="importantAnnouncements"]');
      await page.uncheck('input[name="generalAnnouncements"]');

      // 저장
      await page.click('button:has-text("선호도 저장")');

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('알림 설정이 저장되었습니다');
    });

    test('방해 금지 시간 설정', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 알림 설정
      await page.click('button[aria-label="프로필 메뉴"]');
      await page.click('text=알림 설정');

      // 방해 금지 설정
      await page.click('tab:has-text("방해 금지")');

      // 방해 금지 활성화
      await page.check('input[name="enableDoNotDisturb"]');

      // 시간 설정
      await page.fill('input[name="dndStartTime"]', '22:00');
      await page.fill('input[name="dndEndTime"]', '08:00');

      // 예외 설정
      await page.check('input[name="allowEmergency"]'); // 긴급 알림은 허용
      await page.check('input[name="allowManagerCalls"]'); // 관리자 연락은 허용

      // 주말 설정
      await page.check('input[name="weekendDND"]');

      // 저장
      await page.click('button:has-text("설정 저장")');

      // 확인
      await expect(page.locator('.dnd-status')).toContainText('방해 금지 설정됨');
    });

    test('알림 이력 및 관리', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 알림 센터
      await page.click('button[aria-label="알림"]');

      // 알림 이력 탭
      await page.click('tab:has-text("이력")');

      // 필터링
      await page.selectOption('select[name="notificationType"]', 'schedule');
      await page.selectOption('select[name="dateRange"]', 'last_week');

      // 알림 목록 확인
      await expect(page.locator('.notification-history')).toBeVisible();
      await expect(page.locator('.notification-item')).toHaveCount.greaterThan(0);

      // 읽지 않은 알림 일괄 처리
      await page.click('button:has-text("모두 읽음")');

      // 알림 삭제
      await page.click('.notification-item').first();
      await page.click('button:has-text("삭제")');

      // 삭제 확인
      await expect(page.locator('.toast-success')).toContainText('알림이 삭제되었습니다');

      // 알림 통계
      await page.click('tab:has-text("통계")');
      await expect(page.locator('.notification-stats')).toBeVisible();
      await expect(page.locator('.total-received')).toContainText('총 수신');
      await expect(page.locator('.average-response-time')).toContainText('평균 응답 시간');
    });

    test('팀 알림 정책 설정 (관리자)', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 팀 설정으로 이동
      await page.click('nav >> text=팀 관리');
      await page.click('tab:has-text("알림 정책")');

      // 기본 알림 정책
      await page.selectOption('select[name="defaultNotificationMethod"]', 'push_first');

      // 알림 우선순위
      await page.fill('input[name="highPriorityThreshold"]', '1'); // 1시간 이내 응답
      await page.fill('input[name="mediumPriorityThreshold"]', '6'); // 6시간 이내
      await page.fill('input[name="lowPriorityThreshold"]', '24'); // 24시간 이내

      // 에스컬레이션 규칙
      await page.check('input[name="enableEscalation"]');
      await page.fill('input[name="escalationTime"]', '30'); // 30분 무응답시
      await page.selectOption('select[name="escalationTarget"]', 'manager');

      // 자동 재발송
      await page.check('input[name="autoRetry"]');
      await page.fill('input[name="retryCount"]', '3');
      await page.fill('input[name="retryInterval"]', '10'); // 10분 간격

      // 저장
      await page.click('button:has-text("정책 저장")');

      // 팀원에게 적용
      await page.click('button:has-text("팀원에게 적용")');

      // 확인
      await expect(page.locator('.policy-applied')).toContainText('팀 전체에 적용되었습니다');
    });
  });
});