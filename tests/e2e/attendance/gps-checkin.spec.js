/**
 * GPS 기반 체크인/체크아웃 E2E 테스트
 *
 * 테스트 시나리오:
 * 1. GPS 권한 요청 및 처리
 * 2. 위치 기반 출근 체크인
 * 3. 위치 기반 퇴근 체크아웃
 * 4. 위치 범위 검증
 * 5. GPS 오류 처리
 */

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { AttendancePage } = require('../pages/AttendancePage');
const { testUsers, testBusinesses } = require('../fixtures/users');
const {
  waitForElement,
  waitForApiResponse,
  mockGeolocation
} = require('../helpers/test-helpers');

test.describe('GPS 기반 체크인/체크아웃', () => {
  let loginPage;
  let attendancePage;

  test.beforeEach(async ({ page, context }) => {
    loginPage = new LoginPage(page);
    attendancePage = new AttendancePage(page);

    // 기본 위치 권한 설정
    await context.grantPermissions(['geolocation']);
  });

  test.describe('GPS 권한 처리', () => {
    test('위치 권한 요청 및 허용', async ({ page, context }) => {
      // 위치 권한 취소
      await context.clearPermissions();

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 체크인 버튼 클릭
      await page.click('button:has-text("GPS 출근")');

      // 권한 요청 메시지 확인
      await expect(page.locator('.permission-request')).toContainText('위치 권한이 필요합니다');

      // 권한 허용
      await context.grantPermissions(['geolocation']);
      await page.click('button:has-text("권한 허용")');

      // 위치 정보 로딩 확인
      await expect(page.locator('.location-status')).toContainText('위치 확인 중');
    });

    test('위치 권한 거부 처리', async ({ page, context }) => {
      // 위치 권한 거부
      await context.clearPermissions();

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 체크인 시도
      await page.click('button:has-text("GPS 출근")');

      // 대체 방법 제안 확인
      await expect(page.locator('.fallback-options')).toBeVisible();
      await expect(page.locator('.fallback-options')).toContainText('QR 코드 체크인');
    });
  });

  test.describe('정상 체크인/체크아웃', () => {
    test('사업장 범위 내 GPS 출근', async ({ page, context }) => {
      // 사업장 위치로 GPS 설정
      const businessLocation = testBusinesses.restaurant.location;
      await context.setGeolocation({
        latitude: businessLocation.lat,
        longitude: businessLocation.lng
      });

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 출근 버튼 클릭
      const checkinResponse = waitForApiResponse(page, '/api/attendance/checkin');
      await page.click('button:has-text("GPS 출근")');

      // API 응답 대기
      const response = await checkinResponse;
      expect(response.status()).toBe(200);

      // 성공 메시지 확인
      await expect(page.locator('.toast-success')).toContainText('출근 처리되었습니다');

      // 출근 상태 확인
      await expect(page.locator('.attendance-status')).toContainText('근무 중');

      // 출근 시간 표시 확인
      await expect(page.locator('.checkin-time')).toBeVisible();
    });

    test('GPS 퇴근 처리', async ({ page, context }) => {
      // 사업장 위치로 GPS 설정
      const businessLocation = testBusinesses.restaurant.location;
      await context.setGeolocation({
        latitude: businessLocation.lat,
        longitude: businessLocation.lng
      });

      // 로그인 (이미 출근한 상태의 사용자)
      await loginPage.goto();
      await loginPage.login(testUsers.checkedInWorker.email, testUsers.checkedInWorker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 근무 중 상태 확인
      await expect(page.locator('.attendance-status')).toContainText('근무 중');

      // GPS 퇴근 버튼 클릭
      const checkoutResponse = waitForApiResponse(page, '/api/attendance/checkout');
      await page.click('button:has-text("GPS 퇴근")');

      // 퇴근 확인 다이얼로그
      await expect(page.locator('.confirm-dialog')).toContainText('퇴근하시겠습니까?');
      await page.click('.confirm-dialog >> button:has-text("확인")');

      // API 응답 대기
      const response = await checkoutResponse;
      expect(response.status()).toBe(200);

      // 성공 메시지 확인
      await expect(page.locator('.toast-success')).toContainText('퇴근 처리되었습니다');

      // 근무 시간 요약 표시
      await expect(page.locator('.work-summary')).toBeVisible();
      await expect(page.locator('.work-summary')).toContainText('근무 시간');
    });
  });

  test.describe('위치 범위 검증', () => {
    test('사업장 범위 밖에서 체크인 시도', async ({ page, context }) => {
      // 사업장에서 1km 떨어진 위치로 GPS 설정
      await context.setGeolocation({
        latitude: 37.5765, // 사업장에서 멀리 떨어진 위치
        longitude: 126.9870
      });

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 출근 시도
      await page.click('button:has-text("GPS 출근")');

      // 위치 범위 오류 메시지
      await expect(page.locator('.location-error')).toContainText('사업장 범위를 벗어났습니다');

      // 현재 거리 표시
      await expect(page.locator('.distance-info')).toBeVisible();
      await expect(page.locator('.distance-info')).toContainText('현재 거리');

      // 대체 체크인 옵션 제공
      await expect(page.locator('.alternative-checkin')).toBeVisible();
      await expect(page.locator('button:has-text("관리자 승인 요청")')).toBeVisible();
    });

    test('허용 범위 경계에서 체크인', async ({ page, context }) => {
      // 사업장 경계 (200m) 위치로 GPS 설정
      const businessLocation = testBusinesses.restaurant.location;
      await context.setGeolocation({
        latitude: businessLocation.lat + 0.0018, // 약 200m 거리
        longitude: businessLocation.lng
      });

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 출근
      await page.click('button:has-text("GPS 출근")');

      // 경계 경고 메시지
      await expect(page.locator('.boundary-warning')).toContainText('사업장 경계 근처입니다');

      // 출근은 정상 처리
      await expect(page.locator('.toast-success')).toContainText('출근 처리되었습니다');
    });
  });

  test.describe('GPS 정확도 처리', () => {
    test('낮은 GPS 정확도 경고', async ({ page, context }) => {
      // 낮은 정확도의 위치 설정
      await context.setGeolocation({
        latitude: testBusinesses.restaurant.location.lat,
        longitude: testBusinesses.restaurant.location.lng,
        accuracy: 100 // 100m 정확도 (낮음)
      });

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 출근 시도
      await page.click('button:has-text("GPS 출근")');

      // 정확도 경고
      await expect(page.locator('.accuracy-warning')).toContainText('GPS 정확도가 낮습니다');

      // 재시도 버튼
      await expect(page.locator('button:has-text("위치 재확인")')).toBeVisible();

      // QR 코드 대체 옵션
      await expect(page.locator('button:has-text("QR 코드로 체크인")')).toBeVisible();
    });

    test('GPS 신호 없음 처리', async ({ page, context }) => {
      // GPS 권한은 있지만 위치를 가져올 수 없는 상황 시뮬레이션
      await context.grantPermissions(['geolocation']);

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 위치 에러 시뮬레이션
      await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (success, error) => {
          error({ code: 2, message: 'Position unavailable' });
        };
      });

      // GPS 출근 시도
      await page.click('button:has-text("GPS 출근")');

      // 에러 메시지
      await expect(page.locator('.gps-error')).toContainText('GPS 신호를 찾을 수 없습니다');

      // 대체 방법 안내
      await expect(page.locator('.alternative-methods')).toBeVisible();
      await expect(page.locator('.alternative-methods')).toContainText('다른 체크인 방법을 이용해주세요');
    });
  });

  test.describe('이동 근무 처리', () => {
    test('이동 근무자 다중 위치 체크인', async ({ page, context }) => {
      // 첫 번째 위치에서 체크인
      const location1 = { lat: 37.5665, lng: 126.9780 };
      await context.setGeolocation({
        latitude: location1.lat,
        longitude: location1.lng
      });

      // 이동 근무 권한이 있는 사용자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.mobileWorker.email, testUsers.mobileWorker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 이동 근무 모드 활성화
      await page.click('button:has-text("이동 근무")');
      await expect(page.locator('.mobile-work-mode')).toBeVisible();

      // 첫 번째 위치에서 체크인
      await page.click('button:has-text("GPS 출근")');
      await expect(page.locator('.toast-success')).toContainText('이동 근무 시작');

      // 두 번째 위치로 이동
      const location2 = { lat: 37.5172, lng: 127.0473 };
      await context.setGeolocation({
        latitude: location2.lat,
        longitude: location2.lng
      });

      // 위치 업데이트
      await page.click('button:has-text("위치 업데이트")');

      // 이동 경로 기록 확인
      await expect(page.locator('.movement-log')).toBeVisible();
      await expect(page.locator('.movement-log .location-entry')).toHaveCount(2);
    });

    test('이동 근무 경로 추적', async ({ page, context }) => {
      // 이동 근무 중인 사용자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.mobileWorkerActive.email, testUsers.mobileWorkerActive.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 이동 경로 보기
      await page.click('button:has-text("이동 경로")');

      // 지도 표시 확인
      await expect(page.locator('.movement-map')).toBeVisible();

      // 경로 정보 확인
      await expect(page.locator('.route-info')).toContainText('총 이동 거리');
      await expect(page.locator('.route-info')).toContainText('경유지');

      // 시간대별 위치 확인
      await expect(page.locator('.timeline-locations')).toBeVisible();
      await expect(page.locator('.timeline-locations .time-entry')).toHaveCount.greaterThan(0);
    });
  });

  test.describe('GPS 체크인 제한', () => {
    test('중복 체크인 방지', async ({ page, context }) => {
      // 사업장 위치로 GPS 설정
      const businessLocation = testBusinesses.restaurant.location;
      await context.setGeolocation({
        latitude: businessLocation.lat,
        longitude: businessLocation.lng
      });

      // 이미 출근한 사용자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.checkedInWorker.email, testUsers.checkedInWorker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 출근 버튼 비활성화 확인
      await expect(page.locator('button:has-text("GPS 출근")')).toBeDisabled();

      // 현재 상태 표시
      await expect(page.locator('.current-status')).toContainText('이미 출근하셨습니다');
      await expect(page.locator('.checkin-time')).toBeVisible();
    });

    test('스케줄 시간 외 체크인 경고', async ({ page, context }) => {
      // 사업장 위치로 GPS 설정
      const businessLocation = testBusinesses.restaurant.location;
      await context.setGeolocation({
        latitude: businessLocation.lat,
        longitude: businessLocation.lng
      });

      // 스케줄 시간 외 시간으로 설정
      await page.clock.setFixedTime(new Date('2024-01-15 05:00:00'));

      // 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // GPS 출근 시도
      await page.click('button:has-text("GPS 출근")');

      // 스케줄 경고
      await expect(page.locator('.schedule-warning')).toContainText('예정된 근무 시간이 아닙니다');

      // 조기 출근 확인
      await expect(page.locator('.early-checkin-confirm')).toBeVisible();
      await expect(page.locator('.early-checkin-confirm')).toContainText('조기 출근으로 기록됩니다');

      // 계속 진행 옵션
      await expect(page.locator('button:has-text("조기 출근 진행")')).toBeVisible();
    });
  });
});

