# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a specification-driven development project utilizing the SuperClaude Framework with emphasis on Test-Driven Development (TDD). The project follows a structured approach where specifications are written before implementation.

## Development Commands

### Build & Test Commands
```bash
# Test commands (DOT Platform V0.1 - COMPLETED IMPLEMENTATION)
npm test  # Jest unit tests (backend)
npm run test:e2e  # Playwright E2E tests
npm run test:load  # K6 load testing
npm run test:contract  # API contract testing

# Build and deployment
npm run build  # Build production frontend
./scripts/deploy.sh  # Docker Compose deployment with health checks
./scripts/deploy.sh --status  # Check deployment status
./scripts/deploy.sh --rollback  # Rollback to previous version

# Validation commands (NEW: 003-deployment-validation)
npm run validate:deployment  # Post-deployment validation suite
npm run validate:smoke  # Quick smoke tests
npm run validate:performance  # Performance validation (< 3초, 10 users)
```

### Development Workflow
1. **Specification First**: Create specifications in `.specify/` using templates
2. **Test First (TDD)**: Write tests before implementation
3. **Implementation**: Code to pass tests
4. **Documentation**: Update relevant docs

## Project Architecture

### Directory Structure
- `.specify/` - Specification system
  - `templates/` - Templates for specs, plans, tasks, and agents
  - `memory/` - Project constitution and governance docs
  - `scripts/` - Automation scripts for spec workflow
- `backend/` - Node.js/Express backend (COMPLETED)
  - `src/` - API routes, models, services
  - `tests/` - Jest unit and integration tests
- `frontend/` - React frontend (COMPLETED)
  - `src/` - Components, pages, services
  - `tests/` - Playwright E2E tests
- `scripts/` - Deployment and utility scripts
- `docs/` - Implementation analysis and reports
- `specs/` - Feature specifications
  - `002-/` - DOT Platform V0.1 (COMPLETED)
  - `003-/` - Deployment validation (CURRENT)

### Specification-Driven Development
This project uses a formal specification system with the following templates:
- **spec-template.md**: Feature specifications focusing on WHAT and WHY, not HOW
- **plan-template.md**: Technical implementation planning
- **tasks-template.md**: Breakdown of implementation tasks
- **agent-file-template.md**: Agent/service specifications

### Key Development Principles
1. **Library-First**: Every feature starts as a standalone library
2. **CLI Interface**: Libraries expose functionality via CLI with text I/O protocol
3. **Test-First (NON-NEGOTIABLE)**: TDD is mandatory - tests written → approved → fail → implement
4. **Integration Testing**: Required for library contracts, inter-service communication
5. **Korean Comments Required**: All code comments must be in Korean (한글 주석 필수)

### SuperClaude Framework Integration
The project is configured with SuperClaude Framework through:
- Global configuration: `~/.claude/CLAUDE.md`
- Framework rules and principles in `.claude/` directory
- MCP server integrations for enhanced capabilities

## Current Status

### DOT Platform V0.1 (COMPLETED - specs/002-/)
- **Restaurant Management System**: Full implementation completed
- **User Roles**: Owner, Worker, Seeker with role-based access control
- **Core Features**: Authentication, attendance (QR + GPS), scheduling, payroll
- **Quality Features**: i18n (한/영/일/중), accessibility (WCAG 2.1 AA), error tracking
- **Testing**: Comprehensive E2E, integration, and unit tests
- **Deployment**: Docker Compose with Nginx reverse proxy

### Deployment Validation (CURRENT - specs/003-/)
- **Purpose**: Validate implemented features without code modification
- **Requirements**: Docker health checks, performance validation (< 3초, 10 users)
- **Approach**: Multi-layer validation (health, functional, performance, accessibility)
- **Status**: Planning phase complete, ready for /tasks command

## Important Notes

- **TDD Mandatory**: Never implement without tests
- **Spec-First**: Always create specifications before coding
- **Korean Documentation**: Use Korean for inline code comments
- **No Code Modification**: Current feature (003-) prohibits file changes, validation only
- **Performance Requirements**: Page loading < 3초, support 10명 동시 사용자
