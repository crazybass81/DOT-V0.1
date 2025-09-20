# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DOT Platform V0.1 - A comprehensive restaurant management system built with specification-driven development and Test-Driven Development (TDD). The platform supports multiple user roles (Owner, Worker, Seeker) with features including attendance tracking (QR + GPS), scheduling, and payroll management.

## Quick Start Commands

### Development
```bash
# Install dependencies
npm install:all          # Install all workspaces (frontend, backend, shared)

# Start services
npm run start:frontend    # Start React frontend (port 3000)
npm run start:backend     # Start Express backend (port 3001)

# Build
npm run build:frontend    # Build production frontend
npm run build:backend     # Build production backend
```

### Testing (CRITICAL - TDD is mandatory)
```bash
# Unit tests
npm test                  # Jest unit tests
npm run test:unit         # Unit tests only

# Integration & E2E
npm run test:e2e          # Playwright E2E tests
npm run test:contract     # API contract testing
npm run test:integration  # Integration tests

# Performance
npm run test:load         # K6 load testing (<3s, 10 users)

# Validation
npm run validate:deployment  # Post-deployment validation
npm run validate:smoke       # Quick smoke tests
npm run validate:performance # Performance validation
```

### Git Workflow (Simple GitHub Flow)
```bash
# Quick deployment workflow for solo developers
git-flow deploy          # Deploy current changes to main
git-flow feature NAME    # Start new feature branch
git-flow hotfix NAME     # Create and deploy hotfix
git-flow rollback        # Rollback to previous version
git-flow status          # Show current status

# Short aliases (after running setup-git-flow.sh)
gfd                      # git-flow deploy
gff NAME                 # git-flow feature
gfh NAME                 # git-flow hotfix
```

### Deployment
```bash
# Docker Compose deployment
./scripts/deploy.sh           # Deploy with health checks
./scripts/deploy.sh --status  # Check deployment status
./scripts/deploy.sh --rollback # Rollback to previous

# Vercel (automatic on main branch push)
vercel --prod            # Manual Vercel deployment
```

## Architecture Overview

### Technology Stack
- **Frontend**: React 18, Material-UI, Redux Toolkit, React Router v6
- **Backend**: Node.js 20+, Express 4, PostgreSQL, Redis, Socket.io
- **Testing**: Jest (unit), Playwright (E2E), K6 (performance)
- **Deployment**: Docker Compose (backend), Vercel (frontend)
- **CI/CD**: GitHub Actions with automatic deployment

### Project Structure
```
DOT-V0.1/
├── frontend/         # React frontend application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/       # Route-based page components
│   │   ├── services/    # API integration
│   │   └── store/       # Redux state management
│   └── tests/          # E2E and integration tests
│
├── backend/          # Express API server
│   ├── src/
│   │   ├── lib/        # Feature libraries (TDD approach)
│   │   │   ├── auth-lib/
│   │   │   ├── attendance-lib/
│   │   │   ├── payroll-lib/
│   │   │   └── schedule-lib/
│   │   ├── routes/     # API endpoints
│   │   ├── middleware/ # Express middleware
│   │   └── socket/     # Real-time WebSocket handlers
│   └── tests/         # Unit and integration tests
│
├── shared/           # Shared utilities and types
├── specs/           # Feature specifications (spec-driven)
│   ├── 002-/       # DOT Platform V0.1 (COMPLETED)
│   ├── 003-/       # Deployment validation (COMPLETED)
│   └── 004-/       # Simple GitHub Flow (CURRENT)
│
└── .specify/        # Specification system templates
    └── templates/   # Spec, plan, task templates
```

## Development Principles

### Mandatory Requirements
1. **TDD (Test-Driven Development)**: NEVER implement without tests
   - Write tests first → Tests fail → Implement → Tests pass
   - All features must have unit, integration, and E2E tests

2. **Specification-Driven**: Create specs before coding
   - Use templates in `.specify/templates/`
   - Specs focus on WHAT and WHY, not HOW

