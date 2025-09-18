/**
 * T146-T147: schedules 테이블 생성
 * 근무 일정 관리 테이블
 */

-- schedules 테이블: 근무 일정 메인 테이블
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 일정 정보
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  -- 스케줄 타입
  schedule_type VARCHAR(20) NOT NULL DEFAULT 'shift',
  -- shift: 정규 근무, overtime: 초과 근무, break: 휴게, leave: 휴가, meeting: 회의, training: 교육

  -- 상태
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  -- scheduled: 예정됨, confirmed: 확정됨, cancelled: 취소됨, completed: 완료됨

  -- 반복 설정
  recurring VARCHAR(20), -- daily, weekly, monthly
  recurring_end DATE, -- 반복 종료일
  recurring_id VARCHAR(100), -- 반복 그룹 ID

  -- 추가 정보
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,

  -- 타임스탬프
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_schedules_business_id ON schedules(business_id);
CREATE INDEX idx_schedules_user_id ON schedules(user_id);
CREATE INDEX idx_schedules_date ON schedules(schedule_date);
CREATE INDEX idx_schedules_status ON schedules(status);

-- 복합 인덱스
CREATE INDEX idx_schedules_business_date ON schedules(business_id, schedule_date);
CREATE INDEX idx_schedules_user_date ON schedules(user_id, schedule_date);

-- 유니크 제약 조건 추가
ALTER TABLE schedules ADD CONSTRAINT unique_user_schedule
  UNIQUE (user_id, schedule_date, start_time);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schedules_updated_at ON schedules;
CREATE TRIGGER schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_schedules_updated_at();

-- 스케줄 유효성 검증 함수
CREATE OR REPLACE FUNCTION validate_schedule_time()
RETURNS TRIGGER AS $$
BEGIN
  -- 종료 시간은 시작 시간보다 늦어야 함
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION '종료 시간은 시작 시간보다 늦어야 합니다';
  END IF;

  -- 최대 근무 시간 체크 (12시간)
  IF (NEW.end_time - NEW.start_time) > INTERVAL '12 hours' THEN
    RAISE EXCEPTION '연속 근무 시간은 12시간을 초과할 수 없습니다';
  END IF;

  -- 최소 근무 시간 체크 (30분)
  IF (NEW.end_time - NEW.start_time) < INTERVAL '30 minutes' THEN
    RAISE EXCEPTION '최소 근무 시간은 30분입니다';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_schedule ON schedules;
CREATE TRIGGER validate_schedule
  BEFORE INSERT OR UPDATE ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION validate_schedule_time();