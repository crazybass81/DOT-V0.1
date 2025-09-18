#!/bin/bash
# Git Flow Helper Script
# Simple GitHub Flow automation for solo developers
# Optimized for frequent deployments with Vercel integration

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source helper functions
source "$SCRIPT_DIR/lib/git-helpers.sh"

# Version
VERSION="1.0.0"

# Show usage information
show_help() {
    cat << EOF
Git Flow Helper v$VERSION
Simple GitHub Flow for solo developers

Usage: $(basename "$0") COMMAND [OPTIONS]

Commands:
  deploy              Deploy current changes to main branch
  hotfix <name>       Create and deploy a hotfix quickly
  feature <name>      Start a new feature branch
  rollback [target]   Rollback to previous version (tag/commit)
  status              Show current branch and deployment status
  help, --help        Show this help message

Examples:
  $(basename "$0") deploy              # Deploy current changes
  $(basename "$0") hotfix fix-login    # Quick hotfix deployment
  $(basename "$0") feature add-auth    # Start new feature
  $(basename "$0") rollback v1.0.0     # Rollback to specific version

Workflow:
  1. Small changes → 'deploy' directly to main
  2. Quick fixes → 'hotfix' for urgent patches
  3. New features → 'feature' for larger changes
  4. Problems → 'rollback' to previous version

Note: Designed for solo developers with frequent deployments.
      Tests run but don't block deployment (see GitHub Actions).
EOF
}

# Deploy command - push changes to main
deploy_command() {
    print_info "Starting deployment process..."

    # Check Git repository
    check_git_repo || exit 1

    # Get current branch
    local current_branch
    current_branch=$(check_branch)

    # Check for uncommitted changes
    if has_uncommitted_changes; then
        print_info "Found uncommitted changes"

        # Stage all changes
        git add -A

        # Generate commit message
        local commit_msg="deploy: update from $current_branch"
        if [ -n "$1" ]; then
            commit_msg="deploy: $1"
        fi

        commit_changes "$commit_msg" || exit 1
    fi

    # Get main branch name
    local main_branch
    main_branch=$(get_main_branch)

    # If on feature branch, merge to main
    if [ "$current_branch" != "$main_branch" ]; then
        print_info "Merging $current_branch to $main_branch..."

        # Switch to main
        git checkout "$main_branch" 2>/dev/null || {
            print_error "Failed to switch to $main_branch"
            exit 1
        }

        # Pull latest changes
        print_info "Pulling latest changes..."
        git pull origin "$main_branch" 2>/dev/null || true

        # Merge feature branch
        if git merge "$current_branch" --no-ff -m "Merge branch '$current_branch' into $main_branch" 2>/dev/null; then
            print_success "Merged $current_branch to $main_branch"
        else
            print_error "Merge failed - resolve conflicts manually"
            exit 1
        fi
    else
        # Already on main, just pull latest
        print_info "Pulling latest changes..."
        git pull origin "$main_branch" 2>/dev/null || true
    fi

    # Push to main
    push_branch "$main_branch" || exit 1

    # Create deployment tag
    local tag_name="deploy-$(date +%Y%m%d-%H%M%S)"
    create_tag "$tag_name" "Deployment on $(date '+%Y-%m-%d %H:%M:%S')"
    push_tags

    print_success "✨ Deployment complete!"
    print_info "🚀 Vercel will automatically deploy from main branch"
    print_info "📌 Tagged as: $tag_name (for rollback if needed)"

    # Clean up feature branch if we merged from one
    if [ "$current_branch" != "$main_branch" ]; then
        print_info "Cleaning up feature branch..."
        git branch -d "$current_branch" 2>/dev/null || true
    fi
}

# Hotfix command - quick fix and deploy
hotfix_command() {
    local hotfix_name="$1"

    if [ -z "$hotfix_name" ]; then
        print_error "Hotfix name required"
        echo "Usage: $(basename "$0") hotfix <name>"
        exit 1
    fi

    print_info "Creating hotfix: $hotfix_name"

    # Check Git repository
    check_git_repo || exit 1

    # Ensure we're on main branch
    local main_branch
    main_branch=$(get_main_branch)

    local current_branch
    current_branch=$(check_branch)

    if [ "$current_branch" != "$main_branch" ]; then
        print_warning "Switching to $main_branch for hotfix..."
        git checkout "$main_branch" 2>/dev/null || exit 1
    fi

    # Pull latest changes
    print_info "Pulling latest changes..."
    git pull origin "$main_branch" 2>/dev/null || true

    # Create hotfix branch
    local hotfix_branch="hotfix/$hotfix_name"
    create_branch "$hotfix_branch" || exit 1

    print_success "Hotfix branch created: $hotfix_branch"
    print_info "Make your changes, then run:"
    print_info "  $(basename "$0") deploy"
    print_info "This will merge and deploy your hotfix automatically"
}

