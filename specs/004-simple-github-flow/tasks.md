# Tasks: Simple GitHub Flow

**Input**: Design documents from `/specs/004-simple-github-flow/`
**Prerequisites**: plan.md (required), research.md
**Branch**: `004-simple-github-flow`

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Extract: DevOps configuration, Git workflow structure
2. Load research.md:
   → Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: Git configuration, directory structure
   → Tests: workflow validation, deployment tests
   → Core: helper scripts, GitHub Actions
   → Integration: Vercel hooks, environment setup
   → Polish: documentation, quickstart guide
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Scripts**: `scripts/` at repository root
- **GitHub Actions**: `.github/workflows/`
- **Tests**: `tests/integration/`, `tests/unit/`
- **Documentation**: `docs/`, quickstart in spec directory

## Phase 3.1: Setup
- [ ] T001 Create directory structure for Git workflow scripts
- [ ] T002 [P] Initialize Git configuration for development workflow
- [ ] T003 [P] Set up Bash script testing framework

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [ ] T004 [P] Test script for Git workflow commands in tests/integration/git-flow.test.sh
- [ ] T005 [P] Test script for GitHub Actions triggers in tests/integration/github-actions.test.sh
- [ ] T006 [P] Test script for Vercel deployment hooks in tests/integration/deployment.test.sh
- [ ] T007 [P] Test script for helper functions in tests/unit/helpers.test.sh

## Phase 3.3: Core Implementation (ONLY after tests are failing)
### Git Helper Scripts
- [ ] T008 Create git-flow-helper.sh main workflow script in scripts/git-flow-helper.sh
- [ ] T009 Create setup-git-flow.sh initialization script in scripts/setup-git-flow.sh
- [ ] T010 [P] Create git-helpers.sh shared utilities in scripts/lib/git-helpers.sh

### GitHub Actions Workflows
- [ ] T011 [P] Create deploy-main.yml for production deployment in .github/workflows/deploy-main.yml
- [ ] T012 [P] Create preview-pr.yml for PR previews in .github/workflows/preview-pr.yml

### Command Implementation
- [ ] T013 Implement 'git-flow deploy' command for full deployment flow
- [ ] T014 Implement 'git-flow hotfix' command for quick fixes
- [ ] T015 Implement 'git-flow feature' command for new features
- [ ] T016 Implement 'git-flow rollback' command for reverting deployments

## Phase 3.4: Integration
- [ ] T017 Configure Git aliases in setup script
- [ ] T018 Add Vercel webhook configuration to workflows
- [ ] T019 Set up environment variable handling for local vs production
- [ ] T020 Add error handling and recovery mechanisms to scripts

## Phase 3.5: Polish
- [ ] T021 [P] Create quickstart.md guide in specs/004-simple-github-flow/quickstart.md
- [ ] T022 [P] Update CLAUDE.md with Simple GitHub Flow context
- [ ] T023 Add command help documentation to scripts
- [ ] T024 Run full workflow validation tests
- [ ] T025 Create .env.example template

## Dependencies
- Tests (T004-T007) before implementation (T008-T016)
- T008 blocks T013-T016 (commands depend on main script)
- T009 blocks T017 (aliases need setup script)
- T011-T012 block T018 (Vercel config needs workflows)
- Implementation before polish (T021-T025)

## Parallel Example
```bash
# Launch T004-T007 together:
Task: "Test script for Git workflow commands in tests/integration/git-flow.test.sh"
Task: "Test script for GitHub Actions triggers in tests/integration/github-actions.test.sh"
Task: "Test script for Vercel deployment hooks in tests/integration/deployment.test.sh"
Task: "Test script for helper functions in tests/unit/helpers.test.sh"

# Launch T011-T012 together:
Task: "Create deploy-main.yml for production deployment"
Task: "Create preview-pr.yml for PR previews"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing scripts
- Commit after each task with descriptive messages
- Test scripts locally before pushing
- Focus on beginner-friendly error messages

## Validation Checklist
*GATE: Checked before marking phase complete*

- [ ] All scripts have corresponding tests
- [ ] All workflows have validation tests
- [ ] Tests come before implementation (TDD)
- [ ] Parallel tasks truly independent
- [ ] Each task specifies exact file path
- [ ] No task modifies same file as another [P] task
- [ ] Helper documentation is beginner-friendly
- [ ] Rollback mechanism tested and documented

## Expected Outcomes
1. **Git Workflow**: Simple 3-command workflow (deploy, hotfix, feature)
2. **GitHub Actions**: Automatic deployment on main push, PR previews
3. **Vercel Integration**: Seamless deployment with environment variables
4. **Developer Experience**: Beginner-friendly with clear error messages
5. **Documentation**: Comprehensive quickstart guide for immediate use

## Time Estimates
- Phase 3.1 Setup: 30 minutes
- Phase 3.2 Tests: 1 hour
- Phase 3.3 Core: 2 hours
- Phase 3.4 Integration: 1 hour
- Phase 3.5 Polish: 1 hour
- **Total**: ~5.5 hours

---
*Based on plan.md and research.md from /specs/004-simple-github-flow/*