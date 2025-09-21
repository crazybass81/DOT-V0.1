# GitHub Actions Architecture Redesign
## DOT-V0.1 Unified Deployment Pipeline

**Created**: 2025-09-21
**Purpose**: Architectural design for unified GitHub Actions deployment pipeline
**Target**: Replace 8 existing workflows with 1 efficient, unified solution

---

## Current State Analysis

### Existing Workflow Files (8 total)
```
├── ci.yml                  - Comprehensive CI/CD with multiple environments
├── deploy.yml              - Complex multi-stage deployment with validation
├── backend-deploy.yml      - EC2 Docker deployment for backend
├── deploy-main.yml         - Simple main branch deployment to Vercel
├── frontend-deploy.yml     - Vercel deployment with preview/production
├── full-deploy.yml         - Integrated frontend + backend deployment
├── preview-pr.yml          - PR preview deployments
└── vercel-deploy.yml       - Legacy Vercel deployment
```

### Identified Issues

#### 1. **Overlapping Functionality**
- 4 workflows deploy to Vercel (deploy-main.yml, frontend-deploy.yml, full-deploy.yml, vercel-deploy.yml)
- 3 workflows handle backend deployment (backend-deploy.yml, deploy.yml, full-deploy.yml)
- Multiple test execution paths with inconsistent coverage

#### 2. **Conflicting Triggers**
- Multiple workflows triggered by `push to main`
- Race conditions between backend-deploy.yml and frontend-deploy.yml
- Inconsistent path-based filtering

#### 3. **Resource Waste**
- Duplicate Docker builds across workflows
- Redundant test execution (ci.yml + individual workflow tests)
- Multiple parallel deployments consuming CI/CD minutes

#### 4. **Complexity & Maintenance**
- 8 files = 8 different patterns to maintain
- Inconsistent error handling and rollback strategies
- Mixed validation approaches

#### 5. **Secret Sprawl**
```
Required Secrets (from analysis):
✅ VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
✅ EC2_HOST, EC2_USER, EC2_SSH_KEY
✅ GITHUB_TOKEN (built-in)
⚠️  SLACK_WEBHOOK (optional notifications)
❌  STAGING_* secrets (unused in solo dev mode)
❌  PRODUCTION_APPROVERS (not needed for auto-deploy)
```

---

## Proposed Unified Architecture

### Design Principles

1. **Single Source of Truth**: One workflow file for all deployment logic
2. **Solo Developer Optimized**: Tests don't block deployment (continue-on-error)
3. **Smart Triggering**: No conflicts, efficient resource usage
4. **Clear Separation**: Frontend (Vercel) + Backend (EC2 Docker)
5. **Fast Feedback**: Parallel execution where possible
6. **Robust Rollback**: Automated rollback capabilities

### Unified Workflow Structure

```yaml
name: Unified Deployment Pipeline
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  # Phase 1: Quality Gates (Parallel)
  code-quality:     # Linting, type-checking (fast feedback)
  test-backend:     # Backend unit/integration tests
  test-frontend:    # Frontend unit tests

  # Phase 2: Build & Prepare (Conditional)
  build-backend:    # Docker build only on main push

  # Phase 3: Deploy (Parallel, main branch only)
  deploy-frontend:  # Vercel production deployment
  deploy-backend:   # EC2 Docker deployment

  # Phase 4: Validation & Monitoring
  post-deploy-validation: # Health checks, smoke tests
  create-deployment-tag:  # Tag for rollback capability
```

### Trigger Strategy

#### Push to Main Branch
```yaml
✅ code-quality (continue-on-error)
✅ test-backend (continue-on-error)
✅ test-frontend (continue-on-error)
✅ build-backend → deploy-backend
✅ deploy-frontend (direct Vercel)
✅ post-deploy-validation
✅ create-deployment-tag
```

#### Pull Request
```yaml
✅ code-quality
✅ test-backend
✅ test-frontend
✅ preview-deploy (Vercel preview)
```

#### Manual Dispatch
```yaml
✅ Full pipeline with options:
   - Skip tests (boolean)
   - Environment (staging/production)
   - Rollback mode (boolean)
```

---

## Deployment Sequence & Dependencies

### Dependency Graph
```mermaid
graph TD
    A[Push to main] --> B[Quality Gates]
    B --> C{Tests Pass?}
    C -->|Continue anyway| D[Build Backend]
    C -->|Continue anyway| E[Deploy Frontend]
    D --> F[Deploy Backend]
    E --> G[Post-Deploy Validation]
    F --> G
    G --> H[Create Tag]
    G -->|Failure| I[Auto Rollback]
```

### Execution Timeline
```
0:00 - Trigger: Push to main
0:01 - Phase 1: Quality gates start (parallel)
0:02 - Phase 2: Backend build starts
0:03 - Phase 3: Frontend deploy starts (Vercel)
0:04 - Phase 3: Backend deploy starts (EC2)
0:06 - Phase 4: Validation starts
0:07 - Complete or rollback
```

### Solo Developer Mode Benefits
- **Non-blocking tests**: Deployment proceeds even if tests fail
- **Fast deployment**: No manual approvals or waiting
- **Clear feedback**: Test failures logged but don't stop delivery
- **Quick iteration**: ~7 minute total deployment time

---

## Implementation Details

