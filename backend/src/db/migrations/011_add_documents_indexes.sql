/**
 * T218: Documents 테이블 인덱스 추가
 * 검색 성능 최적화를 위한 인덱스 생성
 * 자주 사용되는 조회 패턴에 맞춘 인덱스 설계
 */

-- 소유자별 문서 조회 인덱스 (가장 자주 사용됨)
CREATE INDEX IF NOT EXISTS idx_documents_owner_id
ON documents(owner_id);

-- 사업장별 문서 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_documents_business_id
ON documents(business_id)
WHERE business_id IS NOT NULL;

-- 카테고리별 문서 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_documents_category
ON documents(category)
WHERE category IS NOT NULL;

-- 만료일 기준 조회 인덱스 (만료된 문서 정리용)
CREATE INDEX IF NOT EXISTS idx_documents_expires_at
ON documents(expires_at)
WHERE expires_at IS NOT NULL;

-- 생성일 기준 조회 인덱스 (최신 문서 조회용)
CREATE INDEX IF NOT EXISTS idx_documents_created_at
ON documents(created_at DESC);

-- 파일 타입별 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_documents_file_type
ON documents(file_type);

-- 공개 문서 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_documents_public
ON documents(is_public)
WHERE is_public = true;

-- 복합 인덱스: 사업장 + 카테고리 조회 최적화
CREATE INDEX IF NOT EXISTS idx_documents_business_category
ON documents(business_id, category)
WHERE business_id IS NOT NULL AND category IS NOT NULL;

-- 복합 인덱스: 소유자 + 생성일 조회 최적화 (개인 문서 이력)
CREATE INDEX IF NOT EXISTS idx_documents_owner_created
ON documents(owner_id, created_at DESC);

-- 복합 인덱스: 만료 예정 문서 조회 (만료일 + 상태)
-- Note: NOW() 함수는 인덱스에서 사용할 수 없으므로 응용에서 처리
CREATE INDEX IF NOT EXISTS idx_documents_expiring
ON documents(expires_at, created_at);

-- JSONB 인덱스: 태그 검색 최적화
CREATE INDEX IF NOT EXISTS idx_documents_tags_gin
ON documents USING GIN(tags);

-- JSONB 인덱스: 접근 제어 설정 검색
CREATE INDEX IF NOT EXISTS idx_documents_access_control_gin
ON documents USING GIN(access_control);

-- 전문 검색 인덱스: 파일명 검색 최적화
CREATE INDEX IF NOT EXISTS idx_documents_filename_search
ON documents USING GIN(to_tsvector('simple', original_filename));

-- 부분 인덱스: 활성 문서만 (만료되지 않은 문서)
-- Note: NOW() 함수는 인덱스에서 사용할 수 없으므로 NULL 체크만 적용
CREATE INDEX IF NOT EXISTS idx_documents_active
ON documents(owner_id, business_id, created_at DESC)
WHERE expires_at IS NOT NULL;

-- 인덱스 코멘트 추가
COMMENT ON INDEX idx_documents_owner_id IS '소유자별 문서 조회 최적화';
COMMENT ON INDEX idx_documents_business_id IS '사업장별 문서 조회 최적화';
COMMENT ON INDEX idx_documents_category IS '카테고리별 문서 조회 최적화';
COMMENT ON INDEX idx_documents_expires_at IS '만료일 기준 정리 작업 최적화';
COMMENT ON INDEX idx_documents_created_at IS '최신 문서 조회 최적화';
COMMENT ON INDEX idx_documents_file_type IS '파일 타입별 조회 최적화';
COMMENT ON INDEX idx_documents_public IS '공개 문서 조회 최적화';
COMMENT ON INDEX idx_documents_business_category IS '사업장 + 카테고리 복합 조회 최적화';
COMMENT ON INDEX idx_documents_owner_created IS '개인 문서 이력 조회 최적화';
COMMENT ON INDEX idx_documents_expiring IS '만료 예정 문서 관리 최적화';
COMMENT ON INDEX idx_documents_tags_gin IS '태그 기반 검색 최적화 (GIN)';
COMMENT ON INDEX idx_documents_access_control_gin IS '접근 제어 설정 검색 최적화 (GIN)';
COMMENT ON INDEX idx_documents_filename_search IS '파일명 전문 검색 최적화 (한국어)';
COMMENT ON INDEX idx_documents_active IS '활성 문서 조회 최적화 (부분 인덱스)';

-- 인덱스 사용량 모니터링을 위한 뷰 생성 (선택사항)
CREATE OR REPLACE VIEW documents_index_usage AS
SELECT
    schemaname,
    relname as tablename,
    indexrelname as indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan
FROM pg_stat_user_indexes
WHERE relname = 'documents'
ORDER BY idx_scan DESC;

COMMENT ON VIEW documents_index_usage IS 'Documents 테이블 인덱스 사용량 모니터링 뷰';

-- 통계 정보 업데이트 (선택사항)
ANALYZE documents;