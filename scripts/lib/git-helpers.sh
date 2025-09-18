#!/bin/bash
# Git helper functions library
# Shared utilities for Git workflow automation

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if we're in a Git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not in a Git repository"
        return 1
    fi
    return 0
}

# Get current branch name
check_branch() {
    local branch
    branch=$(git branch --show-current 2>/dev/null)
    if [ -z "$branch" ]; then
        # Fallback for older Git versions
        branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    fi
    echo "$branch"
}

# Create and switch to a new branch
create_branch() {
    local branch_name="$1"
    if [ -z "$branch_name" ]; then
        print_error "Branch name required"
        return 1
    fi

    print_info "Creating branch: $branch_name"
    if git checkout -b "$branch_name" 2>/dev/null; then
        print_success "Switched to branch: $branch_name"
        return 0
    else
        # Branch might already exist, try switching
        if git checkout "$branch_name" 2>/dev/null; then
            print_warning "Branch already exists, switched to: $branch_name"
            return 0
        else
            print_error "Failed to create or switch to branch: $branch_name"
            return 1
        fi
    fi
}

# Commit changes with a message
commit_changes() {
    local message="$1"
    if [ -z "$message" ]; then
        print_error "Commit message required"
        return 1
    fi

    # Check if there are changes to commit
    if git diff --cached --quiet 2>/dev/null && git diff --quiet 2>/dev/null; then
        print_warning "No changes to commit"
        return 1
    fi

    # Add all changes if not already staged
    if ! git diff --cached --quiet 2>/dev/null; then
        print_info "Committing staged changes..."
    else
        print_info "Staging and committing all changes..."
        git add -A
    fi

    if git commit -m "$message" 2>/dev/null; then
        print_success "Committed: $message"
        return 0
    else
        print_error "Failed to commit changes"
        return 1
    fi
}

# Push branch to remote
push_branch() {
    local branch="$1"
    local force="$2"

    if [ -z "$branch" ]; then
        branch=$(check_branch)
    fi

    print_info "Pushing branch: $branch"

    local push_cmd="git push origin $branch"
    if [ "$force" = "--force" ] || [ "$force" = "-f" ]; then
        push_cmd="$push_cmd --force-with-lease"
        print_warning "Force pushing (with lease)..."
    fi

    if $push_cmd 2>/dev/null; then
        print_success "Pushed to origin/$branch"
        return 0
    else
        # Try setting upstream if first push
        if git push -u origin "$branch" 2>/dev/null; then
            print_success "Pushed and set upstream to origin/$branch"
            return 0
        else
            print_error "Failed to push branch"
            return 1
        fi
    fi
}

# Check if branch exists locally
branch_exists() {
    local branch="$1"
    git show-ref --verify --quiet "refs/heads/$branch"
}

# Check if there are uncommitted changes
has_uncommitted_changes() {
    ! git diff --quiet || ! git diff --cached --quiet
}

# Get the main branch name (main or master)
get_main_branch() {
    if branch_exists "main"; then
        echo "main"
    elif branch_exists "master"; then
        echo "master"
    else
        # Check remote
        if git ls-remote --heads origin main 2>/dev/null | grep -q main; then
            echo "main"
        else
            echo "master"
        fi
    fi
}

# Switch to main branch
switch_to_main() {
    local main_branch
    main_branch=$(get_main_branch)
    print_info "Switching to $main_branch branch..."
    git checkout "$main_branch" 2>/dev/null
}

# Create a tag
create_tag() {
    local tag_name="$1"
    local message="$2"

    if [ -z "$tag_name" ]; then
        print_error "Tag name required"
        return 1
    fi

    if [ -z "$message" ]; then
        message="Release $tag_name"
    fi

    print_info "Creating tag: $tag_name"
    if git tag -a "$tag_name" -m "$message" 2>/dev/null; then
        print_success "Created tag: $tag_name"
        return 0
    else
        print_error "Failed to create tag"
        return 1
    fi
}

# Push tags to remote
push_tags() {
    print_info "Pushing tags to remote..."
    if git push --tags 2>/dev/null; then
        print_success "Tags pushed successfully"
        return 0
    else
        print_error "Failed to push tags"
        return 1
    fi
}

# Get latest tag
get_latest_tag() {
    git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"
}

# Rollback to a specific commit or tag
rollback_to() {
    local target="$1"

    if [ -z "$target" ]; then
        print_error "Rollback target required (commit hash or tag)"
        return 1
    fi

    print_warning "Rolling back to: $target"
    if git reset --hard "$target" 2>/dev/null; then
        print_success "Rolled back to: $target"
        return 0
    else
        print_error "Failed to rollback"
        return 1
    fi
}