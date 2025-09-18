-- DOT Platform V0.1 - 데이터베이스 인덱스 최적화
-- 실행 시간: 2025-09-18
-- 목적: 쿼리 성능 향상을 위한 인덱스 생성

-- ============================================
-- 1. 인증 및 사용자 관련 인덱스
-- ============================================

-- 이메일로 사용자 조회 (로그인 시 사용)
CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email)
WHERE deleted_at IS NULL;

-- 전화번호로 사용자 조회 (SMS 인증)
CREATE INDEX IF NOT EXISTS idx_users_phone
ON users(phone)
WHERE deleted_at IS NULL;

-- 사용자 상태 필터링
CREATE INDEX IF NOT EXISTS idx_users_status
ON users(status)
WHERE deleted_at IS NULL;

-- ============================================
-- 2. 사업장 및 역할 관련 인덱스
-- ============================================

-- 사업장 소유자 조회
CREATE INDEX IF NOT EXISTS idx_businesses_owner
ON businesses(owner_id)
WHERE deleted_at IS NULL;

-- 사업장 상태별 조회
CREATE INDEX IF NOT EXISTS idx_businesses_status
ON businesses(status)
WHERE deleted_at IS NULL;

-- 사용자 역할 조회 (복합 인덱스)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_business
ON user_roles(user_id, business_id)
WHERE is_active = true;

-- 사업장별 직원 목록 조회
CREATE INDEX IF NOT EXISTS idx_user_roles_business_role
ON user_roles(business_id, role)
WHERE is_active = true;

-- 역할별 권한 조회 (JSONB 인덱스)
CREATE INDEX IF NOT EXISTS idx_user_roles_permissions
ON user_roles USING GIN (permissions)
WHERE is_active = true;

-- ============================================
-- 3. 근태 관리 인덱스
-- ============================================

-- 일자별 근태 조회 (가장 빈번한 쿼리)
CREATE INDEX IF NOT EXISTS idx_attendance_date_user
ON attendance(date DESC, user_id, business_id);

-- 사용자별 근태 이력 조회
CREATE INDEX IF NOT EXISTS idx_attendance_user_date
ON attendance(user_id, business_id, date DESC);

-- 사업장별 일일 근태 현황
CREATE INDEX IF NOT EXISTS idx_attendance_business_date
ON attendance(business_id, date DESC, status);

-- 근태 상태별 조회
CREATE INDEX IF NOT EXISTS idx_attendance_status
ON attendance(status, date DESC)
WHERE status IN ('checked_in', 'checked_out');

-- GPS 위치 기반 조회 (PostGIS 공간 인덱스)
CREATE INDEX IF NOT EXISTS idx_attendance_gps_location
ON attendance USING GIST (gps_location);

-- ============================================
-- 4. 스케줄 관리 인덱스
-- ============================================

-- 사업장별 스케줄 조회
CREATE INDEX IF NOT EXISTS idx_schedules_business_date
ON schedules(business_id, start_date, end_date);

-- 스케줄 상태별 조회
CREATE INDEX IF NOT EXISTS idx_schedules_status
ON schedules(status)
WHERE status != 'deleted';

-- 반복 스케줄 조회
CREATE INDEX IF NOT EXISTS idx_schedules_recurrence
ON schedules(recurrence_pattern)
WHERE recurrence_pattern IS NOT NULL;

-- 스케줄 할당 조회 (사용자별)
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_user
ON schedule_assignments(user_id, schedule_id)
WHERE deleted_at IS NULL;

-- 스케줄 할당 조회 (스케줄별)
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_schedule
ON schedule_assignments(schedule_id, assignment_date)
WHERE deleted_at IS NULL;

-- 스케줄 교대 요청 조회
CREATE INDEX IF NOT EXISTS idx_schedule_swaps_status
ON schedule_swaps(status, requested_at DESC)
WHERE status = 'pending';

-- ============================================
-- 5. 급여 관리 인덱스
-- ============================================

-- 급여 명세서 조회 (사용자별, 기간별)
CREATE INDEX IF NOT EXISTS idx_pay_statements_user_period
ON pay_statements(user_id, pay_period_start DESC, pay_period_end DESC);

-- 사업장별 급여 명세서 조회
CREATE INDEX IF NOT EXISTS idx_pay_statements_business_period
ON pay_statements(business_id, pay_period_start DESC);

-- 급여 상태별 조회
CREATE INDEX IF NOT EXISTS idx_pay_statements_status
ON pay_statements(status, pay_period_start DESC)
WHERE status IN ('pending', 'approved');

-- 급여 항목 분석 (JSONB 인덱스)
CREATE INDEX IF NOT EXISTS idx_pay_statements_breakdown
ON pay_statements USING GIN (pay_breakdown);

-- ============================================
-- 6. 문서 관리 인덱스
-- ============================================

-- 문서 소유자별 조회
CREATE INDEX IF NOT EXISTS idx_documents_owner
ON documents(owner_id, created_at DESC)
WHERE deleted_at IS NULL;

-- 문서 타입별 조회
CREATE INDEX IF NOT EXISTS idx_documents_type
ON documents(document_type, created_at DESC)
WHERE deleted_at IS NULL;

-- 문서 만료일 관리
CREATE INDEX IF NOT EXISTS idx_documents_expiry
ON documents(expires_at)
WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

