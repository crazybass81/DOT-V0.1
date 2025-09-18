/**
 * T128: 페이지 객체 모델 - 근태 관리 페이지
 * 출퇴근, GPS 체크인, QR 스캔 등 근태 관련 모든 기능
 * 실시간 상태 업데이트와 WebSocket 연동 포함
 */

const BasePage = require('./BasePage');

class AttendancePage extends BasePage {
  constructor(page) {
    super(page);

    // 페이지 경로
    this.path = '/attendance';

    // 근태 관리 선택자
    this.selectors = {
      // 체크인/체크아웃 버튼
      checkInButton: '[data-testid="check-in-button"], .check-in-button',
      checkOutButton: '[data-testid="check-out-button"], .check-out-button',

      // GPS 관련
      gpsStatus: '[data-testid="gps-status"], .gps-status',
      gpsPermissionButton: '[data-testid="gps-permission"], .gps-permission-button',
      locationInfo: '[data-testid="location-info"], .location-info',

      // QR 코드 관련
      qrScanner: '[data-testid="qr-scanner"], .qr-scanner',
      qrScanButton: '[data-testid="qr-scan-button"], .qr-scan-button',
      qrCodeDisplay: '[data-testid="qr-code"], .qr-code-display',
      qrRefreshButton: '[data-testid="qr-refresh"], .qr-refresh-button',

      // 현재 상태 표시
      currentStatus: '[data-testid="attendance-status"], .attendance-status',
      workTimeDisplay: '[data-testid="work-time"], .work-time-display',
      startTimeDisplay: '[data-testid="start-time"], .start-time',

      // 휴게 시간 관리
      breakStartButton: '[data-testid="break-start"], .break-start-button',
      breakEndButton: '[data-testid="break-end"], .break-end-button',
      breakTimeDisplay: '[data-testid="break-time"], .break-time-display',

      // 외근 관리
      fieldWorkButton: '[data-testid="field-work"], .field-work-button',
      fieldWorkLocation: '[data-testid="field-location"], .field-location-input',

      // 실시간 현황 (관리자용)
      staffStatusTable: '[data-testid="staff-status"], .staff-status-table',
      realTimeStats: '[data-testid="real-time-stats"], .real-time-stats',

      // 알림 및 메시지
      successMessage: '.success-message, .MuiAlert-standardSuccess',
      errorMessage: '.error-message, .MuiAlert-standardError',
      warningMessage: '.warning-message, .MuiAlert-standardWarning',

      // 로딩 상태
      loadingSpinner: '.loading-spinner, .MuiCircularProgress-root',

      // 모달 다이얼로그
      confirmDialog: '.confirm-dialog, .MuiDialog-root',
      confirmButton: '[data-testid="confirm-button"], .confirm-button',
      cancelButton: '[data-testid="cancel-button"], .cancel-button',

      // 권한 요청 다이얼로그
      permissionDialog: '.permission-dialog',
      allowPermissionButton: '.allow-permission-button',

      // 네트워크 상태
      offlineIndicator: '.offline-indicator',
      reconnectingIndicator: '.reconnecting-indicator'
    };

    // 근태 상태 값들
    this.attendanceStates = {
      NOT_STARTED: '출근 전',
      CHECKED_IN: '출근',
      ON_BREAK: '휴게',
      FIELD_WORK: '외근',
      CHECKED_OUT: '퇴근'
    };
  }

  /**
   * 근태 관리 페이지로 이동
   */
  async navigate() {
    await this.goto(this.path);
    await this.waitForElement(this.selectors.currentStatus);
  }

  /**
   * GPS 권한 허용 및 위치 설정
   */
  async enableGPSAndSetLocation() {
    // 브라우저 GPS 권한 허용
    await this.allowGeolocation();

    // GPS 권한 버튼이 있으면 클릭
    if (await this.page.locator(this.selectors.gpsPermissionButton).count() > 0) {
      await this.safeClick(this.selectors.gpsPermissionButton);
    }

    // GPS 상태가 활성화될 때까지 대기
    await this.page.waitForFunction(() => {
      const gpsElement = document.querySelector('[data-testid="gps-status"], .gps-status');
      return gpsElement && gpsElement.textContent.includes('GPS 활성화');
    }, { timeout: 10000 });
  }

  /**
   * 체크인 실행
   * @param {string} method - 체크인 방식 ('gps' 또는 'qr')
   */
  async checkIn(method = 'gps') {
    if (method === 'gps') {
      await this.checkInWithGPS();
    } else if (method === 'qr') {
      await this.checkInWithQR();
    } else {
      throw new Error(`지원하지 않는 체크인 방식: ${method}`);
    }
  }

