-- T124: 에러 로그 테이블 생성
-- 시스템 에러 및 예외 상황 추적

CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,

    -- 에러 정보
    message TEXT NOT NULL,
    stack TEXT,
    status_code INTEGER DEFAULT 500,

    -- 요청 정보
    method VARCHAR(10),
    url TEXT,
    ip_address INET,

    -- 사용자 정보 (있는 경우)
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- 메타데이터
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 인덱스
    INDEX idx_error_logs_created_at (created_at DESC),
    INDEX idx_error_logs_status_code (status_code),
    INDEX idx_error_logs_user_id (user_id)
);

-- 파티셔닝 설정 (월별로 테이블 분할 - 선택사항)
-- 대량의 로그가 쌓일 경우 성능 최적화
COMMENT ON TABLE error_logs IS '시스템 에러 로그 - 월별 파티셔닝 가능';

-- 30일 이상 된 로그 자동 삭제 정책 (선택사항)
-- 프로덕션에서는 별도 아카이빙 고려
CREATE OR REPLACE FUNCTION cleanup_old_error_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM error_logs
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 일일 정리 작업 스케줄 (pg_cron 확장 필요)
-- SELECT cron.schedule('cleanup-error-logs', '0 2 * * *', 'SELECT cleanup_old_error_logs();');