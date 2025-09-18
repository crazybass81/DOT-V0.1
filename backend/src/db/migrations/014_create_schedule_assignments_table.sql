/**
 * T148-T149: schedule_assignments 테이블 생성
 * 스케줄 할당 및 요청 관리
 */

-- schedule_assignments 테이블: 스케줄 할당/요청 관리
CREATE TABLE IF NOT EXISTS schedule_assignments (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- 요청자와 대상자
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 할당 타입
  assignment_type VARCHAR(20) NOT NULL DEFAULT 'assigned',
  -- assigned: 관리자가 할당, requested: 직원이 요청, swap: 교대 요청

  -- 상태
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending: 대기중, approved: 승인됨, rejected: 거절됨, cancelled: 취소됨

  -- 교대 요청인 경우
  swap_with_user_id INTEGER REFERENCES users(id),
  swap_schedule_id INTEGER REFERENCES schedules(id),

  -- 처리 정보
  processed_by INTEGER REFERENCES users(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,

  -- 타임스탬프
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_assignments_schedule_id ON schedule_assignments(schedule_id);
CREATE INDEX idx_assignments_business_id ON schedule_assignments(business_id);
CREATE INDEX idx_assignments_requester_id ON schedule_assignments(requester_id);
CREATE INDEX idx_assignments_assignee_id ON schedule_assignments(assignee_id);
CREATE INDEX idx_assignments_status ON schedule_assignments(status);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assignments_updated_at ON schedule_assignments;
CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON schedule_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_assignments_updated_at();