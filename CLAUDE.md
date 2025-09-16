# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a specification-driven development project utilizing the SuperClaude Framework with emphasis on Test-Driven Development (TDD). The project follows a structured approach where specifications are written before implementation.

## Development Commands

### Build & Test Commands
```bash
# Currently no test framework installed - tests need to be set up
npm test  # Will fail until test framework is configured

# No build scripts configured yet - add as needed:
# npm run build
# npm run lint
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
- `src/` - Source code (currently empty, awaiting implementation)
- `tests/` - Test files (currently empty, TDD approach)
- `docs/` - Project documentation
- `scripts/` - Utility and build scripts

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

## Important Notes

- **No Implementation Yet**: Project is in initial setup phase
- **TDD Mandatory**: Never implement without tests
- **Spec-First**: Always create specifications before coding
- **Korean Documentation**: Use Korean for inline code comments
