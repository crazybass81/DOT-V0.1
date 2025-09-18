#!/bin/bash
# GitHub Actions workflow validation tests
# These tests MUST fail initially (TDD)

set -e

# Test setup
PROJECT_ROOT="${PROJECT_ROOT:-/home/ec2-user/DOT-V0.1}"
WORKFLOW_DIR="$PROJECT_ROOT/.github/workflows"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0
WARNED=0

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

test_warn() {
    echo -e "${YELLOW}WARN${NC}: $1"
    ((WARNED++))
}

# Test: Workflow directory exists
test_start "GitHub Actions workflow directory exists"
if [ -d "$WORKFLOW_DIR" ]; then
    test_pass
else
    test_fail "Directory not found at $WORKFLOW_DIR"
fi

# Test: Deploy workflow exists
test_start "deploy-main.yml workflow exists"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    test_pass
else
    test_fail "Workflow not found at $WORKFLOW_DIR/deploy-main.yml"
fi

# Test: PR preview workflow exists
test_start "preview-pr.yml workflow exists"
if [ -f "$WORKFLOW_DIR/preview-pr.yml" ]; then
    test_pass
else
    test_fail "Workflow not found at $WORKFLOW_DIR/preview-pr.yml"
fi

# Test: Deploy workflow has correct trigger
test_start "deploy-main.yml triggers on main branch push"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    if grep -q "push:" "$WORKFLOW_DIR/deploy-main.yml" && 
       grep -q "branches.*main" "$WORKFLOW_DIR/deploy-main.yml"; then
        test_pass
    else
        test_fail "Workflow doesn't trigger on main push"
    fi
else
    test_fail "Workflow file not found"
fi

# Test: PR workflow has correct trigger
test_start "preview-pr.yml triggers on pull request"
if [ -f "$WORKFLOW_DIR/preview-pr.yml" ]; then
    if grep -q "pull_request:" "$WORKFLOW_DIR/preview-pr.yml"; then
        test_pass
    else
        test_fail "Workflow doesn't trigger on pull request"
    fi
else
    test_fail "Workflow file not found"
fi

# Test: Workflows have continue-on-error for tests
test_start "Workflows allow deployment even if tests fail (solo dev)"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    if grep -q "continue-on-error: true" "$WORKFLOW_DIR/deploy-main.yml"; then
        test_pass
    else
        test_warn "Tests might block deployment - check if this is intended"
    fi
else
    test_fail "Workflow file not found"
fi

# Test: Workflows use Node 18+
test_start "Workflows use Node.js 18 or higher"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    if grep -q "node-version.*18" "$WORKFLOW_DIR/deploy-main.yml" || 
       grep -q "node-version.*20" "$WORKFLOW_DIR/deploy-main.yml"; then
        test_pass
    else
        test_fail "Workflow doesn't specify Node.js 18+"
    fi
else
    test_fail "Workflow file not found"
fi

# Test: Workflows have caching enabled
test_start "Workflows use dependency caching"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    if grep -q "cache:.*npm" "$WORKFLOW_DIR/deploy-main.yml" || 
       grep -q "actions/cache" "$WORKFLOW_DIR/deploy-main.yml"; then
        test_pass
    else
        test_warn "No caching detected - builds might be slower"
    fi
else
    test_fail "Workflow file not found"
fi

# Test: Vercel deployment action exists
test_start "Workflows include Vercel deployment"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    if grep -q "vercel" "$WORKFLOW_DIR/deploy-main.yml" || 
       grep -q "VERCEL_TOKEN" "$WORKFLOW_DIR/deploy-main.yml"; then
        test_pass
    else
        test_fail "No Vercel deployment configuration found"
    fi
else
    test_fail "Workflow file not found"
fi

# Test: Workflow secrets are referenced
test_start "Workflows reference required secrets"
if [ -f "$WORKFLOW_DIR/deploy-main.yml" ]; then
    if grep -q "secrets\." "$WORKFLOW_DIR/deploy-main.yml"; then
        test_pass
    else
        test_warn "No secrets referenced - check if configuration is complete"
    fi
else
    test_fail "Workflow file not found"
fi

# Print summary
echo ""
echo "========================================"
echo "Test Results:"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "  Warnings: $WARNED"
echo "========================================"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
elif [ $WARNED -gt 0 ]; then
    echo -e "${YELLOW}Tests passed with warnings${NC}"
    exit 0
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi