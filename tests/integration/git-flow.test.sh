#!/bin/bash
# Git workflow commands integration tests
# These tests MUST fail initially (TDD)

set -e

# Test setup
TEST_DIR="/tmp/git-flow-test-$$"
SCRIPT_PATH="${PROJECT_ROOT:-/home/ec2-user/DOT-V0.1}/scripts/git-flow-helper.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
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

# Setup test environment
setup() {
    mkdir -p "$TEST_DIR"
    cd "$TEST_DIR"
    git init --quiet
    git config user.email "test@example.com"
    git config user.name "Test User"
    echo "test" > test.txt
    git add test.txt
    git commit -m "Initial commit" --quiet
}

# Cleanup test environment
cleanup() {
    cd /
    rm -rf "$TEST_DIR"
}

# Test: Script exists and is executable
test_start "git-flow-helper.sh exists and is executable"
if [ -x "$SCRIPT_PATH" ]; then
    test_pass
else
    test_fail "Script not found or not executable at $SCRIPT_PATH"
fi

# Test: Deploy command exists
setup
test_start "git-flow deploy command"
if $SCRIPT_PATH deploy 2>/dev/null; then
    test_pass
else
    test_fail "Deploy command failed"
fi
cleanup

# Test: Hotfix command exists
setup
test_start "git-flow hotfix command"
if $SCRIPT_PATH hotfix "test-hotfix" 2>/dev/null; then
    test_pass
else
    test_fail "Hotfix command failed"
fi
cleanup

# Test: Feature command exists
setup
test_start "git-flow feature command"
if $SCRIPT_PATH feature "test-feature" 2>/dev/null; then
    test_pass
else
    test_fail "Feature command failed"
fi
cleanup

# Test: Rollback command exists
setup
test_start "git-flow rollback command"
if $SCRIPT_PATH rollback 2>/dev/null; then
    test_pass
else
    test_fail "Rollback command failed"
fi
cleanup

# Test: Help command exists
test_start "git-flow help command"
if $SCRIPT_PATH --help 2>/dev/null | grep -q "Usage:"; then
    test_pass
else
    test_fail "Help command failed or no usage info"
fi

# Test: Deploy creates proper commit message
setup
test_start "deploy creates proper commit message"
echo "fix" > test.txt
git add test.txt
if $SCRIPT_PATH deploy 2>/dev/null; then
    if git log -1 --pretty=%B | grep -q "deploy:"; then
        test_pass
    else
        test_fail "Commit message doesn't follow convention"
    fi
else
    test_fail "Deploy command failed"
fi
cleanup

# Test: Feature creates feature branch
setup
test_start "feature creates feature branch"
if $SCRIPT_PATH feature "new-feature" 2>/dev/null; then
    if git branch | grep -q "feature/new-feature"; then
        test_pass
    else
        test_fail "Feature branch not created"
    fi
else
    test_fail "Feature command failed"
fi
cleanup

# Print summary
echo ""
echo "========================================"
echo "Test Results:"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "========================================"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi