-- 026_create_documents.sql
-- 문서 관리 테이블 생성 (10MB 파일 크기 제한)
-- Based on data-model.md specifications

BEGIN;

-- documents 테이블 생성
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER REFERENCES businesses(id),

    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size INTEGER NOT NULL, -- bytes

    storage_path TEXT NOT NULL,

    category VARCHAR(50),

    is_public BOOLEAN DEFAULT FALSE,

    expires_at TIMESTAMP, -- 3년 후 자동 설정

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- CHECK 제약조건
    CONSTRAINT chk_documents_file_size CHECK (
        file_size > 0 AND file_size <= 10485760 -- 10MB 제한
    ),
    CONSTRAINT chk_documents_file_type CHECK (
        file_type IN ('pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx')
    ),
    CONSTRAINT chk_documents_category CHECK (
        category IN ('계약서', '증명서', '급여명세서', '기타') OR category IS NULL
    ),
    CONSTRAINT chk_documents_filename CHECK (
        filename IS NOT NULL AND length(filename) > 0
    ),
    CONSTRAINT chk_documents_storage_path CHECK (
        storage_path IS NOT NULL AND length(storage_path) > 0
    )
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_business ON documents(business_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_expires ON documents(expires_at);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_is_public ON documents(is_public);

-- 복합 인덱스 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_documents_user_category
ON documents(user_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_business_category
ON documents(business_id, category, created_at DESC)
WHERE business_id IS NOT NULL;

-- 만료된 문서 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_documents_expired
ON documents(expires_at)
WHERE expires_at < CURRENT_TIMESTAMP;

-- 자동 만료 설정 함수
CREATE OR REPLACE FUNCTION set_document_expiry()
RETURNS TRIGGER AS $$
BEGIN
    -- 3년 후 자동 만료 설정
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at := NEW.created_at + INTERVAL '3 years';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 자동 만료 설정 트리거
CREATE TRIGGER set_document_expiry_trigger
    BEFORE INSERT ON documents
    FOR EACH ROW
    EXECUTE FUNCTION set_document_expiry();

-- 파일 크기 검증 함수
CREATE OR REPLACE FUNCTION validate_file_upload(
    p_file_size INTEGER,
    p_file_type TEXT,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    user_total_size BIGINT;
    max_user_storage BIGINT := 104857600; -- 100MB per user
BEGIN
    -- 파일 크기 검증
    IF p_file_size <= 0 OR p_file_size > 10485760 THEN -- 10MB
        RETURN FALSE;
    END IF;

    -- 파일 타입 검증
    IF p_file_type NOT IN ('pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx') THEN
        RETURN FALSE;
    END IF;

    -- 사용자 전체 저장소 사용량 확인
    SELECT COALESCE(SUM(file_size), 0) INTO user_total_size
    FROM documents
    WHERE user_id = p_user_id
    AND expires_at > CURRENT_TIMESTAMP;

    IF (user_total_size + p_file_size) > max_user_storage THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 정기적인 만료 문서 정리 함수
CREATE OR REPLACE FUNCTION cleanup_expired_documents()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- 만료된 문서 삭제
    DELETE FROM documents
    WHERE expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 한글 주석 추가
COMMENT ON TABLE documents IS '사용자 문서 관리 (3년 보관)';
COMMENT ON COLUMN documents.id IS '문서 고유 식별자';
COMMENT ON COLUMN documents.user_id IS '문서 소유자 ID';
COMMENT ON COLUMN documents.business_id IS '관련 사업장 ID (선택적)';
COMMENT ON COLUMN documents.filename IS '저장된 파일명';
COMMENT ON COLUMN documents.original_filename IS '원본 파일명';
COMMENT ON COLUMN documents.file_type IS '파일 형식 (pdf/jpg/jpeg/png/doc/docx)';
COMMENT ON COLUMN documents.file_size IS '파일 크기 (바이트, 최대 10MB)';
COMMENT ON COLUMN documents.storage_path IS '파일 저장 경로';
COMMENT ON COLUMN documents.category IS '문서 분류 (계약서/증명서/급여명세서/기타)';
COMMENT ON COLUMN documents.is_public IS '공개 여부';
COMMENT ON COLUMN documents.expires_at IS '문서 만료일 (3년 후 자동 설정)';
COMMENT ON COLUMN documents.created_at IS '문서 업로드 시간';
COMMENT ON COLUMN documents.updated_at IS '마지막 수정 시간';

COMMIT;