# Feature command - start new feature branch
feature_command() {
    local feature_name="$1"

    if [ -z "$feature_name" ]; then
        print_error "Feature name required"
        echo "Usage: $(basename "$0") feature <name>"
        exit 1
    fi

    print_info "Creating feature: $feature_name"

    # Check Git repository
    check_git_repo || exit 1

    # Ensure we're on main branch
    local main_branch
    main_branch=$(get_main_branch)

    local current_branch
    current_branch=$(check_branch)

    if [ "$current_branch" != "$main_branch" ]; then
        print_warning "Switching to $main_branch for new feature..."
        git checkout "$main_branch" 2>/dev/null || exit 1
    fi

    # Pull latest changes
    print_info "Pulling latest changes..."
    git pull origin "$main_branch" 2>/dev/null || true

    # Create feature branch
    local feature_branch="feature/$feature_name"
    create_branch "$feature_branch" || exit 1

    print_success "Feature branch created: $feature_branch"
    print_info "Development workflow:"
    print_info "  1. Make your changes"
    print_info "  2. Commit frequently with: git commit -m 'your message'"
    print_info "  3. Push for PR preview: git push origin $feature_branch"
    print_info "  4. When ready, run: $(basename "$0") deploy"
}

# Rollback command
rollback_command() {
    local target="$1"

    print_warning "⚠️  Starting rollback process..."

    # Check Git repository
    check_git_repo || exit 1

    # If no target specified, show recent tags and ask
    if [ -z "$target" ]; then
        print_info "Recent deployment tags:"
        git tag -l "deploy-*" --sort=-version:refname | head -10 | while read -r tag; do
            echo "  • $tag"
        done

        print_info "Recent commits:"
        git log --oneline -10

        print_error "Please specify a target (tag or commit hash)"
        echo "Usage: $(basename "$0") rollback <target>"
        exit 1
    fi

    # Ensure we're on main branch
    local main_branch
    main_branch=$(get_main_branch)
    switch_to_main

    # Perform rollback
    rollback_to "$target" || exit 1

    # Force push to main (with lease for safety)
    print_warning "Force pushing to $main_branch..."
    push_branch "$main_branch" "--force" || exit 1

    # Create rollback tag
    local rollback_tag="rollback-$(date +%Y%m%d-%H%M%S)"
    create_tag "$rollback_tag" "Rolled back to $target"
    push_tags

    print_success "✅ Rollback complete!"
    print_info "🔄 Vercel will redeploy from the rolled-back state"
    print_info "📌 Tagged as: $rollback_tag"
}

# Status command
status_command() {
    print_info "Git Flow Status"
    echo "═══════════════════════════════════════"

    # Check Git repository
    check_git_repo || exit 1

    # Current branch
    local current_branch
    current_branch=$(check_branch)
    echo "Current branch: $current_branch"

    # Check for uncommitted changes
    if has_uncommitted_changes; then
        print_warning "You have uncommitted changes"
    else
        print_success "Working directory clean"
    fi

    # Latest tag
    local latest_tag
    latest_tag=$(get_latest_tag)
    echo "Latest tag: $latest_tag"

    # Remote status
    local main_branch
    main_branch=$(get_main_branch)

    # Check if current branch is ahead/behind
    if [ "$current_branch" = "$main_branch" ]; then
        local ahead behind
        ahead=$(git rev-list --count origin/"$main_branch".."$main_branch" 2>/dev/null || echo "0")
        behind=$(git rev-list --count "$main_branch"..origin/"$main_branch" 2>/dev/null || echo "0")

        if [ "$ahead" -gt 0 ]; then
            print_warning "Branch is $ahead commits ahead of origin"
        fi
        if [ "$behind" -gt 0 ]; then
            print_warning "Branch is $behind commits behind origin"
        fi
        if [ "$ahead" -eq 0 ] && [ "$behind" -eq 0 ]; then
            print_success "Branch is up to date with origin"
        fi
    fi

    echo "═══════════════════════════════════════"
    echo ""
    echo "Quick commands:"
    echo "  • Deploy changes:  $(basename "$0") deploy"
    echo "  • Start feature:   $(basename "$0") feature <name>"
    echo "  • Quick hotfix:    $(basename "$0") hotfix <name>"
    echo "  • Rollback:        $(basename "$0") rollback <tag>"
}

# Main command handler
main() {
    local command="$1"
    shift || true

    case "$command" in
        deploy)
            deploy_command "$@"
            ;;
        hotfix)
            hotfix_command "$@"
            ;;
        feature)
            feature_command "$@"
            ;;
        rollback)
            rollback_command "$@"
            ;;
        status)
            status_command
            ;;
        help|--help|-h|"")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main
main "$@"