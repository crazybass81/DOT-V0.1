-- 019_create_businesses.sql
-- 사업장 정보 테이블 생성 (PostGIS POINT 타입 사용)
-- Based on data-model.md specifications

BEGIN;

-- PostGIS 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;

-- businesses 테이블 생성
CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    registration_number VARCHAR(20) UNIQUE NOT NULL,
    business_type VARCHAR(50) NOT NULL,
    industry_type VARCHAR(50),
    address TEXT NOT NULL,
    location POINT NOT NULL, -- PostGIS POINT for GPS coordinates
    phone VARCHAR(20),
    subscription_plan VARCHAR(50) DEFAULT 'free',
    subscription_expires_at TIMESTAMP,
    timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
    language VARCHAR(10) DEFAULT 'ko',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- CHECK 제약조건
    CONSTRAINT chk_business_type CHECK (
        business_type IN ('개인사업자', '법인사업자')
    ),
    CONSTRAINT chk_industry_type CHECK (
        industry_type IN ('카페', '레스토랑', '바', '베이커리') OR industry_type IS NULL
    )
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_businesses_registration ON businesses(registration_number);
CREATE INDEX IF NOT EXISTS idx_businesses_location ON businesses USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_businesses_business_type ON businesses(business_type);
CREATE INDEX IF NOT EXISTS idx_businesses_industry_type ON businesses(industry_type);

-- 한글 주석 추가
COMMENT ON TABLE businesses IS '사업장 정보 및 설정';
COMMENT ON COLUMN businesses.id IS '사업장 고유 식별자';
COMMENT ON COLUMN businesses.name IS '사업장명';
COMMENT ON COLUMN businesses.registration_number IS '사업자등록번호';
COMMENT ON COLUMN businesses.business_type IS '사업자 형태 (개인/법인)';
COMMENT ON COLUMN businesses.industry_type IS '업종 (카페/레스토랑/바/베이커리)';
COMMENT ON COLUMN businesses.address IS '사업장 주소';
COMMENT ON COLUMN businesses.location IS 'GPS 좌표 (PostGIS POINT)';
COMMENT ON COLUMN businesses.phone IS '사업장 전화번호';
COMMENT ON COLUMN businesses.subscription_plan IS '구독 플랜';
COMMENT ON COLUMN businesses.subscription_expires_at IS '구독 만료일';
COMMENT ON COLUMN businesses.timezone IS '시간대 설정';
COMMENT ON COLUMN businesses.language IS '언어 설정';
COMMENT ON COLUMN businesses.settings IS 'JSON 형태의 추가 설정';
COMMENT ON COLUMN businesses.created_at IS '사업장 등록 시간';
COMMENT ON COLUMN businesses.updated_at IS '마지막 수정 시간';

-- updated_at 자동 업데이트 트리거 생성
CREATE TRIGGER update_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;