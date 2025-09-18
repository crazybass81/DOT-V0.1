/**
 * QR 코드 기반 체크인/체크아웃 E2E 테스트
 *
 * 테스트 시나리오:
 * 1. QR 코드 생성 및 표시
 * 2. QR 코드 스캔 및 체크인
 * 3. QR 코드 유효성 검증
 * 4. 시간 제한 처리
 * 5. 보안 검증
 */

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { AttendancePage } = require('../pages/AttendancePage');
const { testUsers, testBusinesses } = require('../fixtures/users');
const {
  waitForElement,
  waitForApiResponse,
  mockCamera,
  generateQRCode
} = require('../helpers/test-helpers');

test.describe('QR 코드 체크인/체크아웃', () => {
  let loginPage;
  let attendancePage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    attendancePage = new AttendancePage(page);
  });

  test.describe('QR 코드 생성', () => {
    test('관리자 QR 코드 생성', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // 근태 관리 페이지로 이동
      await page.click('nav >> text=근태 관리');
      await page.click('tab:has-text("QR 코드 관리")');

      // QR 코드 생성 버튼 클릭
      await page.click('button:has-text("출근 QR 생성")');

      // QR 코드 표시 확인
      await expect(page.locator('.qr-code-display')).toBeVisible();
      await expect(page.locator('.qr-code-display img')).toHaveAttribute('alt', /QR 코드/);

      // 유효 시간 표시 확인
      await expect(page.locator('.qr-validity-timer')).toBeVisible();
      await expect(page.locator('.qr-validity-timer')).toContainText('유효 시간');

      // QR 코드 정보 확인
      await expect(page.locator('.qr-info')).toContainText(testBusinesses.restaurant.name);
      await expect(page.locator('.qr-info')).toContainText('출근용');
    });

    test('QR 코드 자동 갱신', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // QR 코드 관리 페이지로 이동
      await page.click('nav >> text=근태 관리');
      await page.click('tab:has-text("QR 코드 관리")');

      // QR 코드 생성
      await page.click('button:has-text("출근 QR 생성")');

      // 첫 번째 QR 코드 데이터 저장
      const firstQRCode = await page.locator('.qr-code-display img').getAttribute('src');

      // 5분 후로 시간 이동 (QR 코드 만료 시간)
      await page.clock.fastForward('05:01');

      // 자동 갱신 확인
      await expect(page.locator('.qr-refresh-notice')).toContainText('QR 코드가 자동 갱신되었습니다');

      // 새로운 QR 코드 확인
      const secondQRCode = await page.locator('.qr-code-display img').getAttribute('src');
      expect(secondQRCode).not.toBe(firstQRCode);
    });

    test('출근/퇴근 QR 코드 구분', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // QR 코드 관리 페이지로 이동
      await page.click('nav >> text=근태 관리');
      await page.click('tab:has-text("QR 코드 관리")');

      // 출근 QR 생성
      await page.click('button:has-text("출근 QR 생성")');
      await expect(page.locator('.qr-type-badge')).toContainText('출근');
      await expect(page.locator('.qr-code-display')).toHaveClass(/checkin-qr/);

      // 퇴근 QR로 전환
      await page.click('button:has-text("퇴근 QR로 전환")');
      await expect(page.locator('.qr-type-badge')).toContainText('퇴근');
      await expect(page.locator('.qr-code-display')).toHaveClass(/checkout-qr/);
    });
  });

  test.describe('QR 코드 스캔', () => {
    test('정상적인 QR 코드 출근', async ({ page, context }) => {
      // 카메라 권한 부여
      await context.grantPermissions(['camera']);

      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // QR 스캔 버튼 클릭
      await page.click('button:has-text("QR 스캔")');

      // 카메라 뷰 활성화 확인
      await expect(page.locator('.camera-view')).toBeVisible();
      await expect(page.locator('.scan-guide')).toContainText('QR 코드를 화면에 맞춰주세요');

      // QR 코드 시뮬레이션 (유효한 QR)
      const validQRData = {
        type: 'checkin',
        businessId: testBusinesses.restaurant.id,
        timestamp: Date.now(),
        nonce: 'abc123'
      };

      await page.evaluate((qrData) => {
        window.dispatchEvent(new CustomEvent('qr-scanned', {
          detail: { data: JSON.stringify(qrData) }
        }));
      }, validQRData);

      // API 응답 대기
      const checkinResponse = await waitForApiResponse(page, '/api/attendance/qr-checkin');
      expect(checkinResponse.status()).toBe(200);

      // 성공 메시지 확인
      await expect(page.locator('.toast-success')).toContainText('QR 체크인 완료');

      // 출근 상태 업데이트 확인
      await expect(page.locator('.attendance-status')).toContainText('근무 중');
    });

    test('QR 코드 퇴근 처리', async ({ page, context }) => {
      // 카메라 권한 부여
      await context.grantPermissions(['camera']);

      // 이미 출근한 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.checkedInWorker.email, testUsers.checkedInWorker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // QR 스캔 버튼 클릭
      await page.click('button:has-text("QR 스캔")');

      // 퇴근 QR 코드 시뮬레이션
      const checkoutQRData = {
        type: 'checkout',
        businessId: testBusinesses.restaurant.id,
        timestamp: Date.now(),
        nonce: 'xyz789'
      };

      await page.evaluate((qrData) => {
        window.dispatchEvent(new CustomEvent('qr-scanned', {
          detail: { data: JSON.stringify(qrData) }
        }));
      }, checkoutQRData);

      // 퇴근 확인 다이얼로그
      await expect(page.locator('.confirm-dialog')).toContainText('퇴근하시겠습니까?');
      await page.click('.confirm-dialog >> button:has-text("확인")');

      // API 응답 대기
      const checkoutResponse = await waitForApiResponse(page, '/api/attendance/qr-checkout');
      expect(checkoutResponse.status()).toBe(200);

      // 성공 메시지 확인
      await expect(page.locator('.toast-success')).toContainText('퇴근 처리되었습니다');

      // 근무 요약 표시
      await expect(page.locator('.work-summary-modal')).toBeVisible();
    });

    test('카메라 권한 거부 처리', async ({ page, context }) => {
      // 카메라 권한 거부
      await context.clearPermissions();

      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // QR 스캔 시도
      await page.click('button:has-text("QR 스캔")');

      // 권한 요청 메시지 확인
      await expect(page.locator('.permission-error')).toContainText('카메라 권한이 필요합니다');

      // 수동 코드 입력 옵션 제공
      await expect(page.locator('button:has-text("수동 코드 입력")')).toBeVisible();

      // 설정 안내 제공
      await expect(page.locator('.permission-guide')).toContainText('설정에서 카메라 권한을 허용해주세요');
    });
  });

  test.describe('QR 코드 유효성 검증', () => {
    test('만료된 QR 코드 처리', async ({ page, context }) => {
      await context.grantPermissions(['camera']);

      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // QR 스캔 시작
      await page.click('button:has-text("QR 스캔")');

      // 만료된 QR 코드 시뮬레이션 (10분 전 생성)
      const expiredQRData = {
        type: 'checkin',
        businessId: testBusinesses.restaurant.id,
        timestamp: Date.now() - 600000, // 10분 전
        nonce: 'expired123'
      };

      await page.evaluate((qrData) => {
        window.dispatchEvent(new CustomEvent('qr-scanned', {
          detail: { data: JSON.stringify(qrData) }
        }));
      }, expiredQRData);

      // 만료 오류 메시지
      await expect(page.locator('.toast-error')).toContainText('만료된 QR 코드입니다');

      // 재생성 요청 안내
      await expect(page.locator('.error-guide')).toContainText('관리자에게 새로운 QR 코드를 요청하세요');
    });

    test('다른 사업장 QR 코드 거부', async ({ page, context }) => {
      await context.grantPermissions(['camera']);

      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // QR 스캔 시작
      await page.click('button:has-text("QR 스캔")');

      // 다른 사업장 QR 코드 시뮬레이션
      const wrongBusinessQR = {
        type: 'checkin',
        businessId: 'different-business-id',
        timestamp: Date.now(),
        nonce: 'wrong123'
      };

      await page.evaluate((qrData) => {
        window.dispatchEvent(new CustomEvent('qr-scanned', {
          detail: { data: JSON.stringify(qrData) }
        }));
      }, wrongBusinessQR);

      // 오류 메시지
      await expect(page.locator('.toast-error')).toContainText('소속 사업장의 QR 코드가 아닙니다');

      // 현재 사업장 정보 표시
      await expect(page.locator('.business-info')).toContainText(`현재 사업장: ${testBusinesses.restaurant.name}`);
    });

    test('중복 사용 방지', async ({ page, context }) => {
      await context.grantPermissions(['camera']);

      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // QR 스캔 시작
      await page.click('button:has-text("QR 스캔")');

      // 이미 사용된 QR 코드 시뮬레이션
      const usedQRData = {
        type: 'checkin',
        businessId: testBusinesses.restaurant.id,
        timestamp: Date.now(),
        nonce: 'used123' // 이미 사용된 nonce
      };

      await page.evaluate((qrData) => {
        window.dispatchEvent(new CustomEvent('qr-scanned', {
          detail: { data: JSON.stringify(qrData) }
        }));
      }, usedQRData);

      // 중복 사용 오류
      await expect(page.locator('.toast-error')).toContainText('이미 사용된 QR 코드입니다');
    });
  });

  test.describe('수동 코드 입력', () => {
    test('수동 코드로 체크인', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 수동 입력 모드 선택
      await page.click('button:has-text("수동 코드 입력")');

      // 코드 입력 폼 표시 확인
      await expect(page.locator('.manual-code-form')).toBeVisible();
      await expect(page.locator('input[placeholder*="6자리 코드"]')).toBeVisible();

      // 유효한 코드 입력
      await page.fill('input[placeholder*="6자리 코드"]', '123456');

      // 확인 버튼 클릭
      const checkinResponse = waitForApiResponse(page, '/api/attendance/manual-checkin');
      await page.click('button:has-text("체크인")');

      // API 응답 확인
      const response = await checkinResponse;
      expect(response.status()).toBe(200);

      // 성공 메시지
      await expect(page.locator('.toast-success')).toContainText('체크인 완료');
    });

    test('잘못된 코드 입력 처리', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 수동 입력 모드 선택
      await page.click('button:has-text("수동 코드 입력")');

      // 잘못된 코드 입력
      await page.fill('input[placeholder*="6자리 코드"]', '000000');

      // 확인 버튼 클릭
      await page.click('button:has-text("체크인")');

      // 오류 메시지
      await expect(page.locator('.toast-error')).toContainText('유효하지 않은 코드입니다');

      // 재입력 안내
      await expect(page.locator('.input-error')).toContainText('코드를 다시 확인해주세요');
    });

    test('코드 입력 제한', async ({ page }) => {
      // 직원으로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.worker.email, testUsers.worker.password);
      await page.waitForURL('**/dashboard');

      // 근태 페이지로 이동
      await page.click('nav >> text=근태 관리');

      // 수동 입력 모드 선택
      await page.click('button:has-text("수동 코드 입력")');

      // 5회 연속 실패
      for (let i = 0; i < 5; i++) {
        await page.fill('input[placeholder*="6자리 코드"]', '111111');
        await page.click('button:has-text("체크인")');
        await page.waitForTimeout(100);
      }

      // 입력 제한 메시지
      await expect(page.locator('.lockout-message')).toContainText('너무 많은 시도');
      await expect(page.locator('.lockout-timer')).toContainText('5분 후 다시 시도');

      // 입력 필드 비활성화
      await expect(page.locator('input[placeholder*="6자리 코드"]')).toBeDisabled();
    });
  });

  test.describe('QR 코드 대시보드', () => {
    test('실시간 체크인 현황', async ({ page }) => {
      // 관리자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.manager.email, testUsers.manager.password);
      await page.waitForURL('**/dashboard');

      // QR 코드 대시보드로 이동
      await page.click('nav >> text=근태 관리');
      await page.click('tab:has-text("QR 대시보드")');

      // 실시간 현황 표시
      await expect(page.locator('.realtime-status')).toBeVisible();
      await expect(page.locator('.total-present')).toContainText('출근');
      await expect(page.locator('.total-absent')).toContainText('미출근');

      // 최근 체크인 목록
      await expect(page.locator('.recent-checkins')).toBeVisible();
      await expect(page.locator('.checkin-entry')).toHaveCount.greaterThan(0);

      // 자동 갱신 확인 (5초마다)
      const initialCount = await page.locator('.total-present').textContent();
      await page.waitForTimeout(5100);
      await expect(page.locator('.last-updated')).toContainText('방금 업데이트');
    });

    test('QR 코드 사용 통계', async ({ page }) => {
      // Owner로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.owner.email, testUsers.owner.password);
      await page.waitForURL('**/dashboard');

      // 통계 페이지로 이동
      await page.click('nav >> text=근태 관리');
      await page.click('tab:has-text("통계")');

      // QR 코드 사용 통계 섹션
      await page.click('button:has-text("QR 코드 분석")');

      // 통계 차트 표시
      await expect(page.locator('.qr-usage-chart')).toBeVisible();

      // 주요 지표
      await expect(page.locator('.qr-success-rate')).toContainText('성공률');
      await expect(page.locator('.average-scan-time')).toContainText('평균 스캔 시간');
      await expect(page.locator('.failed-attempts')).toContainText('실패 시도');

      // 시간대별 사용 패턴
      await expect(page.locator('.hourly-pattern')).toBeVisible();
    });
  });

  test.describe('보안 및 감사', () => {
    test('QR 코드 감사 로그', async ({ page }) => {
      // Owner로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.owner.email, testUsers.owner.password);
      await page.waitForURL('**/dashboard');

      // 감사 로그 페이지로 이동
      await page.click('nav >> text=설정');
      await page.click('text=감사 로그');

      // QR 코드 관련 로그 필터
      await page.selectOption('select[name="eventType"]', 'qr_code');

      // 로그 항목 확인
      await expect(page.locator('.audit-log-entry')).toHaveCount.greaterThan(0);

      // 상세 정보 포함 확인
      const firstLog = page.locator('.audit-log-entry').first();
      await expect(firstLog).toContainText('QR 코드 생성');
      await expect(firstLog).toContainText('IP 주소');
      await expect(firstLog).toContainText('사용자');
    });

    test('비정상 패턴 감지', async ({ page }) => {
      // 보안 담당자로 로그인
      await loginPage.goto();
      await loginPage.login(testUsers.securityManager.email, testUsers.securityManager.password);
      await page.waitForURL('**/dashboard');

      // 보안 대시보드로 이동
      await page.click('nav >> text=보안');
      await page.click('text=이상 감지');

      // QR 코드 이상 패턴 섹션
      await expect(page.locator('.qr-anomalies')).toBeVisible();

      // 이상 패턴 유형
      await expect(page.locator('.rapid-attempts')).toContainText('급속 시도');
      await expect(page.locator('.location-mismatch')).toContainText('위치 불일치');
      await expect(page.locator('.time-anomaly')).toContainText('시간 이상');

      // 알림 설정
      await page.click('button:has-text("알림 설정")');
      await page.check('input[name="notifyRapidAttempts"]');
      await page.click('button:has-text("저장")');

      // 설정 저장 확인
      await expect(page.locator('.toast-success')).toContainText('보안 알림이 설정되었습니다');
    });
  });
});