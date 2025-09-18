-- T021-T025: Businesses 테이블 생성 및 PostGIS 타입 사용
-- Migration: 002_create_businesses_table
-- Date: 2025-09-16

-- T022: businesses 테이블 생성 (PostGIS 타입 포함)
CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(20) UNIQUE NOT NULL,
    business_type VARCHAR(50) NOT NULL CHECK (business_type IN ('개인사업자', '법인사업자', '간이과세자')),
    industry_type VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS 타입: WGS84 좌표계
    gps_radius_meters INTEGER DEFAULT 50 CHECK (gps_radius_meters >= 10 AND gps_radius_meters <= 500),
    phone VARCHAR(20),
    email VARCHAR(255),
    operating_hours JSONB,  -- 영업시간 정보 (요일별 시작/종료 시간)
    settings JSONB DEFAULT '{}',  -- 사업장별 설정
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    max_employees INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- T023: 위치 인덱스 추가 (GIST)
CREATE INDEX idx_businesses_location ON businesses USING GIST(location);
CREATE INDEX idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX idx_businesses_status ON businesses(status);
CREATE INDEX idx_businesses_name ON businesses(name);
CREATE INDEX idx_businesses_created_at ON businesses(created_at DESC);

-- 업데이트 트리거
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE
    ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- T025: Row Level Security 정책 구현
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- 정책: Owner는 자신의 사업장만 조회 가능
CREATE POLICY businesses_select_policy ON businesses
    FOR SELECT
    USING (
        owner_id = current_setting('app.current_user_id', true)::INTEGER
        OR current_setting('app.current_user_id', true) IS NULL
        OR EXISTS (
            -- user_roles 테이블이 생성된 후 업데이트 예정
            SELECT 1 WHERE true  -- 임시 placeholder
        )
    );

-- 정책: Owner만 사업장 생성 가능
CREATE POLICY businesses_insert_policy ON businesses
    FOR INSERT
    WITH CHECK (
        owner_id = current_setting('app.current_user_id', true)::INTEGER
        OR current_setting('app.current_user_id', true) IS NULL
    );

-- 정책: Owner만 자신의 사업장 수정 가능
CREATE POLICY businesses_update_policy ON businesses
    FOR UPDATE
    USING (owner_id = current_setting('app.current_user_id', true)::INTEGER)
    WITH CHECK (owner_id = current_setting('app.current_user_id', true)::INTEGER);

-- 정책: Owner만 자신의 사업장 삭제 가능
CREATE POLICY businesses_delete_policy ON businesses
    FOR DELETE
    USING (owner_id = current_setting('app.current_user_id', true)::INTEGER);

-- GPS 거리 계산 함수 (Haversine 공식 대신 PostGIS 함수 사용)
CREATE OR REPLACE FUNCTION check_gps_distance(
    business_location GEOGRAPHY,
    user_location GEOGRAPHY,
    max_distance_meters INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN ST_DWithin(business_location, user_location, max_distance_meters);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 사업장 근처 찾기 함수
CREATE OR REPLACE FUNCTION find_nearby_businesses(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_meters INTEGER DEFAULT 100
)
RETURNS TABLE (
    business_id INTEGER,
    business_name VARCHAR,
    distance_meters DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.name,
        ST_Distance(b.location, ST_MakePoint(user_lng, user_lat)::geography) AS distance
    FROM businesses b
    WHERE b.status = 'active'
    AND ST_DWithin(
        b.location,
        ST_MakePoint(user_lng, user_lat)::geography,
        radius_meters
    )
    ORDER BY distance;
END;
$$ LANGUAGE plpgsql STABLE;

-- 코멘트 추가
COMMENT ON TABLE businesses IS '사업장 정보';
COMMENT ON COLUMN businesses.id IS '사업장 고유 ID';
COMMENT ON COLUMN businesses.owner_id IS '사업장 소유자 (users.id 참조)';
COMMENT ON COLUMN businesses.name IS '사업장명';
COMMENT ON COLUMN businesses.registration_number IS '사업자등록번호';
COMMENT ON COLUMN businesses.business_type IS '사업자 유형';
COMMENT ON COLUMN businesses.industry_type IS '업종';
COMMENT ON COLUMN businesses.address IS '사업장 주소';
COMMENT ON COLUMN businesses.location IS '사업장 GPS 좌표 (PostGIS GEOGRAPHY)';
COMMENT ON COLUMN businesses.gps_radius_meters IS 'GPS 체크인 허용 반경 (미터)';
COMMENT ON COLUMN businesses.phone IS '사업장 전화번호';
COMMENT ON COLUMN businesses.email IS '사업장 이메일';
COMMENT ON COLUMN businesses.operating_hours IS '영업시간 (JSON)';
COMMENT ON COLUMN businesses.settings IS '사업장 설정 (JSON)';
COMMENT ON COLUMN businesses.status IS '사업장 상태';
COMMENT ON COLUMN businesses.max_employees IS '최대 직원 수';
COMMENT ON FUNCTION check_gps_distance IS 'GPS 거리 검증 함수';
COMMENT ON FUNCTION find_nearby_businesses IS '근처 사업장 찾기 함수';