  /**
   * GPS 체크인
   */
  async checkInWithGPS() {
    // GPS 활성화 확인
    await this.enableGPSAndSetLocation();

    // 체크인 버튼 클릭
    await this.safeClick(this.selectors.checkInButton);

    // 확인 다이얼로그 처리 (있는 경우)
    if (await this.page.locator(this.selectors.confirmDialog).count() > 0) {
      await this.safeClick(this.selectors.confirmButton);
    }

    await this.waitForLoading();

    // 성공 메시지 확인
    await this.checkNotification('출근이 완료되었습니다', 'success');
  }

  /**
   * QR 코드 체크인
   */
  async checkInWithQR() {
    // 카메라 권한 허용
    await this.allowCamera();

    // QR 스캔 버튼 클릭
    await this.safeClick(this.selectors.qrScanButton);

    // QR 스캐너 활성화 대기
    await this.waitForElement(this.selectors.qrScanner);

    // QR 코드 스캔 시뮬레이션 (실제로는 카메라 입력 대신 테스트 QR 코드 사용)
    await this.simulateQRScan();

    await this.waitForLoading();

    // 성공 메시지 확인
    await this.checkNotification('QR 체크인이 완료되었습니다', 'success');
  }

  /**
   * 체크아웃 실행
   */
  async checkOut() {
    await this.safeClick(this.selectors.checkOutButton);

    // 확인 다이얼로그 처리
    if (await this.page.locator(this.selectors.confirmDialog).count() > 0) {
      await this.safeClick(this.selectors.confirmButton);
    }

    await this.waitForLoading();

    // 성공 메시지 확인
    await this.checkNotification('퇴근이 완료되었습니다', 'success');
  }

  /**
   * 휴게 시작
   */
  async startBreak() {
    await this.safeClick(this.selectors.breakStartButton);
    await this.waitForLoading();
    await this.checkNotification('휴게가 시작되었습니다', 'success');
  }

  /**
   * 휴게 종료
   */
  async endBreak() {
    await this.safeClick(this.selectors.breakEndButton);
    await this.waitForLoading();
    await this.checkNotification('휴게가 종료되었습니다', 'success');
  }

  /**
   * 외근 시작
   * @param {string} location - 외근 장소
   */
  async startFieldWork(location = '고객사 방문') {
    await this.safeClick(this.selectors.fieldWorkButton);

    // 외근 장소 입력 (모달이 나타나는 경우)
    if (await this.page.locator(this.selectors.fieldWorkLocation).count() > 0) {
      await this.safeType(this.selectors.fieldWorkLocation, location);
      await this.safeClick(this.selectors.confirmButton);
    }

    await this.waitForLoading();
    await this.checkNotification('외근이 시작되었습니다', 'success');
  }

  /**
   * QR 코드 스캔 시뮬레이션
   * 실제 QR 코드 대신 테스트용 코드를 사용
   */
  async simulateQRScan() {
    // QR 스캔 시뮬레이션을 위한 JavaScript 실행
    await this.page.evaluate(() => {
      // 테스트용 QR 코드 데이터
      const testQRData = {
        businessId: 9001,
        timestamp: Date.now(),
        signature: 'test-signature-for-e2e'
      };

      // QR 스캔 이벤트 발생시키기
      const event = new CustomEvent('qr-scan-success', {
        detail: testQRData
      });
      document.dispatchEvent(event);
    });

    // QR 처리 완료 대기
    await this.page.waitForTimeout(1000);
  }

  /**
   * 현재 근태 상태 확인
   * @param {string} expectedStatus - 예상 상태
   */
  async expectAttendanceStatus(expectedStatus) {
    await this.waitForElement(this.selectors.currentStatus);
    const statusElement = await this.page.locator(this.selectors.currentStatus);
    const actualStatus = await statusElement.textContent();

    if (!actualStatus.includes(expectedStatus)) {
      throw new Error(`근태 상태 불일치. 예상: "${expectedStatus}", 실제: "${actualStatus}"`);
    }
  }

  /**
   * 근무 시간 표시 확인
   */
  async expectWorkTimeDisplayed() {
    await this.waitForElement(this.selectors.workTimeDisplay);

    // 시간 형식 확인 (예: "08:30" 또는 "1시간 30분")
    const timeElement = await this.page.locator(this.selectors.workTimeDisplay);
    const timeText = await timeElement.textContent();

    const timePattern = /(\d{1,2}:\d{2}|\d+시간\s*\d*분?)/;
    if (!timePattern.test(timeText)) {
      throw new Error(`잘못된 시간 형식: "${timeText}"`);
    }
  }