// 관리자 GPS 관리 기능
test.describe('관리자 GPS 설정', () => {
  test('사업장 GPS 범위 설정', async ({ page }) => {
    // 관리자로 로그인
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.manager.email, testUsers.manager.password);
    await page.waitForURL('**/dashboard');

    // 설정 페이지로 이동
    await page.click('nav >> text=설정');
    await page.click('text=근태 설정');

    // GPS 설정 섹션
    await page.click('text=GPS 체크인 설정');

    // 현재 설정 확인
    await expect(page.locator('.gps-settings')).toBeVisible();
    await expect(page.locator('input[name="allowedRadius"]')).toHaveValue('200');

    // 허용 반경 변경
    await page.fill('input[name="allowedRadius"]', '300');

    // 지도에서 범위 미리보기
    await expect(page.locator('.radius-preview')).toBeVisible();

    // 설정 저장
    await page.click('button:has-text("저장")');
    await expect(page.locator('.toast-success')).toContainText('GPS 설정이 저장되었습니다');
  });

  test('GPS 체크인 비활성화', async ({ page }) => {
    // Owner로 로그인
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUsers.owner.email, testUsers.owner.password);
    await page.waitForURL('**/dashboard');

    // 설정 페이지로 이동
    await page.click('nav >> text=설정');
    await page.click('text=근태 설정');

    // GPS 체크인 비활성화
    await page.uncheck('input[name="enableGPSCheckin"]');

    // 경고 메시지 확인
    await expect(page.locator('.warning-message')).toContainText('GPS 체크인이 비활성화되면 QR 코드만 사용 가능합니다');

    // 설정 저장
    await page.click('button:has-text("저장")');

    // 확인 다이얼로그
    await expect(page.locator('.confirm-dialog')).toContainText('GPS 체크인을 비활성화하시겠습니까?');
    await page.click('.confirm-dialog >> button:has-text("확인")');

    // 성공 메시지
    await expect(page.locator('.toast-success')).toContainText('설정이 변경되었습니다');
  });
});