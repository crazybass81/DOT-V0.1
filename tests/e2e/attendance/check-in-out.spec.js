/**
 * T136: 출근/퇴근 플로우 E2E 테스트 작성
 * GPS 기반 위치 확인, 시간 기록, 상태 변경 검증
 * 다양한 출근/퇴근 시나리오와 예외 상황 테스트
 */

const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const AttendancePage = require('../pages/AttendancePage');
const { DatabaseHelper, scenarioHelpers, authHelpers, networkHelpers } = require('../helpers/test-helpers');

/**
 * 출근/퇴근 플로우 E2E 테스트 스위트
 * 한글 주석: 실제 사용자 근태 관리 시나리오 검증
 */
test.describe('출근/퇴근 플로우 E2E 테스트', () => {
  let loginPage;
  let attendancePage;
  let dbHelper;

  // 각 테스트 전 초기화
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    attendancePage = new AttendancePage(page);
    dbHelper = new DatabaseHelper();

    // 테스트 데이터 설정
    await dbHelper.cleanupTestData();
    await scenarioHelpers.setupScenario('worker', dbHelper);

    // 위치 권한 허용 설정
    await page.context().grantPermissions(['geolocation']);
    await page.setGeolocation({ latitude: 37.5665, longitude: 126.9780 }); // 서울시청 좌표

    // 로그인 상태로 시작
    await loginPage.navigate();
    await loginPage.loginAsWorker();
    await attendancePage.navigate();
  });

  test.afterEach(async () => {
    await dbHelper.close();
  });

  /**
   * 기본 출근 기능 테스트
   * 정상적인 출근 플로우 검증
   */
  test.describe('기본 출근 기능', () => {
    test('정상 위치에서 출근할 수 있어야 한다', async ({ page }) => {
      // 출근 가능 시간 설정 (오전 8시)
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));

      // 출근 버튼 클릭
      await attendancePage.clickCheckInButton();

      // GPS 위치 확인 대기
      await attendancePage.waitForGpsCheck();

      // 출근 성공 확인
      await attendancePage.expectCheckInSuccess();
      await attendancePage.expectStatus('checked_in');
      await attendancePage.expectCheckInTime('08:00');

      // 데이터베이스 확인
      const attendance = await dbHelper.pool.query(
        'SELECT * FROM attendance WHERE user_id = $1 AND date = CURRENT_DATE',
        [9001]
      );

      expect(attendance.rows).toHaveLength(1);
      expect(attendance.rows[0].status).toBe('checked_in');
      expect(attendance.rows[0].check_in_method).toBe('gps');
    });

    test('출근 시 현재 시간이 정확히 기록되어야 한다', async ({ page }) => {
      const testTime = new Date('2024-01-15T09:15:30');
      await page.clock.setFixedTime(testTime);

      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 화면에 표시된 시간 확인
      await attendancePage.expectCheckInTime('09:15');

      // 데이터베이스에 저장된 정확한 시간 확인
      const attendance = await dbHelper.pool.query(
        'SELECT check_in_time FROM attendance WHERE user_id = $1 AND date = CURRENT_DATE',
        [9001]
      );

      expect(attendance.rows[0].check_in_time).toBe('09:15:30');
    });

    test('출근 후 출근 버튼이 비활성화되어야 한다', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));

      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 출근 버튼 비활성화 확인
      await expect(page.locator('[data-testid="check-in-button"]')).toBeDisabled();

      // 퇴근 버튼 활성화 확인
      await expect(page.locator('[data-testid="check-out-button"]')).toBeEnabled();
    });
  });

  /**
   * 기본 퇴근 기능 테스트
   * 정상적인 퇴근 플로우 검증
   */
  test.describe('기본 퇴근 기능', () => {
    test.beforeEach(async ({ page }) => {
      // 출근 상태로 설정
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();
      await attendancePage.expectCheckInSuccess();
    });

    test('정상 위치에서 퇴근할 수 있어야 한다', async ({ page }) => {
      // 퇴근 시간 설정 (오후 6시)
      await page.clock.setFixedTime(new Date('2024-01-15T18:00:00'));

      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();

      // 퇴근 성공 확인
      await attendancePage.expectCheckOutSuccess();
      await attendancePage.expectStatus('checked_out');
      await attendancePage.expectCheckOutTime('18:00');

      // 총 근무시간 계산 확인
      await attendancePage.expectWorkHours('10시간 0분');
    });

    test('퇴근 시 근무시간이 정확히 계산되어야 한다', async ({ page }) => {
      // 9시간 30분 후 퇴근
      await page.clock.setFixedTime(new Date('2024-01-15T17:30:00'));

      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();

      // 근무시간 계산 확인
      await attendancePage.expectWorkHours('9시간 30분');

      // 데이터베이스 확인
      const attendance = await dbHelper.pool.query(
        'SELECT work_hours FROM attendance WHERE user_id = $1 AND date = CURRENT_DATE',
        [9001]
      );

      expect(attendance.rows[0].work_hours).toBe('09:30:00');
    });

    test('퇴근 후 모든 버튼이 비활성화되어야 한다', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2024-01-15T18:00:00'));

      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();

      // 모든 출근/퇴근 버튼 비활성화 확인
      await expect(page.locator('[data-testid="check-in-button"]')).toBeDisabled();
      await expect(page.locator('[data-testid="check-out-button"]')).toBeDisabled();

      // 당일 출근/퇴근 완료 메시지 표시
      await expect(page.locator('text=오늘 근무가 완료되었습니다')).toBeVisible();
    });
  });

  /**
   * GPS 위치 검증 테스트
   * 위치 기반 출근/퇴근 제한 확인
   */
  test.describe('GPS 위치 검증', () => {
    test('허용 범위 밖에서 출근 시도 시 실패해야 한다', async ({ page }) => {
      // 사업장에서 멀리 떨어진 위치 설정
      await page.setGeolocation({ latitude: 35.1796, longitude: 129.0756 }); // 부산

      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 출근 실패 확인
      await attendancePage.expectCheckInFailure('사업장 위치에서 벗어났습니다. 지정된 위치에서 출근해주세요.');
      await attendancePage.expectStatus('not_checked_in');
    });

    test('GPS 신호가 없을 때 적절한 메시지가 표시되어야 한다', async ({ page }) => {
      // GPS 권한 거부
      await page.context().clearPermissions();

      await attendancePage.clickCheckInButton();

      // GPS 오류 메시지 확인
      await attendancePage.expectGpsError('위치 정보를 가져올 수 없습니다. GPS를 활성화하고 위치 권한을 허용해주세요.');
    });

    test('GPS 정확도가 낮을 때 경고 메시지가 표시되어야 한다', async ({ page }) => {
      // 낮은 정확도로 위치 설정 시뮬레이션
      await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (success) => {
          success({
            coords: {
              latitude: 37.5665,
              longitude: 126.9780,
              accuracy: 150 // 150m 오차 (기준: 50m)
            }
          });
        };
      });

      await attendancePage.clickCheckInButton();

      // 정확도 경고 확인
      await expect(page.locator('.gps-accuracy-warning')).toBeVisible();
      await expect(page.locator('text=GPS 신호가 부정확합니다')).toBeVisible();
    });

    test('사업장 경계선 근처에서도 출근이 가능해야 한다', async ({ page }) => {
      // 허용 반경 경계 근처 위치 설정 (49m 거리)
      await page.setGeolocation({ latitude: 37.5661, longitude: 126.9780 });

      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 출근 성공 확인 (50m 반경 내)
      await attendancePage.expectCheckInSuccess();
    });
  });

  /**
   * 시간 제한 테스트
   * 출근/퇴근 가능 시간 검증
   */
  test.describe('시간 제한', () => {
    test('너무 이른 시간에 출근 시도 시 실패해야 한다', async ({ page }) => {
      // 오전 5시 (출근 가능 시간: 6시)
      await page.clock.setFixedTime(new Date('2024-01-15T05:00:00'));

      await attendancePage.clickCheckInButton();

      // 시간 제한 오류 확인
      await attendancePage.expectCheckInFailure('출근 가능 시간이 아닙니다. (06:00 ~ 10:00)');
    });

    test('너무 늦은 시간에 출근 시도 시 실패해야 한다', async ({ page }) => {
      // 오전 11시 (출근 가능 시간: 10시까지)
      await page.clock.setFixedTime(new Date('2024-01-15T11:00:00'));

      await attendancePage.clickCheckInButton();

      // 시간 제한 오류 확인
      await attendancePage.expectCheckInFailure('출근 가능 시간이 지났습니다. 지각 처리됩니다.');
    });

    test('최소 근무시간 전 퇴근 시도 시 경고가 표시되어야 한다', async ({ page }) => {
      // 출근 후 2시간만 지나고 퇴근 시도
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      await page.clock.setFixedTime(new Date('2024-01-15T10:00:00'));
      await attendancePage.clickCheckOutButton();

      // 조기 퇴근 경고 확인
      await expect(page.locator('.early-checkout-warning')).toBeVisible();
      await expect(page.locator('text=최소 근무시간(8시간)을 채우지 못했습니다')).toBeVisible();
    });

    test('야간 시간대 퇴근에 대한 특별 처리가 있어야 한다', async ({ page }) => {
      // 출근 후 야간 퇴근
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      await page.clock.setFixedTime(new Date('2024-01-15T22:00:00'));
      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();

      // 야간 근무 표시 확인
      await expect(page.locator('.overtime-notice')).toBeVisible();
      await expect(page.locator('text=야간 근무가 포함되었습니다')).toBeVisible();
    });
  });

  /**
   * 휴게시간 처리 테스트
   * 휴게시간 제외한 실근무시간 계산
   */
  test.describe('휴게시간 처리', () => {
    test('8시간 이상 근무 시 1시간 휴게시간이 자동 차감되어야 한다', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 9시간 후 퇴근
      await page.clock.setFixedTime(new Date('2024-01-15T17:00:00'));
      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();

      // 실근무시간 확인 (9시간 - 1시간 휴게 = 8시간)
      await attendancePage.expectWorkHours('8시간 0분');
      await attendancePage.expectBreakTime('1시간 0분');
    });

    test('수동 휴게시간 기록이 가능해야 한다', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 수동 휴게시간 기록
      await page.click('[data-testid="break-start-button"]');
      await page.clock.setFixedTime(new Date('2024-01-15T12:00:00'));

      await page.click('[data-testid="break-end-button"]');
      await page.clock.setFixedTime(new Date('2024-01-15T13:00:00'));

      // 퇴근
      await page.clock.setFixedTime(new Date('2024-01-15T17:00:00'));
      await attendancePage.clickCheckOutButton();
      await attendancePage.waitForGpsCheck();

      // 휴게시간 확인
      await attendancePage.expectBreakTime('1시간 0분');
      await attendancePage.expectWorkHours('8시간 0분'); // 9시간 - 1시간 휴게
    });
  });

  /**
   * 예외상황 처리 테스트
   * 네트워크 오류, 중복 처리 등
   */
  test.describe('예외상황 처리', () => {
    test('이미 출근한 상태에서 재출근 시도 시 적절한 메시지가 표시되어야 한다', async ({ page }) => {
      // 첫 번째 출근
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 두 번째 출근 시도
      await attendancePage.clickCheckInButton();

      // 중복 출근 방지 메시지 확인
      await attendancePage.expectError('이미 출근 처리되었습니다.');
    });

    test('네트워크 오류 시 로컬에 임시 저장되어야 한다', async ({ page }) => {
      // 네트워크 오프라인 설정
      await page.context().setOffline(true);

      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 오프라인 처리 메시지 확인
      await expect(page.locator('.offline-mode')).toBeVisible();
      await expect(page.locator('text=네트워크 연결 후 자동으로 동기화됩니다')).toBeVisible();

      // 로컬 스토리지에 임시 저장 확인
      const offlineData = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('offline-attendance') || '[]');
      });

      expect(offlineData).toHaveLength(1);
      expect(offlineData[0].type).toBe('check_in');
    });

    test('네트워크 복구 시 오프라인 데이터가 자동 동기화되어야 한다', async ({ page }) => {
      // 오프라인 상태에서 출근
      await page.context().setOffline(true);
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 온라인 복구
      await page.context().setOffline(false);

      // 자동 동기화 대기
      await expect(page.locator('.sync-success')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=출근 정보가 동기화되었습니다')).toBeVisible();

      // 로컬 스토리지 정리 확인
      const offlineData = await page.evaluate(() => {
        return localStorage.getItem('offline-attendance');
      });

      expect(offlineData).toBeNull();
    });

    test('서버 오류 시 재시도 로직이 동작해야 한다', async ({ page }) => {
      let retryCount = 0;

      // 3회까지 서버 오류 후 성공
      await page.route('**/api/v1/attendance/check-in', async route => {
        retryCount++;
        if (retryCount <= 3) {
          await route.fulfill({ status: 500, body: 'Server Error' });
        } else {
          await route.continue();
        }
      });

      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));
      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // 재시도 후 성공 확인
      await attendancePage.expectCheckInSuccess();
      expect(retryCount).toBe(4); // 3회 실패 + 1회 성공
    });
  });

  /**
   * 다양한 출근 방법 테스트
   * GPS, QR코드, 관리자 승인 등
   */
  test.describe('다양한 출근 방법', () => {
    test('QR코드 스캔으로 출근할 수 있어야 한다', async ({ page }) => {
      // QR코드 스캔 모드 활성화
      await page.click('[data-testid="qr-scan-button"]');

      // QR코드 스캔 시뮬레이션
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('qr-scanned', {
          detail: {
            businessId: 9001,
            locationCode: 'MAIN_OFFICE',
            timestamp: Date.now()
          }
        }));
      });

      // QR코드 출근 성공 확인
      await attendancePage.expectCheckInSuccess();
      await attendancePage.expectCheckInMethod('qr');
    });

    test('관리자 승인으로 수동 출근이 가능해야 한다', async ({ page }) => {
      // 관리자로 로그인된 다른 세션 시뮬레이션
      await dbHelper.pool.query(
        'INSERT INTO pending_attendance (user_id, business_id, type, requested_time, reason) VALUES ($1, $2, $3, $4, $5)',
        [9001, 9001, 'check_in', '08:00:00', '교통사고로 인한 지각']
      );

      // 수동 출근 승인 처리
      await page.goto('/admin/attendance-approval');
      await page.click('[data-testid="approve-button"]');

      // 승인 후 출근 페이지로 돌아가기
      await attendancePage.navigate();

      // 승인된 출근 상태 확인
      await attendancePage.expectStatus('checked_in');
      await attendancePage.expectCheckInMethod('manual');
    });
  });

  /**
   * 접근성 테스트
   * 키보드 네비게이션, 스크린 리더 지원
   */
  test.describe('접근성', () => {
    test('키보드만으로 출근/퇴근이 가능해야 한다', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));

      // Tab 키로 출근 버튼으로 이동
      await page.keyboard.press('Tab');
      while (!(await page.locator('[data-testid="check-in-button"]:focus').count())) {
        await page.keyboard.press('Tab');
      }

      // Enter 키로 출근
      await page.keyboard.press('Enter');
      await attendancePage.waitForGpsCheck();

      await attendancePage.expectCheckInSuccess();
    });

    test('출근/퇴근 버튼이 적절한 라벨을 가져야 한다', async ({ page }) => {
      const checkInButton = page.locator('[data-testid="check-in-button"]');
      const checkOutButton = page.locator('[data-testid="check-out-button"]');

      // aria-label 확인
      await expect(checkInButton).toHaveAttribute('aria-label', '출근하기');
      await expect(checkOutButton).toHaveAttribute('aria-label', '퇴근하기');
    });

    test('상태 변화가 스크린 리더에 전달되어야 한다', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2024-01-15T08:00:00'));

      await attendancePage.clickCheckInButton();
      await attendancePage.waitForGpsCheck();

      // aria-live 영역에 상태 변화 알림 확인
      const liveRegion = page.locator('[aria-live="polite"]');
      await expect(liveRegion).toContainText('출근이 완료되었습니다');
    });
  });

  /**
   * 모바일 환경 테스트
   * 터치 인터페이스, 모바일 GPS
   */
  test.describe('모바일 환경', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone 8

    test('모바일에서 출근 버튼이 적절한 크기로 표시되어야 한다', async ({ page }) => {
      const checkInButton = page.locator('[data-testid="check-in-button"]');
      const boundingBox = await checkInButton.boundingBox();

      // 최소 터치 타겟 크기 확인 (44px)
      expect(boundingBox.height).toBeGreaterThan(44);
      expect(boundingBox.width).toBeGreaterThan(44);
    });

    test('모바일에서 GPS 권한 요청이 올바르게 처리되어야 한다', async ({ page }) => {
      // 모바일 GPS 권한 요청 시뮬레이션
      await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (success, error) => {
          // 사용자가 권한 거부하는 시나리오
          error({ code: 1, message: 'User denied geolocation' });
        };
      });

      await attendancePage.clickCheckInButton();

      // 권한 요청 실패 메시지 확인
      await expect(page.locator('.permission-denied')).toBeVisible();
      await expect(page.locator('text=위치 권한을 허용해주세요')).toBeVisible();
    });
  });
});