3. **Library-First Architecture**: Features as standalone libraries
   - Each feature starts as a library in `backend/src/lib/`
   - CLI interface with text I/O protocol
   - Self-contained with own tests

4. **Korean Comments**: 한글 주석 필수
   - All code comments must be in Korean
   - Documentation can be in English

### Performance Requirements
- Page loading: < 3 seconds
- Concurrent users: 10+ support
- Database connections: Pooled (max 20)
- Memory usage: < 512MB per container

### Code Quality Standards
```bash
# Always run before committing
npm run lint             # ESLint checking
npm run typecheck        # TypeScript validation
npm test                 # Run all tests
```

## Key Features

### Core Functionality
- **Authentication**: JWT-based with role switching
- **Attendance**: QR code + GPS verification
- **Scheduling**: Drag-and-drop calendar with templates
- **Payroll**: Automatic calculation with tax/benefits
- **Real-time**: Socket.io for live updates
- **i18n**: Korean, English, Japanese, Chinese support
- **Accessibility**: WCAG 2.1 AA compliant

### User Roles
- **Owner**: Full access, restaurant management
- **Worker**: Check-in/out, view schedules, payslips
- **Seeker**: Job search, application submission

## Database Schema

### Key Tables
- `users`: User accounts with role-based access
- `attendance_records`: Check-in/out with GPS/QR validation
- `schedules`: Work schedules with templates
- `payroll_records`: Calculated payroll with deductions
- `restaurants`: Multi-tenant restaurant data

### Migrations
```bash
npm run db:migrate       # Run database migrations
npm run db:seed          # Seed test data
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - New user registration
- `POST /api/auth/refresh` - Refresh JWT token

### Attendance
- `POST /api/attendance/checkin` - Clock in (QR/GPS)
- `POST /api/attendance/checkout` - Clock out
- `GET /api/attendance/status` - Current status

### Schedule
- `GET /api/schedules` - List schedules
- `POST /api/schedules` - Create schedule
- `PUT /api/schedules/:id` - Update schedule

## Environment Variables

### Required Configuration
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=dot_platform

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_secret_key
JWT_REFRESH_SECRET=your_refresh_key

# Frontend URLs
REACT_APP_API_URL=http://localhost:3001
REACT_APP_SOCKET_URL=ws://localhost:3001
```

## Deployment

### Vercel (Frontend)
- Automatic deployment on push to `main`
- Preview deployments for feature branches
- Environment variables set in Vercel dashboard

### Docker Compose (Full Stack)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### GitHub Actions
- Runs on every push to `main`
- Tests run but don't block deployment (solo developer mode)
- Automatic tagging for rollback capability

## Testing Strategy

### Test Hierarchy
1. **Unit Tests**: Individual functions/components
2. **Integration Tests**: API endpoints, database operations
3. **E2E Tests**: Full user workflows with Playwright
4. **Performance Tests**: K6 load testing for requirements
5. **Validation Tests**: Post-deployment health checks

### Writing Tests
- Place tests next to source files (`.test.js`)
- Use descriptive test names in Korean comments
- Mock external dependencies appropriately
- Ensure tests are deterministic and isolated

## Current Development Status

### Completed Features (specs/002-003/)
- Full restaurant management system
- Multi-role authentication and authorization
- QR/GPS attendance tracking
- Scheduling with templates
- Payroll calculation
- i18n and accessibility
- Docker deployment with validation

### Active Development (specs/004-simple-github-flow/)
- Simplified Git workflow for solo developers
- One-command deployment process
- Automatic Vercel integration
- Quick rollback capability

## Important Notes

- **No Code Without Tests**: TDD is non-negotiable
- **Spec-First Development**: Always create specifications
- **Performance Critical**: Must meet <3s load, 10 user requirements
- **Korean Priority**: Comments and user-facing text in Korean
- **Clean Git History**: Use meaningful commit messages
- **No Direct Main Commits**: Always use feature branches