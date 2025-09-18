/**
 * T217: Documents 테이블 생성 마이그레이션
 * 문서 관리를 위한 테이블 생성
 * 파일 메타데이터, 소유권, 만료 관리 포함
 */

-- PostGIS extension 확인 (위치 데이터가 필요한 경우)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- Documents 테이블 생성
CREATE TABLE IF NOT EXISTS documents (
    -- 기본 식별자
    id SERIAL PRIMARY KEY,

    -- 소유권 정보
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id INTEGER NULL REFERENCES businesses(id) ON DELETE SET NULL,

    -- 파일 정보
    filename VARCHAR(255) NOT NULL, -- 저장된 파일명 (UUID 포함)
    original_filename VARCHAR(255) NOT NULL, -- 원본 파일명
    file_type VARCHAR(50) NOT NULL, -- 파일 확장자
    file_size INTEGER NOT NULL, -- 파일 크기 (bytes)
    storage_path VARCHAR(500) NOT NULL, -- 저장 경로

    -- 분류 및 메타데이터
    category VARCHAR(50) NULL, -- 문서 카테고리 (contract, certificate, report 등)
    tags JSONB DEFAULT '[]'::jsonb, -- 태그 배열

    -- 접근 제어
    is_public BOOLEAN DEFAULT false, -- 공개 문서 여부
    access_control JSONB DEFAULT '{}'::jsonb, -- 세부 접근 권한 설정

    -- 만료 관리
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 years'), -- 3년 후 자동 만료

    -- 타임스탬프
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 파일 크기 제한 (10MB = 10,485,760 bytes)
ALTER TABLE documents
ADD CONSTRAINT documents_file_size_limit
CHECK (file_size > 0 AND file_size <= 10485760);

-- 허용 파일 타입 제한
ALTER TABLE documents
ADD CONSTRAINT documents_file_type_allowed
CHECK (file_type IN ('pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'));

-- 파일명 길이 제한
ALTER TABLE documents
ADD CONSTRAINT documents_filename_length
CHECK (LENGTH(filename) <= 255 AND LENGTH(original_filename) <= 255);

-- 저장 경로 유효성 (빈 문자열 방지)
ALTER TABLE documents
ADD CONSTRAINT documents_storage_path_valid
CHECK (LENGTH(TRIM(storage_path)) > 0);

-- 만료일은 생성일보다 미래여야 함
ALTER TABLE documents
ADD CONSTRAINT documents_expires_after_created
CHECK (expires_at > created_at);

-- updated_at 자동 업데이트 트리거 함수 생성
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 자동 업데이트 트리거 생성
DROP TRIGGER IF EXISTS documents_updated_at_trigger ON documents;
CREATE TRIGGER documents_updated_at_trigger
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- 테이블 코멘트 추가
COMMENT ON TABLE documents IS '문서 관리 테이블 - 파일 업로드/다운로드 메타데이터';
COMMENT ON COLUMN documents.id IS '문서 고유 식별자';
COMMENT ON COLUMN documents.owner_id IS '문서 소유자 (users 테이블 참조)';
COMMENT ON COLUMN documents.business_id IS '연관 사업장 (선택사항, businesses 테이블 참조)';
COMMENT ON COLUMN documents.filename IS '서버에 저장된 파일명 (UUID 포함)';
COMMENT ON COLUMN documents.original_filename IS '사용자가 업로드한 원본 파일명';
COMMENT ON COLUMN documents.file_type IS '파일 확장자 (pdf, jpg, jpeg, png, doc, docx만 허용)';
COMMENT ON COLUMN documents.file_size IS '파일 크기 (bytes, 최대 10MB)';
COMMENT ON COLUMN documents.storage_path IS '파일 저장 절대 경로';
COMMENT ON COLUMN documents.category IS '문서 카테고리 (contract, certificate, report 등)';
COMMENT ON COLUMN documents.tags IS '문서 태그 배열 (JSON)';
COMMENT ON COLUMN documents.is_public IS '공개 문서 여부 (true면 모든 사용자 접근 가능)';
COMMENT ON COLUMN documents.access_control IS '세부 접근 권한 설정 (JSON)';
COMMENT ON COLUMN documents.expires_at IS '문서 만료일 (기본 3년 후, 만료시 자동 삭제 대상)';
COMMENT ON COLUMN documents.created_at IS '문서 업로드 일시';
COMMENT ON COLUMN documents.updated_at IS '문서 메타데이터 최종 수정 일시';

-- 권한 설정 (필요시)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO app_user;
-- GRANT USAGE, SELECT ON SEQUENCE documents_id_seq TO app_user;