/**
 * 근태 이상 항목 감지 E2E 테스트
 *
 * 테스트 시나리오:
 * 1. 중복 체크인 감지
 * 2. 비정상 패턴 감지
 * 3. 위치 이상 감지
 * 4. 시간 이상 감지
 * 5. 알림 및 보고
 */

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { AttendancePage } = require('../pages/AttendancePage');
const { testUsers, testBusinesses } = require('../fixtures/users');
const {
  waitForElement,
  waitForApiResponse,
  simulateMultipleCheckins,
  mockSystemTime
} = require('../helpers/test-helpers');

test.describe('근태 이상 항목 감지', () => {
  let loginPage;
  let attendancePage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    attendancePage = new AttendancePage(page);
  });

  test.describe('중복 체크인 감지', () => {
    test('동시 다중 기기 체크인 방지', async ({ page, browser }) => {
      // 첫 번째 브라우저에서 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 두 번째 브라우저 컨텍스트 생성
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      const loginPage2 = new LoginPage(page2);

      // 두 번째 브라우저에서도 같은 계정으로 로그인
      await loginPage2.goto();
      await loginPage2.login(testUsers.worker.email, testUsers.worker.password);
      await page2.waitForURL('**/dashboard');

      // 첫 번째 브라우저에서 체크인
      await page.click('nav >> text=근태 관리');
      await page.click('button:has-text("GPS 출근")');
      await expect(page.locator('.toast-success')).toContainText('출근 처리되었습니다');

      // 두 번째 브라우저에서 체크인 시도
      await page2.click('nav >> text=근태 관리');
      await page2.click('button:has-text("GPS 출근")');

      // 중복 체크인 오류
      await expect(page2.locator('.toast-error')).toContainText('이미 출근 처리되었습니다');

      // 이상 항목 로그 생성 확인
      await expect(page2.locator('.anomaly-warning')).toContainText('중복 체크인 시도가 감지되었습니다');

      // 정리
      await context2.close();
    });

    test('짧은 시간 내 반복 체크인/아웃', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 출근
      await page.click('button:has-text("GPS 출근")');
      await expect(page.locator('.attendance-status')).toContainText('근무 중');

      // 1분 후 퇴근 시도
      await page.clock.fastForward('00:01:00');
      await page.click('button:has-text("GPS 퇴근")');

      // 비정상 패턴 경고
      await expect(page.locator('.pattern-warning')).toContainText('비정상적으로 짧은 근무 시간');

      // 확인 요청
      await expect(page.locator('.confirm-dialog')).toContainText('1분만 근무하고 퇴근하시겠습니까?');

      // 관리자 알림 생성 확인
      await page.click('.confirm-dialog >> button:has-text("확인")');
      await expect(page.locator('.notification-sent')).toContainText('관리자에게 알림이 전송되었습니다');
    });

    test('프록시 체크인 감지', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 이상 감지 대시보드로 이동
      await page.click('nav >> text=이상 감지');

      // 프록시 체크인 의심 케이스
      await expect(page.locator('.proxy-checkin-section')).toBeVisible();
      await expect(page.locator('.suspected-proxy')).toHaveCount.greaterThan(0);

      // 상세 분석
      await page.click('.suspected-proxy').first();

      // 감지 근거 표시
      await expect(page.locator('.detection-reasons')).toBeVisible();
      await expect(page.locator('.same-device-multiple-users')).toContainText('동일 기기 다중 사용자');
      await expect(page.locator('.rapid-location-change')).toContainText('급격한 위치 변경');

      // 조치 옵션
      await expect(page.locator('button:has-text("체크인 무효화")')).toBeVisible();
      await expect(page.locator('button:has-text("경고 발송")')).toBeVisible();
    });
  });

  test.describe('패턴 이상 감지', () => {
    test('비정상 출퇴근 시간 패턴', async ({ page }) => {
      // 직원으로 로그인 (새벽 3시로 시간 설정)
      await page.clock.setFixedTime(new Date('2024-01-15 03:00:00'));

      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 새벽 출근 시도
      await page.click('button:has-text("GPS 출근")');

      // 비정상 시간 경고
      await expect(page.locator('.unusual-time-warning')).toContainText('비정상적인 출근 시간');
      await expect(page.locator('.usual-pattern')).toContainText('평소 출근 시간: 오전 8-10시');

      // 사유 입력 요구
      await expect(page.locator('.reason-required')).toBeVisible();
      await expect(page.locator('textarea[name="unusualReason"]')).toBeVisible();

      // 사유 입력 및 제출
      await page.fill('textarea[name="unusualReason"]', '야간 재고 정리');
      await page.click('button:has-text("사유 제출 및 출근")');

      // 기록 저장 확인
      await expect(page.locator('.toast-success')).toContainText('특이사항이 기록되었습니다');
    });

    test('주말/휴일 비정상 근무', async ({ page }) => {
      // 일요일로 시간 설정
      await page.clock.setFixedTime(new Date('2024-01-14 09:00:00')); // Sunday

      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 휴일 근무 확인
      await expect(page.locator('.holiday-notice')).toContainText('오늘은 휴일입니다');

      // 출근 시도
      await page.click('button:has-text("GPS 출근")');

      // 휴일 근무 확인 다이얼로그
      await expect(page.locator('.holiday-work-confirm')).toBeVisible();
      await expect(page.locator('.holiday-work-confirm')).toContainText('휴일 근무');
      await expect(page.locator('.overtime-rate')).toContainText('휴일 수당 적용');

      // 관리자 승인 필요 안내
      await expect(page.locator('.approval-required')).toContainText('관리자 승인 필요');
    });

    test('연속 장시간 근무 감지', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 이상 감지 대시보드
      await page.click('nav >> text=이상 감지');
      await page.click('tab:has-text("근무 시간 이상")');

      // 장시간 근무자 목록
      await expect(page.locator('.long-work-hours-list')).toBeVisible();
      await expect(page.locator('.overtime-worker')).toHaveCount.greaterThan(0);

      // 첫 번째 케이스 확인
      const firstWorker = page.locator('.overtime-worker').first();
      await expect(firstWorker.locator('.consecutive-days')).toContainText('연속 근무일');
      await expect(firstWorker.locator('.total-hours')).toContainText('누적 시간');

      // 법적 제한 경고
      await expect(firstWorker.locator('.legal-warning')).toContainText('근로기준법 위반 위험');

      // 조치 버튼
      await expect(firstWorker.locator('button:has-text("휴무 권고")')).toBeVisible();
      await expect(firstWorker.locator('button:has-text("스케줄 조정")')).toBeVisible();
    });
  });

  test.describe('위치 이상 감지', () => {
    test('불가능한 이동 속도 감지', async ({ page, context }) => {
      // GPS 권한 부여
      await context.grantPermissions(['geolocation']);

      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.mobileWorker.email, testUsers.mobileWorker.password);
      await page.waitForURL('**/dashboard');

      // 첫 번째 위치에서 체크인
      await context.setGeolocation({
        latitude: 37.5665,
        longitude: 126.9780
      });

      await page.click('nav >> text=근태 관리');
      await page.click('button:has-text("GPS 출근")');

      // 5분 후 매우 먼 위치에서 체크 시도
      await page.clock.fastForward('00:05:00');
      await context.setGeolocation({
        latitude: 35.1796, // 부산 (서울에서 300km+)
        longitude: 129.0756
      });

      await page.click('button:has-text("위치 업데이트")');

      // 불가능한 이동 감지
      await expect(page.locator('.impossible-movement-alert')).toBeVisible();
      await expect(page.locator('.movement-details')).toContainText('5분 동안 300km 이동은 불가능');

      // 위치 검증 실패
      await expect(page.locator('.location-verification-failed')).toContainText('위치 검증 실패');

      // 관리자 검토 요청
      await expect(page.locator('.review-requested')).toContainText('관리자 검토 대기');
    });

    test('지오펜싱 경계 위반', async ({ page, context }) => {
      // GPS 권한 부여
      await context.grantPermissions(['geolocation']);

      // 이동 근무자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.mobileWorker.email, testUsers.mobileWorker.password);
      await page.waitForURL('**/dashboard');

      // 허용된 지역 외부 위치 설정
      await context.setGeolocation({
        latitude: 33.4996, // 제주도
        longitude: 126.5312
      });

      // 체크인 시도
      await page.click('nav >> text=근태 관리');
      await page.click('button:has-text("GPS 출근")');

      // 지오펜싱 위반 경고
      await expect(page.locator('.geofencing-violation')).toBeVisible();
      await expect(page.locator('.allowed-regions')).toContainText('허용된 근무 지역');

      // 특별 승인 요청
      await page.click('button:has-text("특별 승인 요청")');

      // 승인 요청 폼
      await expect(page.locator('.approval-request-form')).toBeVisible();
      await page.fill('textarea[name="reason"]', '제주 지점 임시 지원');
      await page.click('button:has-text("승인 요청 제출")');

      // 요청 전송 확인
      await expect(page.locator('.toast-info')).toContainText('승인 요청이 전송되었습니다');
    });

    test('GPS 스푸핑 감지', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 보안 대시보드로 이동
      await page.click('nav >> text=보안');
      await page.click('tab:has-text("GPS 무결성")');

      // GPS 스푸핑 의심 케이스
      await expect(page.locator('.gps-spoofing-alerts')).toBeVisible();
      await expect(page.locator('.suspected-spoofing')).toHaveCount.greaterThan(0);

      // 상세 분석
      await page.click('.suspected-spoofing').first();

      // 스푸핑 지표
      await expect(page.locator('.spoofing-indicators')).toBeVisible();
      await expect(page.locator('.accuracy-mismatch')).toContainText('정확도 불일치');
      await expect(page.locator('.provider-anomaly')).toContainText('GPS 제공자 이상');
      await expect(page.locator('.mock-location-detected')).toContainText('모의 위치 감지');

      // 조치 옵션
      await expect(page.locator('button:has-text("계정 조사")')).toBeVisible();
      await expect(page.locator('button:has-text("GPS 체크인 비활성화")')).toBeVisible();
    });
  });

  test.describe('시간 조작 감지', () => {
    test('클라이언트 시간 조작 방지', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 클라이언트 시간을 과거로 조작
      await page.evaluate(() => {
        // 시스템 시간을 1시간 전으로 조작 시도
        const originalDate = Date;
        window.Date = class extends originalDate {
          constructor() {
            super();
            return new originalDate(super.getTime() - 3600000);
          }
          static now() {
            return originalDate.now() - 3600000;
          }
        };
      });

      // 체크인 시도
      await page.click('nav >> text=근태 관리');
      await page.click('button:has-text("GPS 출근")');

      // 시간 불일치 감지
      await expect(page.locator('.time-mismatch-error')).toBeVisible();
      await expect(page.locator('.time-mismatch-error')).toContainText('클라이언트 시간 불일치');

      // 서버 시간 사용 안내
      await expect(page.locator('.server-time-notice')).toContainText('서버 시간 기준으로 처리됩니다');
    });

    test('미래 시간 체크인 차단', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 미래 시간으로 조작 시도
      await page.evaluate(() => {
        // API 호출 시 미래 시간 전송 시도
        window.tamperWithTime = true;
      });

      // 체크인 API 호출 가로채기
      await page.route('**/api/attendance/checkin', async route => {
        const request = route.request();
        const postData = request.postDataJSON();

        // 미래 시간으로 변경
        postData.timestamp = Date.now() + 3600000;

        await route.continue({ postData: JSON.stringify(postData) });
      });

      // 체크인 시도
      await page.click('nav >> text=근태 관리');
      await page.click('button:has-text("GPS 출근")');

      // 미래 시간 거부
      await expect(page.locator('.toast-error')).toContainText('유효하지 않은 시간');
      await expect(page.locator('.security-alert')).toContainText('보안 위반 시도가 기록되었습니다');
    });
  });

  test.describe('알림 및 보고', () => {
    test('실시간 이상 항목 알림', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 알림 설정 페이지로 이동
      await page.click('nav >> text=설정');
      await page.click('text=알림 설정');

      // 이상 항목 알림 설정
      await page.click('tab:has-text("이상 감지")');

      // 알림 유형 선택
      await page.check('input[name="duplicateCheckin"]');
      await page.check('input[name="abnormalPattern"]');
      await page.check('input[name="locationAnomaly"]');
      await page.check('input[name="timeManipulation"]');

      // 알림 채널 설정
      await page.check('input[name="emailNotification"]');
      await page.check('input[name="pushNotification"]');
      await page.check('input[name="smsNotification"]');

      // 임계값 설정
      await page.fill('input[name="alertThreshold"]', '3');
      await page.selectOption('select[name="alertSeverity"]', 'high');

      // 저장
      await page.click('button:has-text("알림 설정 저장")');
      await expect(page.locator('.toast-success')).toContainText('알림 설정이 저장되었습니다');

      // 실시간 알림 테스트
      await page.click('button:has-text("테스트 알림 발송")');
      await expect(page.locator('.test-notification')).toContainText('테스트 알림이 발송되었습니다');
    });

    test('일일 이상 항목 보고서', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 보고서 페이지로 이동
      await page.click('nav >> text=보고서');
      await page.click('tab:has-text("이상 감지")');

      // 일일 보고서 생성
      await page.click('button:has-text("일일 보고서")');

      // 보고서 내용 확인
      await expect(page.locator('.daily-anomaly-report')).toBeVisible();

      // 섹션별 내용
      await expect(page.locator('.summary-section')).toContainText('오늘의 이상 항목 요약');
      await expect(page.locator('.critical-alerts')).toContainText('중요 경고');
      await expect(page.locator('.pattern-analysis')).toContainText('패턴 분석');
      await expect(page.locator('.recommendations')).toContainText('권장 조치사항');

      // 상세 목록
      await expect(page.locator('.anomaly-list-table')).toBeVisible();
      await expect(page.locator('.anomaly-row')).toHaveCount.greaterThan(0);

      // 보고서 내보내기
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('button:has-text("PDF로 내보내기")')
      ]);

      expect(download.suggestedFilename()).toMatch(/daily-anomaly-report.*\.pdf/);
    });

    test('주간 트렌드 분석', async ({ page }) => {
      // Owner로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.owner.email, testUsers.owner.password);
      await page.waitForURL('**/dashboard');

      // 분석 대시보드로 이동
      await page.click('nav >> text=분석');
      await page.click('tab:has-text("이상 패턴")');

      // 주간 트렌드 선택
      await page.click('button:has-text("주간 분석")');

      // 트렌드 차트 표시
      await expect(page.locator('.weekly-trend-chart')).toBeVisible();

      // 주요 지표
      await expect(page.locator('.anomaly-frequency')).toContainText('이상 빈도');
      await expect(page.locator('.detection-rate')).toContainText('감지율');
      await expect(page.locator('.false-positive-rate')).toContainText('오탐률');

      // 카테고리별 분포
      await expect(page.locator('.category-distribution')).toBeVisible();
      await expect(page.locator('.pie-chart')).toBeVisible();

      // 개선 추이
      await expect(page.locator('.improvement-metrics')).toBeVisible();
      await expect(page.locator('.week-over-week')).toContainText('전주 대비');
    });

    test('자동 학습 및 개선', async ({ page }) => {
      // Owner로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.owner.email, testUsers.owner.password);
      await page.waitForURL('**/dashboard');

      // AI 설정 페이지로 이동
      await page.click('nav >> text=설정');
      await page.click('text=AI 감지 설정');

      // 학습 모드 설정
      await expect(page.locator('.learning-mode')).toBeVisible();

      // 오탐 피드백
      await page.click('tab:has-text("오탐 관리")');
      await expect(page.locator('.false-positive-list')).toBeVisible();

      // 오탐으로 표시
      const falsePositive = page.locator('.potential-false-positive').first();
      await falsePositive.click();
      await page.click('button:has-text("오탐으로 표시")');

      // 학습 확인
      await expect(page.locator('.learning-notification')).toContainText('패턴이 학습되었습니다');

      // 감지 규칙 조정
      await page.click('tab:has-text("규칙 설정")');
      await page.fill('input[name="minWorkHours"]', '0.5');
      await page.fill('input[name="maxDailyHours"]', '12');

      // 규칙 저장
      await page.click('button:has-text("규칙 업데이트")');
      await expect(page.locator('.toast-success')).toContainText('감지 규칙이 업데이트되었습니다');
    });
  });
});