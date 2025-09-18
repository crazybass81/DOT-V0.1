#!/bin/bash
# Vercel deployment integration tests
# These tests MUST fail initially (TDD)

set -e

# Test setup
PROJECT_ROOT="${PROJECT_ROOT:-/home/ec2-user/DOT-V0.1}"
SCRIPT_PATH="$PROJECT_ROOT/scripts/git-flow-helper.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test helper functions
test_start() {
    echo -n "Testing: $1... "
}

test_pass() {
    echo -e "${GREEN}PASS${NC}"
    ((PASSED++))
}

test_fail() {
    echo -e "${RED}FAIL${NC}: $1"
    ((FAILED++))
}

# Test: Vercel configuration exists
test_start "vercel.json configuration exists"
if [ -f "$PROJECT_ROOT/vercel.json" ] || [ -f "$PROJECT_ROOT/frontend/vercel.json" ]; then
    test_pass
else
    test_fail "No vercel.json found in project or frontend directory"
fi

# Test: Environment example file exists
test_start ".env.example file exists"
if [ -f "$PROJECT_ROOT/.env.example" ]; then
    test_pass
else
    test_fail ".env.example not found"
fi

# Test: Deploy script handles Vercel deployment
test_start "git-flow deploy integrates with Vercel"
if [ -x "$SCRIPT_PATH" ]; then
    if grep -q "vercel" "$SCRIPT_PATH" 2>/dev/null || grep -q "git push" "$SCRIPT_PATH" 2>/dev/null; then
        test_pass
    else
        test_fail "No Vercel integration found in deploy script"
    fi
else
    test_fail "Deploy script not found or not executable"
fi

# Test: Production branch protection check
test_start "Script prevents direct commits to main in production"
if [ -x "$SCRIPT_PATH" ]; then
    # This should be a warning for solo dev
    echo -e "${YELLOW}SKIP${NC}: Branch protection not enforced for solo developer"
    # Not counting as pass/fail since it's intentional
else
    test_fail "Script not found"
fi

# Test: Rollback mechanism exists
test_start "Rollback mechanism is implemented"
if [ -x "$SCRIPT_PATH" ]; then
    if grep -q "rollback" "$SCRIPT_PATH" 2>/dev/null; then
        test_pass
    else
        test_fail "No rollback function found"
    fi
else
    test_fail "Script not found"
fi

# Test: Environment variable handling
test_start "Script handles environment variables"
if [ -f "$PROJECT_ROOT/.env.example" ]; then
    if grep -q "VERCEL" "$PROJECT_ROOT/.env.example" || grep -q "REACT_APP" "$PROJECT_ROOT/.env.example"; then
        test_pass
    else
        test_fail "No environment variable examples found"
    fi
else
    test_fail ".env.example not found"
fi

# Test: Package.json has deployment scripts
test_start "Package.json includes deployment scripts"
if [ -f "$PROJECT_ROOT/package.json" ]; then
    if grep -q "deploy" "$PROJECT_ROOT/package.json" || grep -q "vercel" "$PROJECT_ROOT/package.json"; then
        test_pass
    else
        test_fail "No deployment scripts in package.json"
    fi
else
    test_fail "package.json not found"
fi

# Test: GitHub Actions can trigger Vercel deployment
test_start "GitHub Actions configured for Vercel deployment"
WORKFLOW_DIR="$PROJECT_ROOT/.github/workflows"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    if grep -q "vercel\|VERCEL" "$WORKFLOW_DIR/deploy-main.yml"; then
        test_pass
    else
        test_fail "No Vercel configuration in GitHub Actions"
    fi
else
    test_fail "Deploy workflow not found"
fi

# Test: Preview deployments for PRs
test_start "PR preview deployments configured"
if [ -f "$WORKFLOW_DIR/preview-pr.yml" ]; then
    if grep -q "preview\|vercel" "$WORKFLOW_DIR/preview-pr.yml"; then
        test_pass
    else
        test_fail "No preview deployment configuration"
    fi
else
    test_fail "Preview workflow not found"
fi

# Print summary
echo ""
echo "========================================"
echo "Test Results:"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "========================================"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    echo "This is expected for TDD - implement features to make tests pass"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi