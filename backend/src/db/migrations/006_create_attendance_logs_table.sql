-- T132: 출퇴근 로그 테이블 생성
-- 출퇴근 관련 모든 활동 기록

CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL PRIMARY KEY,

    -- 관련 레코드
    attendance_id INTEGER REFERENCES attendance(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

    -- 활동 정보
    action VARCHAR(50) NOT NULL, -- check_in, check_out, check_in_cancelled, etc.
    details JSONB, -- 추가 정보 (위치, 방법, 사유 등)

    -- 시간 정보
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 인덱스
    INDEX idx_attendance_logs_user_id (user_id),
    INDEX idx_attendance_logs_attendance_id (attendance_id),
    INDEX idx_attendance_logs_action (action),
    INDEX idx_attendance_logs_created_at (created_at DESC)
);

-- 액션 타입 코멘트
COMMENT ON COLUMN attendance_logs.action IS 'check_in, check_out, check_in_cancelled, check_out_cancelled, break_start, break_end, location_updated, manual_correction';

-- 휴게 시간 테이블도 생성 (attendance_breaks)
CREATE TABLE IF NOT EXISTS attendance_breaks (
    id SERIAL PRIMARY KEY,

    -- 관련 레코드
    attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 휴게 정보
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    break_type VARCHAR(20) DEFAULT 'normal', -- normal, meal, personal

    -- 메타데이터
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 인덱스
    INDEX idx_attendance_breaks_attendance_id (attendance_id),
    INDEX idx_attendance_breaks_user_id (user_id),
    INDEX idx_attendance_breaks_start_time (start_time)
);

-- 제약 조건: 종료 시간은 시작 시간 이후여야 함
ALTER TABLE attendance_breaks ADD CONSTRAINT check_break_times
    CHECK (end_time IS NULL OR end_time > start_time);