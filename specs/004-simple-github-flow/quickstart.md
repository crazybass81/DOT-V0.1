# Quick Start: Simple GitHub Flow

**Time to first deployment**: 5 minutes ⚡

## 🚀 Initial Setup (One-time, 2 minutes)

### 1. Run the setup script
```bash
cd /home/ec2-user/DOT-V0.1
./scripts/setup-git-flow.sh
```

### 2. Activate aliases (optional but recommended)
```bash
source ~/.bashrc  # or ~/.zshrc for zsh users
```

### 3. Configure GitHub repository (if not done)
```bash
git remote add origin https://github.com/YOUR_USERNAME/DOT-V0.1.git
```

## 🎯 Daily Workflow

### Scenario 1: Quick Bug Fix (2 minutes)
```bash
# Fix the bug in your code
vim frontend/src/App.js  # Make your fix

# Deploy immediately
git-flow deploy
# or shorter: gfd (if aliases active)
```
✅ Your fix is live in production!

### Scenario 2: New Feature (10 minutes)
```bash
# Start feature branch
git-flow feature user-profile
# or: gff user-profile

# Work on your feature
vim frontend/src/UserProfile.js
git add .
git commit -m "Add user profile component"

# Push for PR preview (optional)
git push origin feature/user-profile

# When ready, deploy
git-flow deploy
```
✅ Feature merged and deployed!

### Scenario 3: Emergency Hotfix (1 minute)
```bash
# Create hotfix branch
git-flow hotfix payment-error

# Fix the issue
vim backend/src/payment.js
git add .
git commit -m "Fix payment processing error"

# Deploy immediately
git-flow deploy
```
✅ Hotfix deployed to production!

### Scenario 4: Something Went Wrong (30 seconds)
```bash
# See recent deployments
git tag -l "deploy-*" | tail -5

# Rollback to previous version
git-flow rollback deploy-20250918-143022
# or rollback to specific commit
git-flow rollback abc1234
```
✅ Rolled back successfully!

## 📝 Command Cheat Sheet

### Essential Commands (memorize these)
| Command | Alias | What it does |
|---------|-------|-------------|
| `git-flow deploy` | `gfd` | Deploy to production |
| `git-flow status` | `gfs` | Check current status |
| `git-flow feature NAME` | `gff NAME` | Start new feature |
| `git-flow rollback` | `gfr` | Rollback deployment |

### Git Aliases (after setup)
| Alias | Full Command | Usage |
|-------|-------------|--------|
| `gs` | `git status` | Check changes |
| `ga .` | `git add .` | Stage all changes |
| `gc "message"` | `git commit -m` | Commit changes |
| `gp` | `git push` | Push to remote |
| `gpl` | `git pull` | Pull from remote |

## 🔧 Vercel Setup (One-time)

### 1. Connect GitHub to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Select these settings:
   ```
   Framework Preset: Create React App
   Root Directory: frontend
   Build Command: npm run build
   Output Directory: build
   ```

### 2. Set Environment Variables (in Vercel Dashboard)
```
REACT_APP_API_URL=https://your-backend.com
REACT_APP_SOCKET_URL=wss://your-backend.com
```

### 3. Enable GitHub Integration
- Vercel automatically deploys when you push to `main`
- Creates preview deployments for pull requests

## 🎨 Workflow Patterns

### Pattern 1: Direct to Main (Small Changes)
```mermaid
Developer → main → Vercel → Production
```
Best for: Typos, small CSS fixes, config updates

### Pattern 2: Feature Branch (Larger Changes)
```mermaid
Developer → feature/* → PR Preview → main → Production
```
Best for: New features, refactoring, multi-file changes

### Pattern 3: Hotfix (Urgent Fixes)
```mermaid
Developer → hotfix/* → main → Production
```
Best for: Critical bugs, security patches, broken production

## ⚡ Pro Tips for Beginners

### 1. Commit Often
```bash
# Don't wait - commit small changes frequently
git add .
git commit -m "Add user name field"
git-flow deploy  # Deploy immediately
```

### 2. Use Descriptive Branch Names
```bash
# Good
git-flow feature add-korean-translation
git-flow hotfix fix-login-error

# Bad
git-flow feature test
git-flow hotfix fix
```

### 3. Check Status Before Deploy
```bash
git-flow status  # Always check before deploying
git-flow deploy  # Then deploy
```

### 4. Don't Fear Rollback
```bash
# Made a mistake? Roll back immediately!
git-flow rollback
# Select the previous deployment tag
```

## 🚨 Troubleshooting

### "Not in a Git repository"
```bash
cd /home/ec2-user/DOT-V0.1
git init
```

### "No remote origin"
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

### "Permission denied pushing"
```bash
# Check your GitHub authentication
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

### "Merge conflicts"
```bash
# Don't panic! Fix conflicts manually, then:
git add .
git commit -m "Resolve merge conflicts"
git-flow deploy
```

## 📊 Monitoring Deployments

### Check GitHub Actions
- Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`
- Green checkmark = Success
- Yellow circle = In progress
- Red X = Failed (but deployment might still work!)

### Check Vercel Dashboard
- Go to: `https://vercel.com/dashboard`
- See all deployments and preview URLs
- Roll back directly from Vercel if needed

## 🎯 Success Metrics

You'll know you're using it right when:
- ✅ Deploying multiple times per day feels natural
- ✅ You never work directly on main branch
- ✅ Rollbacks take less than a minute
- ✅ You commit without fear
- ✅ Your Vercel dashboard shows frequent deployments

## 📚 Next Steps

1. **Practice the basic flow**:
   - Make a small change
   - Run `git-flow deploy`
   - See it live!

2. **Try a feature branch**:
   - `git-flow feature test-feature`
   - Make changes
   - `git-flow deploy`

3. **Test rollback**:
   - Deploy something
   - `git-flow rollback`
   - Verify it worked

4. **Set up PR previews**:
   - Push a feature branch
   - Create a PR on GitHub
   - See the preview URL in PR comments

---

**Remember**: This workflow is optimized for solo developers who deploy frequently. Don't overthink it - just ship! 🚀