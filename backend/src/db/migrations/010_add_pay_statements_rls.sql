-- T184-T185: pay_statements RLS 정책
-- 급여명세서 접근 제어

-- 1. RLS 활성화
ALTER TABLE pay_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_statement_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_statement_payments ENABLE ROW LEVEL SECURITY;

-- 2. pay_statements 테이블 정책
-- 직원은 자신의 급여명세서만 조회
CREATE POLICY pay_statements_employee_select ON pay_statements
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM employees
            WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

-- Manager/Owner는 해당 비즈니스의 모든 급여명세서 관리
CREATE POLICY pay_statements_manager_all ON pay_statements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = pay_statements.business_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
            AND ur.is_active = true
        )
    );

-- 3. pay_statement_revisions 테이블 정책
-- 직원은 자신의 급여 조정 이력 조회만
CREATE POLICY pay_revisions_employee_select ON pay_statement_revisions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM pay_statements ps
            JOIN employees e ON e.id = ps.employee_id
            WHERE ps.id = pay_statement_revisions.original_statement_id
            AND e.user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

-- Manager/Owner는 모든 조정 이력 관리
CREATE POLICY pay_revisions_manager_all ON pay_statement_revisions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM pay_statements ps
            JOIN user_roles ur ON ur.business_id = ps.business_id
            WHERE ps.id = pay_statement_revisions.original_statement_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
            AND ur.is_active = true
        )
    );

-- 4. pay_statement_payments 테이블 정책
-- 직원은 자신의 지급 내역 조회만
CREATE POLICY pay_payments_employee_select ON pay_statement_payments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM pay_statements ps
            JOIN employees e ON e.id = ps.employee_id
            WHERE ps.id = pay_statement_payments.pay_statement_id
            AND e.user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

-- Manager/Owner만 지급 정보 생성/수정
CREATE POLICY pay_payments_manager_all ON pay_statement_payments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM pay_statements ps
            JOIN user_roles ur ON ur.business_id = ps.business_id
            WHERE ps.id = pay_statement_payments.pay_statement_id
            AND ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('Manager', 'Owner')
            AND ur.is_active = true
        )
    );

-- 5. 개발/테스트용 bypass 정책 (프로덕션에서 제거)
CREATE POLICY bypass_rls_pay_statements ON pay_statements
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY bypass_rls_pay_revisions ON pay_statement_revisions
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY bypass_rls_pay_payments ON pay_statement_payments
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- 6. 급여 접근 권한 확인 함수
CREATE OR REPLACE FUNCTION check_pay_statement_access(
    p_user_id INTEGER,
    p_statement_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    has_access BOOLEAN;
BEGIN
    -- 임시로 user_id 설정
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);

    -- 접근 가능 여부 확인
    SELECT EXISTS (
        SELECT 1 FROM pay_statements
        WHERE id = p_statement_id
    ) INTO has_access;

    RETURN has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 급여 통계 뷰 (개인정보 제외)
CREATE OR REPLACE VIEW pay_statistics AS
SELECT
    business_id,
    DATE_TRUNC('month', pay_period_start) AS month,
    COUNT(*) AS statement_count,
    AVG(gross_pay) AS avg_gross_pay,
    AVG(net_pay) AS avg_net_pay,
    SUM(gross_pay) AS total_gross_pay,
    SUM(net_pay) AS total_net_pay,
    AVG(total_hours) AS avg_hours
FROM pay_statements
WHERE status IN ('confirmed', 'paid')
GROUP BY business_id, DATE_TRUNC('month', pay_period_start);

-- 뷰에 대한 권한 설정
GRANT SELECT ON pay_statistics TO PUBLIC;

COMMENT ON POLICY pay_statements_employee_select ON pay_statements IS
    '직원은 자신의 급여명세서만 조회할 수 있습니다';

COMMENT ON POLICY pay_statements_manager_all ON pay_statements IS
    'Manager와 Owner는 해당 비즈니스의 모든 급여명세서를 관리할 수 있습니다';

COMMENT ON VIEW pay_statistics IS
    '개인정보를 제외한 급여 통계 정보를 제공합니다';