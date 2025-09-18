-- 021_create_attendance.sql
-- 근태 기록 테이블 생성 (GPS 위치 검증, QR 코드 검증 필드 포함)
-- Based on data-model.md specifications

BEGIN;

-- attendances 테이블 생성
CREATE TABLE IF NOT EXISTS attendances (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    user_role_id INTEGER NOT NULL REFERENCES user_roles(id),

    date DATE NOT NULL,

    -- 출근 정보
    check_in_time TIMESTAMP,
    check_in_location POINT, -- GPS 좌표
    check_in_method VARCHAR(20), -- 'qr', 'manual', 'gps'

    -- 퇴근 정보
    check_out_time TIMESTAMP,
    check_out_location POINT, -- GPS 좌표
    check_out_method VARCHAR(20), -- 'qr', 'manual', 'gps'

    -- 휴게시간 배열
    break_start_times TIMESTAMP[],
    break_end_times TIMESTAMP[],
    break_locations POINT[],

    -- 외근시간 배열
    outside_work_start_times TIMESTAMP[],
    outside_work_end_times TIMESTAMP[],
    outside_work_locations POINT[],

    -- 상태 및 계산 필드
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    total_work_minutes INTEGER,
    total_break_minutes INTEGER,
    overtime_minutes INTEGER,

    -- 기타 정보
    notes TEXT,
    anomalies JSONB DEFAULT '[]', -- [{type: 'late', minutes: 30}, {type: 'early_leave', minutes: 60}]

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 복합 유니크 제약조건
    UNIQUE(business_id, user_id, date),

    -- CHECK 제약조건
    CONSTRAINT chk_attendance_status CHECK (
        status IN ('scheduled', 'checked_in', 'on_break', 'outside_work', 'checked_out')
    ),
    CONSTRAINT chk_check_in_method CHECK (
        check_in_method IN ('qr', 'manual', 'gps') OR check_in_method IS NULL
    ),
    CONSTRAINT chk_check_out_method CHECK (
        check_out_method IN ('qr', 'manual', 'gps') OR check_out_method IS NULL
    ),
    CONSTRAINT chk_check_times CHECK (
        check_out_time IS NULL OR check_in_time IS NULL OR check_out_time >= check_in_time
    )
);

-- QR 코드 테이블 생성 (QR 코드 검증용)
CREATE TABLE IF NOT EXISTS qr_codes (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    code_data TEXT NOT NULL UNIQUE,
    qr_image_url TEXT,
    location POINT NOT NULL, -- QR 코드 위치
    allowed_radius INTEGER DEFAULT 50, -- 허용 반경 (미터)
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- attendances 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_attendances_business_date ON attendances(business_id, date);
CREATE INDEX IF NOT EXISTS idx_attendances_user_date ON attendances(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendances_status ON attendances(status);
CREATE INDEX IF NOT EXISTS idx_attendances_business_user_date ON attendances(business_id, user_id, date DESC);

-- 오늘 날짜 출석 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_attendances_today
ON attendances(business_id, status)
WHERE date = CURRENT_DATE;

-- GPS 위치 검증용 spatial 인덱스
CREATE INDEX IF NOT EXISTS idx_attendances_check_in_location ON attendances USING GIST(check_in_location);
CREATE INDEX IF NOT EXISTS idx_attendances_check_out_location ON attendances USING GIST(check_out_location);

-- qr_codes 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_qr_codes_business ON qr_codes(business_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code_data);
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON qr_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_qr_codes_location ON qr_codes USING GIST(location);

-- 한글 주석 추가
COMMENT ON TABLE attendances IS '출퇴근 및 근무 상태 기록';
COMMENT ON COLUMN attendances.id IS '출석 기록 고유 식별자';
COMMENT ON COLUMN attendances.business_id IS '사업장 ID';
COMMENT ON COLUMN attendances.user_id IS '사용자 ID';
COMMENT ON COLUMN attendances.user_role_id IS '사용자 역할 ID';
COMMENT ON COLUMN attendances.date IS '출근 날짜';
COMMENT ON COLUMN attendances.check_in_time IS '출근 시간';
COMMENT ON COLUMN attendances.check_in_location IS '출근 GPS 좌표';
COMMENT ON COLUMN attendances.check_in_method IS '출근 방식 (qr/manual/gps)';
COMMENT ON COLUMN attendances.check_out_time IS '퇴근 시간';
COMMENT ON COLUMN attendances.check_out_location IS '퇴근 GPS 좌표';
COMMENT ON COLUMN attendances.check_out_method IS '퇴근 방식 (qr/manual/gps)';
COMMENT ON COLUMN attendances.status IS '현재 상태';
COMMENT ON COLUMN attendances.anomalies IS 'JSON 형태의 이상사항 기록';

COMMENT ON TABLE qr_codes IS 'QR 코드 출퇴근 검증용';
COMMENT ON COLUMN qr_codes.code_data IS 'QR 코드 데이터';
COMMENT ON COLUMN qr_codes.location IS 'QR 코드 설치 위치';
COMMENT ON COLUMN qr_codes.allowed_radius IS '허용 반경 (미터)';

-- updated_at 자동 업데이트 트리거 생성
CREATE TRIGGER update_attendances_updated_at
    BEFORE UPDATE ON attendances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qr_codes_updated_at
    BEFORE UPDATE ON qr_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;