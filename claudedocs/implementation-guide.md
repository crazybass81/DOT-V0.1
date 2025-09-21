# Implementation Guide: Unified Deployment Pipeline
## DOT-V0.1 GitHub Actions Migration

**Created**: 2025-09-21
**Target**: Safe migration from 8 workflows to 1 unified solution
**Estimated Time**: 2-3 hours

---

## Pre-Migration Checklist

### 1. **Verify GitHub Secrets**
Ensure all required secrets are configured in repository settings:

```bash
# Required Secrets
✅ VERCEL_TOKEN          # Vercel deployment token
✅ VERCEL_ORG_ID         # Vercel organization ID
✅ VERCEL_PROJECT_ID     # Vercel project ID
✅ EC2_HOST              # EC2 instance IP/hostname
✅ EC2_USER              # EC2 username (ec2-user)
✅ EC2_SSH_KEY           # Private SSH key for EC2 access

# Optional Secrets
⚪ SLACK_WEBHOOK         # Slack notification webhook
```

### 2. **Validate Current Deployment State**
```bash
# Check current deployments are working
curl -f https://your-vercel-app.vercel.app/
curl -f http://YOUR_EC2_HOST:3001/health

# Verify GitHub Container Registry access
docker login ghcr.io -u YOUR_GITHUB_USERNAME

# Check EC2 Docker environment
ssh ec2-user@YOUR_EC2_HOST "docker --version && docker-compose --version"
```

### 3. **Backup Current Configuration**
```bash
# Create backup branch with current workflows
git checkout -b backup-old-workflows
git add .github/workflows/
git commit -m "Backup: Save current workflow files before unified migration"
git push origin backup-old-workflows
```

---

## Migration Steps

### Phase 1: Deploy Unified Workflow (Safe Testing)

#### Step 1.1: Create New Workflow File
```bash
# Copy the unified workflow to the workflows directory
cp claudedocs/unified-deploy-workflow.yml .github/workflows/unified-deploy.yml
```

#### Step 1.2: Test with Manual Trigger
```bash
# GitHub UI → Actions → "Unified Deployment Pipeline" → "Run workflow"
# Select options:
# - Skip tests: true
# - Environment: staging
# - Rollback mode: false

# Monitor the workflow execution for any issues
```

#### Step 1.3: Validate Manual Test Results
```bash
# Check frontend deployment
curl -f https://your-vercel-preview-url.vercel.app/

# Check backend deployment (if using staging)
curl -f http://YOUR_EC2_HOST:3001/health

# Verify logs in GitHub Actions
```

### Phase 2: Disable Existing Workflows

#### Step 2.1: Rename Existing Workflows (Disable)
```bash
# Rename existing workflows to prevent conflicts
mv .github/workflows/ci.yml .github/workflows/ci.yml.disabled
mv .github/workflows/deploy.yml .github/workflows/deploy.yml.disabled
mv .github/workflows/backend-deploy.yml .github/workflows/backend-deploy.yml.disabled
mv .github/workflows/deploy-main.yml .github/workflows/deploy-main.yml.disabled
mv .github/workflows/frontend-deploy.yml .github/workflows/frontend-deploy.yml.disabled
mv .github/workflows/full-deploy.yml .github/workflows/full-deploy.yml.disabled
mv .github/workflows/preview-pr.yml .github/workflows/preview-pr.yml.disabled
mv .github/workflows/vercel-deploy.yml .github/workflows/vercel-deploy.yml.disabled

# Commit changes
git add .github/workflows/
git commit -m "Disable old workflows for unified pipeline migration"
git push origin main
```

#### Step 2.2: Test Production Deployment
```bash
# Make a small change to trigger main branch deployment
echo "# Unified deployment test" >> README.md
git add README.md
git commit -m "Test unified deployment pipeline"
git push origin main

# Monitor unified workflow execution
# Expected timeline: ~7 minutes total
```

### Phase 3: Validation & Monitoring

#### Step 3.1: Verify Production Deployment
```bash
# Frontend validation
curl -f https://your-production-vercel-app.vercel.app/
echo "Frontend response time: $(curl -o /dev/null -s -w '%{time_total}' https://your-app.vercel.app/)s"

# Backend validation
curl -f http://YOUR_EC2_HOST:3001/health
curl -s http://YOUR_EC2_HOST:3001/version

# Check GitHub Container Registry
docker pull ghcr.io/YOUR_USERNAME/dot-v0.1-backend:COMMIT_SHA
```

#### Step 3.2: Test PR Preview Functionality
```bash
# Create test PR
git checkout -b test-pr-preview
echo "# Test PR preview" >> frontend/src/App.js
git add frontend/src/App.js
git commit -m "Test: PR preview deployment"
git push origin test-pr-preview

# Create PR via GitHub UI
# Verify preview deployment comment appears
# Test preview URL functionality
```

#### Step 3.3: Test Rollback Capability
```bash
# Manual rollback test via GitHub UI
# Actions → "Unified Deployment Pipeline" → "Run workflow"
# Select: rollback_mode: true

# Verify rollback completes successfully
# Check services return to previous versions
```

---

## Post-Migration Tasks

