-- T146-T147: 스케줄 관련 테이블 생성
-- 스케줄, 근무 패턴, 변경 이력 관리

-- 1. 스케줄 메인 테이블
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100),
    type VARCHAR(20) NOT NULL CHECK (type IN ('weekly', 'monthly', 'custom')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 날짜 범위 체크
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- 2. 스케줄 상세 (개별 근무 시프트)
CREATE TABLE IF NOT EXISTS schedule_shifts (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INTEGER DEFAULT 0 CHECK (break_minutes >= 0),

    -- 계산된 필드
    total_minutes INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time))/60
    ) STORED,
    work_minutes INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time))/60 - break_minutes
    ) STORED,

    -- 상태 관리
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (
        status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'modified')
    ),
    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 시간 유효성 체크
    CONSTRAINT valid_shift_time CHECK (end_time > start_time),
    -- 중복 방지 (같은 직원, 같은 날짜에 겹치는 시간 방지는 트리거로 처리)
    CONSTRAINT unique_employee_shift UNIQUE (employee_id, shift_date, start_time)
);

-- 3. 근무 패턴 템플릿
CREATE TABLE IF NOT EXISTS schedule_patterns (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- JSON 형태로 패턴 저장
    -- { "monday": {"start": "09:00", "end": "18:00", "break": 60}, ... }
    pattern JSONB NOT NULL,

    -- 패턴 타입
    type VARCHAR(20) DEFAULT 'weekly' CHECK (type IN ('weekly', 'rotating', 'custom')),

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 비즈니스당 패턴명 중복 방지
    CONSTRAINT unique_pattern_name UNIQUE (business_id, name)
);

-- 4. 스케줄 변경 이력
CREATE TABLE IF NOT EXISTS schedule_history (
    id SERIAL PRIMARY KEY,
    schedule_shift_id INTEGER NOT NULL REFERENCES schedule_shifts(id) ON DELETE CASCADE,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    change_type VARCHAR(20) NOT NULL CHECK (
        change_type IN ('created', 'modified', 'cancelled', 'restored')
    ),

    -- 변경 전 값
    old_values JSONB,
    -- 변경 후 값
    new_values JSONB,

    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. 스케줄 요청/승인 (직원의 스케줄 변경 요청)
CREATE TABLE IF NOT EXISTS schedule_requests (
    id SERIAL PRIMARY KEY,
    schedule_shift_id INTEGER REFERENCES schedule_shifts(id) ON DELETE CASCADE,
    requested_by INTEGER NOT NULL REFERENCES employees(id),
    request_type VARCHAR(20) NOT NULL CHECK (
        request_type IN ('swap', 'cancel', 'modify', 'overtime')
    ),

    -- 요청 상세
    request_data JSONB NOT NULL,
    reason TEXT,

    -- 승인 관련
    status VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected', 'cancelled')
    ),
    reviewed_by INTEGER REFERENCES users(id),
    review_notes TEXT,
    reviewed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_schedules_business_dates ON schedules(business_id, start_date, end_date);
CREATE INDEX idx_schedule_shifts_employee_date ON schedule_shifts(employee_id, shift_date);
CREATE INDEX idx_schedule_shifts_date ON schedule_shifts(shift_date);
CREATE INDEX idx_schedule_shifts_schedule ON schedule_shifts(schedule_id);
CREATE INDEX idx_schedule_patterns_business ON schedule_patterns(business_id);
CREATE INDEX idx_schedule_history_shift ON schedule_history(schedule_shift_id);
CREATE INDEX idx_schedule_requests_employee ON schedule_requests(requested_by);
CREATE INDEX idx_schedule_requests_status ON schedule_requests(status);

-- 스케줄 시프트 중복 방지 트리거 함수
CREATE OR REPLACE FUNCTION check_schedule_overlap()
RETURNS TRIGGER AS $$
DECLARE
    overlap_count INTEGER;
BEGIN
    -- 같은 직원의 겹치는 시간대 체크
    SELECT COUNT(*)
    INTO overlap_count
    FROM schedule_shifts
    WHERE employee_id = NEW.employee_id
        AND shift_date = NEW.shift_date
        AND id != COALESCE(NEW.id, 0)
        AND status NOT IN ('cancelled')
        AND (
            -- 시작 시간이 기존 시프트 중간에 있는 경우
            (NEW.start_time >= start_time AND NEW.start_time < end_time)
            -- 종료 시간이 기존 시프트 중간에 있는 경우
            OR (NEW.end_time > start_time AND NEW.end_time <= end_time)
            -- 새 시프트가 기존 시프트를 완전히 포함하는 경우
            OR (NEW.start_time <= start_time AND NEW.end_time >= end_time)
        );

    IF overlap_count > 0 THEN
        RAISE EXCEPTION '해당 시간대에 이미 스케줄이 존재합니다 (직원 ID: %, 날짜: %, 시간: %-%)',
            NEW.employee_id, NEW.shift_date, NEW.start_time, NEW.end_time;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_check_schedule_overlap
    BEFORE INSERT OR UPDATE ON schedule_shifts
    FOR EACH ROW
    EXECUTE FUNCTION check_schedule_overlap();

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedule_shifts_updated_at
    BEFORE UPDATE ON schedule_shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedule_patterns_updated_at
    BEFORE UPDATE ON schedule_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedule_requests_updated_at
    BEFORE UPDATE ON schedule_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 스케줄 변경 시 자동 이력 저장 트리거
CREATE OR REPLACE FUNCTION record_schedule_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- 실제로 값이 변경된 경우에만 이력 저장
        IF OLD.start_time != NEW.start_time
           OR OLD.end_time != NEW.end_time
           OR OLD.status != NEW.status THEN

            INSERT INTO schedule_history (
                schedule_shift_id,
                changed_by,
                change_type,
                old_values,
                new_values
            ) VALUES (
                NEW.id,
                COALESCE(current_setting('app.current_user_id', true)::INTEGER, 1),
                'modified',
                jsonb_build_object(
                    'start_time', OLD.start_time,
                    'end_time', OLD.end_time,
                    'break_minutes', OLD.break_minutes,
                    'status', OLD.status
                ),
                jsonb_build_object(
                    'start_time', NEW.start_time,
                    'end_time', NEW.end_time,
                    'break_minutes', NEW.break_minutes,
                    'status', NEW.status
                )
            );
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO schedule_history (
            schedule_shift_id,
            changed_by,
            change_type,
            new_values
        ) VALUES (
            NEW.id,
            COALESCE(current_setting('app.current_user_id', true)::INTEGER, 1),
            'created',
            jsonb_build_object(
                'start_time', NEW.start_time,
                'end_time', NEW.end_time,
                'break_minutes', NEW.break_minutes,
                'status', NEW.status
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 스케줄 변경 이력 트리거
CREATE TRIGGER trigger_record_schedule_history
    AFTER INSERT OR UPDATE ON schedule_shifts
    FOR EACH ROW
    EXECUTE FUNCTION record_schedule_history();

-- 샘플 패턴 데이터 (옵션)
-- INSERT INTO schedule_patterns (business_id, name, description, pattern) VALUES
-- (1, '주간 근무', '월-금 09:00-18:00',
--  '{"monday": {"start": "09:00", "end": "18:00", "break": 60},
--    "tuesday": {"start": "09:00", "end": "18:00", "break": 60},
--    "wednesday": {"start": "09:00", "end": "18:00", "break": 60},
--    "thursday": {"start": "09:00", "end": "18:00", "break": 60},
--    "friday": {"start": "09:00", "end": "18:00", "break": 60}}'::jsonb);