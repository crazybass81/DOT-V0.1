-- 027_create_notifications.sql
-- 알림 관리 테이블 생성 (읽음 상태 관리)
-- Based on data-model.md specifications

BEGIN;

-- notifications 테이블 생성
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER REFERENCES businesses(id),

    type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'email',

    subject VARCHAR(200),
    content TEXT NOT NULL,

    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,

    sent_at TIMESTAMP,
    failed_at TIMESTAMP,
    error_message TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- CHECK 제약조건
    CONSTRAINT chk_notifications_type CHECK (
        type IN ('schedule_change', 'attendance_reminder', 'announcement', 'payroll', 'system', 'warning')
    ),
    CONSTRAINT chk_notifications_channel CHECK (
        channel IN ('email', 'push', 'sms')
    ),
    CONSTRAINT chk_notifications_content CHECK (
        content IS NOT NULL AND length(content) > 0
    ),
    CONSTRAINT chk_notifications_read_consistency CHECK (
        (is_read = FALSE AND read_at IS NULL) OR
        (is_read = TRUE AND read_at IS NOT NULL)
    )
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 복합 인덱스 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, created_at DESC)
WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_business
ON notifications(user_id, business_id, created_at DESC);

-- 발송 실패 알림 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_notifications_failed
ON notifications(failed_at)
WHERE failed_at IS NOT NULL;

-- 알림 읽음 처리 함수
CREATE OR REPLACE FUNCTION mark_notification_as_read(notification_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE notifications
    SET is_read = TRUE,
        read_at = CURRENT_TIMESTAMP
    WHERE id = notification_id
    AND user_id = auth.uid()::integer
    AND is_read = FALSE;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 다중 알림 읽음 처리 함수
CREATE OR REPLACE FUNCTION mark_notifications_as_read(notification_ids INTEGER[])
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE notifications
    SET is_read = TRUE,
        read_at = CURRENT_TIMESTAMP
    WHERE id = ANY(notification_ids)
    AND user_id = auth.uid()::integer
    AND is_read = FALSE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 사용자별 읽지 않은 알림 수 조회 함수
CREATE OR REPLACE FUNCTION get_unread_notification_count(target_user_id INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM notifications
        WHERE user_id = target_user_id
        AND is_read = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 알림 생성 함수
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id INTEGER,
    p_business_id INTEGER,
    p_type VARCHAR(50),
    p_channel VARCHAR(20),
    p_subject VARCHAR(200),
    p_content TEXT
) RETURNS INTEGER AS $$
DECLARE
    notification_id INTEGER;
BEGIN
    INSERT INTO notifications (
        user_id, business_id, type, channel, subject, content
    ) VALUES (
        p_user_id, p_business_id, p_type, p_channel, p_subject, p_content
    ) RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 오래된 알림 정리 함수 (6개월 이상 된 읽은 알림 삭제)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications
    WHERE is_read = TRUE
    AND read_at < CURRENT_TIMESTAMP - INTERVAL '6 months';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 읽음 상태 변경 트리거 함수
CREATE OR REPLACE FUNCTION update_notification_read_status()
RETURNS TRIGGER AS $$
BEGIN
    -- 읽음 처리 시 read_at 자동 설정
    IF NEW.is_read = TRUE AND OLD.is_read = FALSE THEN
        NEW.read_at := CURRENT_TIMESTAMP;
    END IF;

    -- 읽지 않음으로 변경 시 read_at 제거
    IF NEW.is_read = FALSE AND OLD.is_read = TRUE THEN
        NEW.read_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 읽음 상태 변경 트리거
CREATE TRIGGER update_notification_read_status_trigger
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_read_status();

-- 한글 주석 추가
COMMENT ON TABLE notifications IS '알림 설정 및 이력 관리';
COMMENT ON COLUMN notifications.id IS '알림 고유 식별자';
COMMENT ON COLUMN notifications.user_id IS '알림 수신자 ID';
COMMENT ON COLUMN notifications.business_id IS '관련 사업장 ID (선택적)';
COMMENT ON COLUMN notifications.type IS '알림 유형 (schedule_change/attendance_reminder/announcement/payroll/system/warning)';
COMMENT ON COLUMN notifications.channel IS '발송 채널 (email/push/sms)';
COMMENT ON COLUMN notifications.subject IS '알림 제목';
COMMENT ON COLUMN notifications.content IS '알림 내용';
COMMENT ON COLUMN notifications.is_read IS '읽음 여부';
COMMENT ON COLUMN notifications.read_at IS '읽은 시간';
COMMENT ON COLUMN notifications.sent_at IS '발송 시간';
COMMENT ON COLUMN notifications.failed_at IS '발송 실패 시간';
COMMENT ON COLUMN notifications.error_message IS '발송 실패 사유';
COMMENT ON COLUMN notifications.created_at IS '알림 생성 시간';

COMMIT;