### 1. **Clean Up Disabled Workflows**
```bash
# After 48 hours of successful unified deployment
rm .github/workflows/*.yml.disabled

git add .github/workflows/
git commit -m "Remove old workflow files after successful unified migration"
git push origin main
```

### 2. **Update Documentation**
```bash
# Update CLAUDE.md with new workflow info
# Remove references to old individual workflows
# Document new unified deployment process
```

### 3. **Monitor Performance Metrics**
Track improvements over first week:
- **Deployment Time**: Should be ~7 minutes (vs previous ~15 minutes)
- **CI/CD Minutes Usage**: Should reduce by ~70%
- **Success Rate**: Target >95% with automated rollback
- **Developer Experience**: Single workflow visibility

---

## Troubleshooting Guide

### Common Issues & Solutions

#### Issue 1: Docker Build Failures
```bash
# Symptoms: Backend build fails in unified workflow
# Solution: Check Dockerfile.backend exists in /backend/ directory
ls -la backend/Dockerfile

# Verify Docker build locally
cd backend && docker build -t test .
```

#### Issue 2: Vercel Deployment Failures
```bash
# Symptoms: Frontend deployment fails
# Solution: Verify Vercel secrets and project configuration
vercel whoami --token $VERCEL_TOKEN
vercel ls --token $VERCEL_TOKEN --scope $VERCEL_ORG_ID
```

#### Issue 3: EC2 SSH Connection Issues
```bash
# Symptoms: Cannot connect to EC2 for backend deployment
# Solution: Verify SSH key and EC2 accessibility
ssh -i ec2-key.pem ec2-user@YOUR_EC2_HOST "echo 'SSH connection successful'"

# Check EC2 security group allows SSH (port 22) from GitHub Actions IPs
```

#### Issue 4: Health Check Failures
```bash
# Symptoms: Backend health checks fail after deployment
# Solution: Debug container status on EC2
ssh ec2-user@YOUR_EC2_HOST "docker-compose -f DOT-V0.1/docker-compose.prod.yml ps"
ssh ec2-user@YOUR_EC2_HOST "docker-compose -f DOT-V0.1/docker-compose.prod.yml logs backend"
```

### Emergency Rollback Procedure

If unified workflow fails completely:
```bash
# 1. Restore old workflows
git checkout backup-old-workflows -- .github/workflows/
git commit -m "Emergency: Restore old workflows"
git push origin main

# 2. Manual deployment via old workflows
# 3. Investigate unified workflow issues
# 4. Fix and retry migration
```

---

## Performance Monitoring

### Success Metrics to Track

#### Deployment Efficiency
```yaml
Before Unified Pipeline:
  - Workflow Files: 8
  - Average Deployment Time: ~15 minutes
  - CI/CD Minutes per Deployment: ~45 minutes
  - Success Rate: ~85%

After Unified Pipeline:
  - Workflow Files: 1
  - Average Deployment Time: ~7 minutes
  - CI/CD Minutes per Deployment: ~15 minutes
  - Success Rate: >95% (with rollback)
```

#### Quality Metrics
```yaml
Developer Experience:
  - Single workflow view in GitHub Actions
  - Clear deployment status and artifacts
  - Automated rollback on failure
  - Non-blocking tests for rapid iteration

Reliability:
  - Automated health validation
  - Performance requirement enforcement (<3s load time)
  - Slack notifications for deployment status
  - Tagged releases for easy rollback
```

### Monitoring Commands
```bash
# Check deployment frequency
git log --oneline --since="1 week ago" --grep="deploy"

# Monitor CI/CD usage
# GitHub → Settings → Billing → Actions usage

# Track deployment success rate
# GitHub → Actions → Workflow runs analysis
```

---

## Next Steps

### Immediate (Week 1)
- [ ] Monitor unified workflow performance
- [ ] Collect developer feedback
- [ ] Fine-tune deployment timings
- [ ] Optimize Docker build caching

### Short-term (Month 1)
- [ ] Add automated E2E tests to validation phase
- [ ] Implement deployment metrics collection
- [ ] Set up monitoring dashboards
- [ ] Document runbook for common scenarios

### Long-term (Quarter 1)
- [ ] Consider adding staging environment workflow
- [ ] Evaluate adding automated security scanning
- [ ] Implement blue-green deployment strategy
- [ ] Add performance regression detection

---

## Support & References

### Key Files Created
- `/claudedocs/github-actions-architecture-redesign.md` - Complete architectural analysis
- `/claudedocs/unified-deploy-workflow.yml` - Production-ready workflow
- `/claudedocs/implementation-guide.md` - This migration guide

### GitHub Actions Documentation
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Vercel GitHub Integration](https://vercel.com/docs/concepts/git/vercel-for-github)
- [Docker Build Push Action](https://github.com/docker/build-push-action)

### Emergency Contacts
- **GitHub Actions Issues**: Check GitHub Status page
- **Vercel Issues**: Vercel Support or Status page
- **EC2 Issues**: AWS Support or Status dashboard
- **Project Issues**: Repository maintainer or team lead

This implementation guide provides a safe, step-by-step approach to migrating from the current 8-workflow architecture to a single, efficient unified deployment pipeline optimized for solo developer productivity.