-- 문서 메타데이터 검색 (JSONB 인덱스)
CREATE INDEX IF NOT EXISTS idx_documents_metadata
ON documents USING GIN (metadata);

-- ============================================
-- 7. 알림 관리 인덱스
-- ============================================

-- 사용자별 알림 조회
CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications(user_id, created_at DESC)
WHERE deleted_at IS NULL;

-- 읽지 않은 알림 조회
CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications(user_id, is_read, created_at DESC)
WHERE is_read = false AND deleted_at IS NULL;

-- 알림 타입별 조회
CREATE INDEX IF NOT EXISTS idx_notifications_type
ON notifications(notification_type, created_at DESC)
WHERE deleted_at IS NULL;

-- 알림 우선순위별 조회
CREATE INDEX IF NOT EXISTS idx_notifications_priority
ON notifications(priority DESC, created_at DESC)
WHERE deleted_at IS NULL;

-- ============================================
-- 8. 감사 로그 인덱스
-- ============================================

-- 감사 로그 조회 (시간 기반)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
ON audit_logs(created_at DESC);

-- 사용자별 감사 로그
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
ON audit_logs(user_id, created_at DESC);

-- 액션별 감사 로그
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action, created_at DESC);

-- IP 주소별 감사 로그
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip
ON audit_logs(ip_address, created_at DESC);

-- ============================================
-- 9. 성능 최적화를 위한 부분 인덱스
-- ============================================

-- 활성 세션 조회 (Redis 백업용)
CREATE INDEX IF NOT EXISTS idx_sessions_active
ON sessions(user_id, expires_at)
WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP;

-- 오늘의 근태 조회 (대시보드용)
CREATE INDEX IF NOT EXISTS idx_attendance_today
ON attendance(business_id, status)
WHERE date = CURRENT_DATE;

-- 이번 주 스케줄 조회
CREATE INDEX IF NOT EXISTS idx_schedules_current_week
ON schedules(business_id, start_date)
WHERE start_date >= date_trunc('week', CURRENT_DATE)
  AND start_date < date_trunc('week', CURRENT_DATE) + interval '7 days';

-- ============================================
-- 10. 통계 및 분석용 인덱스
-- ============================================

-- 월별 근태 통계
CREATE INDEX IF NOT EXISTS idx_attendance_monthly_stats
ON attendance(business_id, date_trunc('month', date), status);

-- 월별 급여 총계
CREATE INDEX IF NOT EXISTS idx_pay_statements_monthly_total
ON pay_statements(business_id, date_trunc('month', pay_period_start), total_amount);

-- 사용자 활동 추적
CREATE INDEX IF NOT EXISTS idx_user_activity
ON audit_logs(user_id, date_trunc('day', created_at), action);

-- ============================================
-- 11. 전문 검색 인덱스 (Full Text Search)
-- ============================================

-- 사용자 이름 검색
CREATE INDEX IF NOT EXISTS idx_users_name_fts
ON users USING GIN (to_tsvector('korean', name));

-- 사업장 이름 검색
CREATE INDEX IF NOT EXISTS idx_businesses_name_fts
ON businesses USING GIN (to_tsvector('korean', name));

-- 문서 제목 검색
CREATE INDEX IF NOT EXISTS idx_documents_title_fts
ON documents USING GIN (to_tsvector('korean', file_name));

-- ============================================
-- 12. 인덱스 유지보수 및 통계 업데이트
-- ============================================

-- 통계 정보 업데이트 (정기적으로 실행 필요)
ANALYZE users;
ANALYZE businesses;
ANALYZE user_roles;
ANALYZE attendance;
ANALYZE schedules;
ANALYZE schedule_assignments;
ANALYZE pay_statements;
ANALYZE documents;
ANALYZE notifications;
ANALYZE audit_logs;

-- ============================================
-- 13. 불필요한 인덱스 정리
-- ============================================

-- 중복되거나 사용되지 않는 인덱스 확인 쿼리
-- (실행 후 수동으로 검토 필요)
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- ============================================
-- 14. 인덱스 성능 모니터링 뷰
-- ============================================

-- 인덱스 사용률 모니터링 뷰
CREATE OR REPLACE VIEW v_index_usage AS
SELECT
    t.schemaname,
    t.tablename,
    indexname,
    c.reltuples AS num_rows,
    pg_size_pretty(pg_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))) AS table_size,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(indexname))) AS index_size,
    idx_scan as number_of_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes t
JOIN pg_class c ON t.relid = c.oid
WHERE t.schemaname = 'public'
ORDER BY t.tablename, indexname;

-- 캐시 히트율 모니터링 뷰
CREATE OR REPLACE VIEW v_cache_hit_ratio AS
SELECT
    schemaname,
    tablename,
    heap_blks_read,
    heap_blks_hit,
    CASE
        WHEN heap_blks_read + heap_blks_hit = 0 THEN 0
        ELSE ROUND(100.0 * heap_blks_hit / (heap_blks_read + heap_blks_hit), 2)
    END AS cache_hit_ratio
FROM pg_statio_user_tables
WHERE schemaname = 'public'
ORDER BY cache_hit_ratio ASC;

-- ============================================
-- 실행 완료 메시지
-- ============================================
-- 모든 인덱스가 성공적으로 생성되었습니다.
-- 정기적인 VACUUM과 ANALYZE 실행을 권장합니다.
-- pg_stat_user_indexes를 통해 인덱스 사용률을 모니터링하세요.