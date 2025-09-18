-- 022_create_schedules.sql
-- 스케줄 관련 테이블 생성 (schedules, schedule_assignments)
-- Based on data-model.md specifications

BEGIN;

-- schedules 테이블 생성
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),

    name VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    is_template BOOLEAN DEFAULT FALSE,
    template_name VARCHAR(100),

    recurrence_pattern VARCHAR(20),
    recurrence_config JSONB,

    is_published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP,

    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- CHECK 제약조건
    CONSTRAINT chk_schedules_date_range CHECK (end_date >= start_date),
    CONSTRAINT chk_schedules_recurrence_pattern CHECK (
        recurrence_pattern IN ('daily', 'weekly', 'monthly', 'custom') OR recurrence_pattern IS NULL
    ),
    CONSTRAINT chk_schedules_template_name CHECK (
        (is_template = TRUE AND template_name IS NOT NULL) OR
        (is_template = FALSE)
    )
);

-- schedule_assignments 테이블 생성
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    user_role_id INTEGER NOT NULL REFERENCES user_roles(id),

    date DATE NOT NULL,
    shift_start TIME NOT NULL,
    shift_end TIME NOT NULL,

    break_minutes INTEGER DEFAULT 0,

    status VARCHAR(20) DEFAULT 'assigned',

    notes TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 복합 유니크 제약조건
    UNIQUE(schedule_id, user_role_id, date),

    -- CHECK 제약조건
    CONSTRAINT chk_schedule_assignments_status CHECK (
        status IN ('assigned', 'swap_requested', 'leave_requested', 'confirmed')
    ),
    CONSTRAINT chk_schedule_assignments_shift_time CHECK (
        shift_end > shift_start
    ),
    CONSTRAINT chk_schedule_assignments_break_minutes CHECK (
        break_minutes >= 0 AND break_minutes <= 480 -- 최대 8시간
    )
);

-- schedules 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_schedules_business ON schedules(business_id);
CREATE INDEX IF NOT EXISTS idx_schedules_dates ON schedules(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedules_business_published ON schedules(business_id, is_published);
CREATE INDEX IF NOT EXISTS idx_schedules_template ON schedules(is_template) WHERE is_template = TRUE;
CREATE INDEX IF NOT EXISTS idx_schedules_created_by ON schedules(created_by);

-- schedule_assignments 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_schedule ON schedule_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_user_role ON schedule_assignments(user_role_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_date ON schedule_assignments(date);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_status ON schedule_assignments(status);

-- 복합 인덱스 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_user_role_date
ON schedule_assignments(user_role_id, date DESC);

-- 한글 주석 추가
COMMENT ON TABLE schedules IS '근무 스케줄 관리';
COMMENT ON COLUMN schedules.id IS '스케줄 고유 식별자';
COMMENT ON COLUMN schedules.business_id IS '사업장 ID';
COMMENT ON COLUMN schedules.name IS '스케줄명';
COMMENT ON COLUMN schedules.start_date IS '스케줄 시작일';
COMMENT ON COLUMN schedules.end_date IS '스케줄 종료일';
COMMENT ON COLUMN schedules.is_template IS '템플릿 여부';
COMMENT ON COLUMN schedules.template_name IS '템플릿명';
COMMENT ON COLUMN schedules.recurrence_pattern IS '반복 패턴 (daily/weekly/monthly/custom)';
COMMENT ON COLUMN schedules.recurrence_config IS 'JSON 형태의 반복 설정';
COMMENT ON COLUMN schedules.is_published IS '게시 여부';
COMMENT ON COLUMN schedules.published_at IS '게시 시간';
COMMENT ON COLUMN schedules.created_by IS '생성자 ID';

COMMENT ON TABLE schedule_assignments IS '개별 근무 할당';
COMMENT ON COLUMN schedule_assignments.id IS '할당 고유 식별자';
COMMENT ON COLUMN schedule_assignments.schedule_id IS '스케줄 ID';
COMMENT ON COLUMN schedule_assignments.user_role_id IS '사용자 역할 ID';
COMMENT ON COLUMN schedule_assignments.date IS '근무 날짜';
COMMENT ON COLUMN schedule_assignments.shift_start IS '근무 시작 시간';
COMMENT ON COLUMN schedule_assignments.shift_end IS '근무 종료 시간';
COMMENT ON COLUMN schedule_assignments.break_minutes IS '휴게 시간 (분)';
COMMENT ON COLUMN schedule_assignments.status IS '할당 상태';
COMMENT ON COLUMN schedule_assignments.notes IS '특이사항';

-- updated_at 자동 업데이트 트리거 생성
CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedule_assignments_updated_at
    BEFORE UPDATE ON schedule_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;