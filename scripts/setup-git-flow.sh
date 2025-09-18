#!/bin/bash
# Setup script for Simple GitHub Flow
# Initializes Git aliases and configuration for solo developers

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_FLOW_SCRIPT="$SCRIPT_DIR/git-flow-helper.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════"
echo "     Simple GitHub Flow Setup for Solo Developers   "
echo "════════════════════════════════════════════════════"
echo ""

# Check if git-flow-helper.sh exists
if [ ! -f "$GIT_FLOW_SCRIPT" ]; then
    echo -e "${RED}Error: git-flow-helper.sh not found at $GIT_FLOW_SCRIPT${NC}"
    echo "Please ensure the script is in the correct location."
    exit 1
fi

# Make scripts executable
echo -e "${BLUE}→${NC} Making scripts executable..."
chmod +x "$GIT_FLOW_SCRIPT"
chmod +x "$SCRIPT_DIR/lib/git-helpers.sh" 2>/dev/null || true

# Create git-flow command alias
echo -e "${BLUE}→${NC} Setting up 'git-flow' command..."

# Create symlink in /usr/local/bin if we have permission
if [ -w /usr/local/bin ]; then
    ln -sf "$GIT_FLOW_SCRIPT" /usr/local/bin/git-flow
    echo -e "${GREEN}✓${NC} Created global git-flow command"
else
    echo -e "${YELLOW}⚠${NC} Cannot create global command (no write permission to /usr/local/bin)"
    echo "   You can use the script directly: $GIT_FLOW_SCRIPT"
fi

# Set up Git aliases
echo -e "${BLUE}→${NC} Setting up Git aliases..."

# Basic aliases for beginners
git config --global alias.s "status -s"
git config --global alias.st "status"
git config --global alias.co "checkout"
git config --global alias.br "branch"
git config --global alias.cm "commit -m"
git config --global alias.unstage "reset HEAD --"
git config --global alias.last "log -1 HEAD"
git config --global alias.visual "log --graph --oneline --all"

# Git flow specific aliases
git config --global alias.deploy "!$GIT_FLOW_SCRIPT deploy"
git config --global alias.hotfix "!$GIT_FLOW_SCRIPT hotfix"
git config --global alias.feature "!$GIT_FLOW_SCRIPT feature"
git config --global alias.rollback "!$GIT_FLOW_SCRIPT rollback"
git config --global alias.flow-status "!$GIT_FLOW_SCRIPT status"

echo -e "${GREEN}✓${NC} Git aliases configured"

# Create shell aliases (for bash/zsh)
SHELL_RC=""
if [ -f ~/.bashrc ]; then
    SHELL_RC=~/.bashrc
elif [ -f ~/.zshrc ]; then
    SHELL_RC=~/.zshrc
fi

if [ -n "$SHELL_RC" ]; then
    echo -e "${BLUE}→${NC} Adding shell aliases to $SHELL_RC..."

    # Check if aliases already exist
    if ! grep -q "# Simple GitHub Flow aliases" "$SHELL_RC"; then
        cat >> "$SHELL_RC" << 'EOF'

# Simple GitHub Flow aliases
alias gs='git status'
alias ga='git add'
alias gc='git commit -m'
alias gp='git push'
alias gpl='git pull'
alias gco='git checkout'
alias gb='git branch'
alias glog='git log --oneline -10'

# Git Flow commands
alias gf='git-flow'
alias gfd='git-flow deploy'
alias gff='git-flow feature'
alias gfh='git-flow hotfix'
alias gfr='git-flow rollback'
alias gfs='git-flow status'

EOF
        echo -e "${GREEN}✓${NC} Shell aliases added to $SHELL_RC"
        echo -e "${YELLOW}⚠${NC} Run 'source $SHELL_RC' to activate aliases in current session"
    else
        echo -e "${YELLOW}⚠${NC} Aliases already configured in $SHELL_RC"
    fi
fi

# Check for .env.example
echo -e "${BLUE}→${NC} Checking for .env.example..."
ENV_EXAMPLE="$SCRIPT_DIR/../.env.example"
if [ ! -f "$ENV_EXAMPLE" ]; then
    echo -e "${BLUE}→${NC} Creating .env.example..."
    cat > "$ENV_EXAMPLE" << 'EOF'
# Environment Variables Template
# Copy this file to .env.local for development

# Frontend Environment Variables
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SOCKET_URL=ws://localhost:3000

# Backend Environment Variables
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Vercel Deployment (set in Vercel dashboard for production)
# VERCEL_TOKEN=your_vercel_token
# VERCEL_ORG_ID=your_org_id
# VERCEL_PROJECT_ID=your_project_id
EOF
    echo -e "${GREEN}✓${NC} Created .env.example"
fi

# Print summary
echo ""
echo "════════════════════════════════════════════════════"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo "════════════════════════════════════════════════════"
echo ""
echo "Available commands:"
echo ""
echo "  Git Flow Commands:"
echo "    git-flow deploy       - Deploy to production"
echo "    git-flow feature NAME - Start new feature"
echo "    git-flow hotfix NAME  - Create hotfix"
echo "    git-flow rollback     - Rollback deployment"
echo "    git-flow status       - Show status"
echo ""
echo "  Git Aliases (after sourcing shell RC):"
echo "    gs  - git status"
echo "    gfd - git-flow deploy"
echo "    gff - git-flow feature"
echo "    gfh - git-flow hotfix"
echo ""
echo "Quick start:"
echo "  1. Make changes to your code"
echo "  2. Run: git-flow deploy"
echo "  3. Your changes are live! 🚀"
echo ""
echo "For help: git-flow --help"
echo "════════════════════════════════════════════════════"