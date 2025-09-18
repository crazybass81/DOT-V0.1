/**
 * T082: 근태 관리 테이블 생성
 * GPS 위치, 체크인/아웃 시간, 근무 시간 기록
 */

-- PostGIS 확장 활성화 (이미 있으면 무시)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 근태 기록 테이블
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- 체크인/아웃 시간
  check_in_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  check_out_time TIMESTAMP WITH TIME ZONE,

  -- 위치 정보 (GPS 좌표)
  check_in_location GEOGRAPHY(POINT, 4326),
  check_out_location GEOGRAPHY(POINT, 4326),

  -- 근무 정보
  work_duration INTEGER, -- 실제 근무 시간 (초)
  break_duration INTEGER DEFAULT 0, -- 휴게 시간 (초)
  overtime_duration INTEGER DEFAULT 0, -- 초과 근무 시간 (초)

  -- 체크인 방식
  method VARCHAR(20) NOT NULL DEFAULT 'gps', -- 'gps', 'qr', 'manual', 'admin'

  -- 상태
  status VARCHAR(20) NOT NULL DEFAULT 'working', -- 'working', 'break', 'offsite', 'completed'

  -- 추가 정보
  notes TEXT,
  approved_by INTEGER REFERENCES users(id), -- 관리자 승인 (수동 입력 시)

  -- 타임스탬프
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_business_id ON attendance(business_id);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in_time ON attendance(check_in_time);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);

-- 복합 인덱스 (자주 함께 조회되는 컬럼)
CREATE INDEX IF NOT EXISTS idx_attendance_user_business_date
  ON attendance(user_id, business_id, check_in_time);

-- 공간 인덱스 (GPS 검색용)
CREATE INDEX IF NOT EXISTS idx_attendance_check_in_location
  ON attendance USING GIST(check_in_location);
CREATE INDEX IF NOT EXISTS idx_attendance_check_out_location
  ON attendance USING GIST(check_out_location);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_updated_at ON attendance;
CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_updated_at();

-- RLS (Row Level Security) 정책
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 근태 기록만 조회 가능
DROP POLICY IF EXISTS attendance_select_policy ON attendance;
CREATE POLICY attendance_select_policy ON attendance
  FOR SELECT
  USING (
    user_id = current_setting('app.user_id', true)::INTEGER
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = attendance.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- 체크인은 본인만 가능
DROP POLICY IF EXISTS attendance_insert_policy ON attendance;
CREATE POLICY attendance_insert_policy ON attendance
  FOR INSERT
  WITH CHECK (
    user_id = current_setting('app.user_id', true)::INTEGER
  );

-- 업데이트는 본인 또는 관리자만 가능
DROP POLICY IF EXISTS attendance_update_policy ON attendance;
CREATE POLICY attendance_update_policy ON attendance
  FOR UPDATE
  USING (
    user_id = current_setting('app.user_id', true)::INTEGER
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = attendance.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- 삭제는 관리자만 가능
DROP POLICY IF EXISTS attendance_delete_policy ON attendance;
CREATE POLICY attendance_delete_policy ON attendance
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = attendance.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- 유효성 검증 함수
CREATE OR REPLACE FUNCTION validate_attendance_check()
RETURNS TRIGGER AS $$
BEGIN
  -- 체크아웃 시간은 체크인 시간 이후여야 함
  IF NEW.check_out_time IS NOT NULL AND NEW.check_out_time <= NEW.check_in_time THEN
    RAISE EXCEPTION '체크아웃 시간은 체크인 시간 이후여야 합니다';
  END IF;

  -- 근무 시간 자동 계산
  IF NEW.check_out_time IS NOT NULL AND NEW.work_duration IS NULL THEN
    NEW.work_duration := EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time))::INTEGER - COALESCE(NEW.break_duration, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_attendance ON attendance;
CREATE TRIGGER validate_attendance
  BEFORE INSERT OR UPDATE ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION validate_attendance_check();