  /**
   * GPS 상태 확인
   * @param {string} expectedStatus - 예상 GPS 상태
   */
  async expectGPSStatus(expectedStatus) {
    await this.waitForElement(this.selectors.gpsStatus);
    const gpsElement = await this.page.locator(this.selectors.gpsStatus);
    const actualStatus = await gpsElement.textContent();

    if (!actualStatus.includes(expectedStatus)) {
      throw new Error(`GPS 상태 불일치. 예상: "${expectedStatus}", 실제: "${actualStatus}"`);
    }
  }

  /**
   * 실시간 직원 현황 확인 (관리자 전용)
   */
  async expectStaffStatusTable() {
    await this.waitForElement(this.selectors.staffStatusTable);

    // 테이블에 직원 데이터가 있는지 확인
    const table = await this.page.locator(this.selectors.staffStatusTable);
    const rows = await table.locator('tbody tr').count();

    if (rows === 0) {
      throw new Error('직원 현황 데이터가 없습니다');
    }
  }

  /**
   * 실시간 업데이트 확인
   * WebSocket을 통한 실시간 데이터 업데이트 테스트
   */
  async expectRealTimeUpdate() {
    // 초기 상태 저장
    const initialStatus = await this.page.locator(this.selectors.currentStatus).textContent();

    // 상태 변경 후 자동 업데이트 확인
    // (다른 사용자의 체크인/아웃을 시뮬레이션)
    await this.page.evaluate(() => {
      // WebSocket 메시지 시뮬레이션
      const event = new CustomEvent('attendance-update', {
        detail: {
          userId: 9003,
          status: 'checked_in',
          timestamp: new Date().toISOString()
        }
      });
      document.dispatchEvent(event);
    });

    // 실시간 업데이트 대기 (최대 5초)
    await this.page.waitForFunction(
      (initialStatus) => {
        const currentElement = document.querySelector('[data-testid="attendance-status"], .attendance-status');
        return currentElement && currentElement.textContent !== initialStatus;
      },
      initialStatus,
      { timeout: 5000 }
    );
  }

  /**
   * 오프라인 모드 시뮬레이션
   */
  async simulateOfflineMode() {
    // 네트워크 연결 끊기
    await this.page.context().setOffline(true);

    // 오프라인 인디케이터 확인
    await this.waitForElement(this.selectors.offlineIndicator);
  }

  /**
   * 온라인 복구 시뮬레이션
   */
  async simulateOnlineRecovery() {
    // 네트워크 연결 복구
    await this.page.context().setOffline(false);

    // 재연결 인디케이터 확인 후 사라짐 대기
    if (await this.page.locator(this.selectors.reconnectingIndicator).count() > 0) {
      await this.waitForElementHidden(this.selectors.reconnectingIndicator);
    }
  }

  /**
   * 위치 권한 거부 시나리오
   */
  async simulateLocationPermissionDenied() {
    // 위치 권한 거부
    await this.page.context().clearPermissions();

    // 체크인 시도
    await this.safeClick(this.selectors.checkInButton);

    // 권한 요청 에러 메시지 확인
    await this.checkNotification('위치 권한이 필요합니다', 'error');
  }

  /**
   * 업무 시간 외 체크인 시도
   */
  async simulateOutOfHoursCheckIn() {
    // 시간 조작 (업무 시간 외로 설정)
    await this.page.evaluate(() => {
      // 새벽 3시로 시간 조작
      const mockDate = new Date();
      mockDate.setHours(3, 0, 0, 0);
      Date.now = () => mockDate.getTime();
    });

    // 체크인 시도
    await this.safeClick(this.selectors.checkInButton);

    // 경고 메시지 확인
    await this.checkNotification('업무 시간이 아닙니다', 'warning');
  }

  /**
   * 중복 체크인 방지 확인
   */
  async expectDuplicateCheckInPrevention() {
    // 첫 번째 체크인
    await this.checkInWithGPS();

    // 상태 확인
    await this.expectAttendanceStatus(this.attendanceStates.CHECKED_IN);

    // 두 번째 체크인 시도
    const checkInButtonCount = await this.page.locator(this.selectors.checkInButton).count();

    // 체크인 버튼이 비활성화되었거나 없어야 함
    if (checkInButtonCount > 0) {
      const isEnabled = await this.page.locator(this.selectors.checkInButton).isEnabled();
      if (isEnabled) {
        throw new Error('중복 체크인 방지가 작동하지 않습니다');
      }
    }
  }
}

module.exports = AttendancePage;