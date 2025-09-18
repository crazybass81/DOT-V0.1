#!/bin/bash
# Unit tests for Git helper functions
# These tests MUST fail initially (TDD)

set -e

# Test setup
PROJECT_ROOT="${PROJECT_ROOT:-/home/ec2-user/DOT-V0.1}"
HELPERS_PATH="$PROJECT_ROOT/scripts/lib/git-helpers.sh"

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

# Test: Helper library exists
test_start "git-helpers.sh exists"
if [ -f "$HELPERS_PATH" ]; then
    test_pass
    # Source the helpers for testing
    source "$HELPERS_PATH"
else
    test_fail "Helper library not found at $HELPERS_PATH"
    # Exit early if helpers don't exist
    echo ""
    echo "========================================"
    echo "Cannot continue tests without helper library"
    echo "========================================"
    exit 1
fi

# Test: check_git_repo function exists
test_start "check_git_repo function exists"
if type check_git_repo &>/dev/null; then
    test_pass
else
    test_fail "Function not defined"
fi

# Test: check_branch function exists
test_start "check_branch function exists"
if type check_branch &>/dev/null; then
    test_pass
else
    test_fail "Function not defined"
fi

# Test: create_branch function exists
test_start "create_branch function exists"
if type create_branch &>/dev/null; then
    test_pass
else
    test_fail "Function not defined"
fi

# Test: commit_changes function exists
test_start "commit_changes function exists"
if type commit_changes &>/dev/null; then
    test_pass
else
    test_fail "Function not defined"
fi

# Test: push_branch function exists
test_start "push_branch function exists"
if type push_branch &>/dev/null; then
    test_pass
else
    test_fail "Function not defined"
fi

# Test: check_git_repo validates Git repository
TEST_DIR="/tmp/helper-test-$$"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

test_start "check_git_repo detects non-Git directory"
if ! check_git_repo 2>/dev/null; then
    test_pass
else
    test_fail "Should fail in non-Git directory"
fi

# Initialize Git repo
git init --quiet
git config user.email "test@example.com"
git config user.name "Test User"

test_start "check_git_repo validates Git directory"
if check_git_repo 2>/dev/null; then
    test_pass
else
    test_fail "Should pass in Git directory"
fi

# Test: check_branch validates current branch
echo "test" > test.txt
git add test.txt
git commit -m "Initial commit" --quiet

test_start "check_branch returns current branch"
CURRENT_BRANCH=$(check_branch 2>/dev/null)
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    test_pass
else
    test_fail "Unexpected branch: $CURRENT_BRANCH"
fi

# Test: create_branch creates new branch
test_start "create_branch creates and switches to new branch"
if create_branch "test-branch" 2>/dev/null; then
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" = "test-branch" ]; then
        test_pass
    else
        test_fail "Branch not switched"
    fi
else
    test_fail "Failed to create branch"
fi

# Test: commit_changes creates proper commit
test_start "commit_changes creates commit with message"
echo "change" > test.txt
git add test.txt
if commit_changes "test: unit test commit" 2>/dev/null; then
    LAST_MESSAGE=$(git log -1 --pretty=%B)
    if [ "$LAST_MESSAGE" = "test: unit test commit" ]; then
        test_pass
    else
        test_fail "Incorrect commit message"
    fi
else
    test_fail "Failed to commit"
fi

# Test: Error handling for empty commit
test_start "commit_changes handles empty commit"
if ! commit_changes "test: empty commit" 2>/dev/null; then
    test_pass
else
    test_fail "Should fail with no changes"
fi

# Cleanup
cd /
rm -rf "$TEST_DIR"

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