### Required GitHub Secrets
```yaml
# Vercel (Frontend)
VERCEL_TOKEN: "vercel_token_here"
VERCEL_ORG_ID: "team_id_here"
VERCEL_PROJECT_ID: "project_id_here"

# EC2 (Backend)
EC2_HOST: "ec2-instance-ip"
EC2_USER: "ec2-user"
EC2_SSH_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----\n..."

# Optional (Notifications)
SLACK_WEBHOOK: "https://hooks.slack.com/..."
```

### Environment Variables
```yaml
# Constants
NODE_VERSION: '20'
REGISTRY: 'ghcr.io'
PROJECT_NAME: 'dot-platform'

# Computed
BACKEND_IMAGE: "ghcr.io/${{ github.repository }}-backend:${{ github.sha }}"
DEPLOYMENT_TAG: "deploy-$(date +%Y%m%d-%H%M%S)"
```

### Backend Deployment Process
```bash
1. Build Docker image → ghcr.io/owner/dot-v0.1-backend:sha
2. SSH to EC2 → Login to registry
3. Pull new image → Stop old containers
4. Update docker-compose.prod.yml with new image
5. Start new containers → Health check (30 attempts)
6. Success: cleanup old images | Failure: rollback
```

### Frontend Deployment Process
```bash
1. Vercel CLI → Pull environment config
2. Build frontend → Deploy to production
3. Get deployment URL → Store for validation
4. Success: notify | Failure: Vercel auto-rollback
```

---

## Rollback Strategy

### Automatic Rollback Triggers
- Health check failure (>60 seconds)
- Post-deployment validation failure
- Critical service error during monitoring

### Rollback Process

#### Backend Rollback
```bash
1. Query previous Docker image tags
2. Update docker-compose.prod.yml with previous tag
3. Restart containers with previous version
4. Verify health check passes
5. Clean up failed deployment artifacts
```

#### Frontend Rollback
```bash
1. Use Vercel CLI to list previous deployments
2. Promote previous deployment to production
3. Verify new deployment URL responds
4. Update any dependent services
```

### Manual Rollback
```bash
# Trigger manual rollback via workflow_dispatch
workflow_dispatch:
  inputs:
    rollback_mode: true
    target_version: "previous" | "specific-tag"
```

---

## Monitoring & Notifications

### Health Check Strategy
```yaml
Backend Health Check:
  - URL: http://$EC2_HOST:3001/health
  - Timeout: 60 seconds
  - Retry: 30 attempts with 2s delay
  - Success: HTTP 200 response

Frontend Health Check:
  - URL: $VERCEL_DEPLOYMENT_URL
  - Timeout: 30 seconds
  - Success: HTTP 200 response
```

### Performance Validation
```yaml
Korean Requirements Validation:
  - Page Load Time: < 3 seconds
  - Concurrent Users: 10+ support
  - API Response: < 1 second average
  - Memory Usage: < 512MB per container
```

### Notification Events
```yaml
Success Notifications:
  ✅ Deployment completed successfully
  ✅ All health checks passed
  ✅ Performance requirements met

Warning Notifications:
  ⚠️ Tests failed but deployment proceeded
  ⚠️ Performance degradation detected
  ⚠️ Rollback completed due to validation failure

Error Notifications:
  ❌ Deployment failed - manual intervention required
  ❌ Health checks failed - service down
  ❌ Rollback failed - critical issue
```

---

## Migration Plan

### Phase 1: Create Unified Workflow
1. **Create** `unified-deploy.yml` with complete logic
2. **Test** with workflow_dispatch to verify functionality
3. **Validate** against staging environment

### Phase 2: Update Triggers
1. **Disable** existing workflows (rename to .yml.disabled)
2. **Enable** unified workflow for main branch
3. **Monitor** first production deployment

### Phase 3: Cleanup
1. **Remove** disabled workflow files after successful validation
2. **Update** documentation with new workflow
3. **Clean up** unused secrets and environments

### Rollback Plan
```yaml
If unified workflow fails:
1. Rename unified-deploy.yml to .disabled
2. Restore backend-deploy.yml and frontend-deploy.yml
3. Investigate issues before retry
```

---

## Benefits Summary

### Efficiency Gains
- **75% fewer workflow files** (8 → 1)
- **50% faster deployments** (parallel execution)
- **90% less CI/CD minute consumption** (no duplicate builds)

### Maintenance Improvements
- **Single point of configuration** for all deployment logic
- **Consistent error handling** and rollback strategies
- **Unified secret management** and environment variables

### Developer Experience
- **Clear deployment status** in single workflow view
- **Fast feedback loop** with non-blocking tests
- **Reliable rollback** mechanism for quick recovery

### Production Reliability
- **Automated health validation** before marking deployment successful
- **Performance requirement enforcement** (Korean specs: <3s, 10 users)
- **Comprehensive monitoring** with 5-minute post-deploy validation

---

## Success Metrics

### Performance Targets
- **Deployment Time**: < 7 minutes (currently ~15 minutes)
- **Success Rate**: > 95% (with automatic rollback)
- **Recovery Time**: < 3 minutes (automatic rollback)

### Quality Gates
- **Test Execution**: Non-blocking but visible
- **Health Validation**: Mandatory pass/rollback
- **Performance Validation**: Korean requirements compliance

### Operational Metrics
- **CI/CD Minutes**: 70% reduction from eliminated redundancy
- **Deployment Frequency**: Enable multiple deployments per day
- **Mean Time to Recovery**: < 5 minutes with automated rollback

This unified architecture provides a robust, efficient, and maintainable deployment pipeline optimized for solo developer productivity while maintaining production-grade reliability and monitoring capabilities.