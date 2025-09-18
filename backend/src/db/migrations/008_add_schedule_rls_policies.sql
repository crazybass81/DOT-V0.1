-- T150: 스케줄 관련 테이블 RLS 정책
-- Row Level Security를 통한 데이터 격리

-- 1. RLS 활성화
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_requests ENABLE ROW LEVEL SECURITY;

-- 2. schedules 테이블 정책
-- Owner는 모든 권한
CREATE POLICY schedules_owner_all ON schedules
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = schedules.business_id
            AND b.owner_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

-- Manager는 조회/수정 가능
CREATE POLICY schedules_manager_select ON schedules
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = schedules.business_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
        )
    );

CREATE POLICY schedules_manager_update ON schedules
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = schedules.business_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
        )
    );

-- 3. schedule_shifts 테이블 정책
-- 직원은 자신의 스케줄만 조회
CREATE POLICY schedule_shifts_employee_select ON schedule_shifts
    FOR SELECT
    USING (
        -- 자신의 스케줄
        employee_id IN (
            SELECT id FROM employees
            WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
        )
        OR
        -- 관리자/소유자
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN user_roles ur ON ur.business_id = s.business_id
            WHERE s.id = schedule_shifts.schedule_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
        )
    );

-- Manager/Owner는 수정 가능
CREATE POLICY schedule_shifts_manager_all ON schedule_shifts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM schedules s
            JOIN user_roles ur ON ur.business_id = s.business_id
            WHERE s.id = schedule_shifts.schedule_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
        )
    );

-- 4. schedule_patterns 테이블 정책
-- 비즈니스 관련자만 조회
CREATE POLICY schedule_patterns_business_select ON schedule_patterns
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = schedule_patterns.business_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

-- Manager/Owner만 생성/수정
CREATE POLICY schedule_patterns_manager_all ON schedule_patterns
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = schedule_patterns.business_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
        )
    );

-- 5. schedule_history 테이블 정책
-- 읽기 전용, 관련자만 조회
CREATE POLICY schedule_history_readonly ON schedule_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM schedule_shifts ss
            JOIN schedules s ON s.id = ss.schedule_id
            JOIN user_roles ur ON ur.business_id = s.business_id
            WHERE ss.id = schedule_history.schedule_shift_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

-- INSERT는 시스템에서만 (트리거를 통해)
CREATE POLICY schedule_history_system_insert ON schedule_history
    FOR INSERT
    WITH CHECK (true);

-- 6. schedule_requests 테이블 정책
-- 직원은 자신의 요청 생성/조회
CREATE POLICY schedule_requests_employee_own ON schedule_requests
    FOR ALL
    USING (
        requested_by IN (
            SELECT id FROM employees
            WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

-- Manager/Owner는 모든 요청 조회/수정
CREATE POLICY schedule_requests_manager_all ON schedule_requests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN user_roles ur ON ur.business_id = e.business_id
            WHERE e.id = schedule_requests.requested_by
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
        )
    );

-- 7. 개발/테스트 환경용 bypass 정책 (선택적)
-- 주의: 프로덕션에서는 제거해야 함
CREATE POLICY bypass_rls_for_admin ON schedules
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY bypass_rls_for_admin_shifts ON schedule_shifts
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- 8. 정책 적용 확인을 위한 헬퍼 함수
CREATE OR REPLACE FUNCTION check_schedule_access(
    p_user_id INTEGER,
    p_schedule_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    has_access BOOLEAN;
BEGIN
    -- 임시로 user_id 설정
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);

    -- 접근 가능 여부 확인
    SELECT EXISTS (
        SELECT 1 FROM schedules
        WHERE id = p_schedule_id
    ) INTO has_access;

    RETURN has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 정책 테스트를 위한 샘플 데이터 (개발용)
-- INSERT INTO schedules (business_id, name, type, start_date, end_date)
-- VALUES
--     (1, 'RLS 테스트 스케줄', 'weekly', '2024-01-01', '2024-01-07');

COMMENT ON POLICY schedules_owner_all ON schedules IS
    '사업장 소유자는 모든 스케줄에 대한 전체 권한을 가집니다';

COMMENT ON POLICY schedule_shifts_employee_select ON schedule_shifts IS
    '직원은 자신의 스케줄만 조회할 수 있습니다';

COMMENT ON POLICY schedule_requests_employee_own ON schedule_requests IS
    '직원은 자신의 스케줄 변경 요청만 관리할 수 있습니다';