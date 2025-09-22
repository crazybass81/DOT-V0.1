# MCP (Model Context Protocol) Configuration Guide

## 🚀 Active MCP Servers

This project uses optimized MCP servers for enhanced Claude Code capabilities.

### Currently Active (12 servers)

| MCP Server | Purpose | Status |
|------------|---------|--------|
| **Sequential Thinking** | Complex analysis, step-by-step reasoning | ✅ Active |
| **GitHub** | GitHub repository management, PRs, issues | ✅ Active |
| **Filesystem** | Advanced file operations | ✅ Active |
| **IDE** | VS Code integration, diagnostics | ✅ Active |
| **Vercel** | Deployment and project management | ✅ Active |
| **Memory** | Session persistence, cross-session memory | ✅ Configured |
| **Serena** | Advanced code analysis, symbol operations, LSP | ✅ Installed |
| **Playwright** | Browser automation, E2E testing, web scraping | ✅ Installed |
| **Context7** | Documentation search, framework guides, API references | ✅ Installed |
| **Magic** | AI-powered UI component generation | ✅ Installed |
| **Morphllm** | Pattern-based code transformation, Fast Apply | ✅ Installed |
| **Tavily** | AI-optimized web search, real-time information | ✅ Installed |

## 📁 Configuration File

- **Location**: `/home/ec2-user/DOT-V0.1/mcp-config.json`
- **Backup**: `/home/ec2-user/DOT-V0.1/mcp-config-backup.json`

## 🔧 MCP Server Details

### Sequential Thinking
- **Path**: `@modelcontextprotocol/server-sequential-thinking`
- **Use Cases**:
  - Complex debugging
  - Architecture analysis
  - Multi-step problem solving

### GitHub
- **Path**: `@modelcontextprotocol/server-github`
- **Use Cases**:
  - Repository management
  - Pull request operations
  - Issue tracking
  - Git operations (replaces standalone Git MCP)

### Filesystem
- **Path**: `@modelcontextprotocol/server-filesystem`
- **Root**: `/home/ec2-user`
- **Use Cases**:
  - Advanced file operations
  - Directory management
  - File search and analysis

### IDE
- **Built-in**: Integrated with VS Code
- **Use Cases**:
  - Code diagnostics
  - Execute code in notebooks
  - Language server integration

### Vercel
- **Built-in**: Integrated deployment tool
- **Team**: 021 (team_ZRA46B1Ng8n027CYnt0PzJzr)
- **Use Cases**:
  - Deploy projects
  - Manage deployments
  - Check build logs

### Memory
- **Path**: `mcp-servers-official/src/memory`
- **Use Cases**:
  - Persist information across sessions
  - Store project context
  - Remember user preferences

### Serena
- **Path**: `/home/ec2-user/serena`
- **Language**: Python 3.11
- **Repository**: https://github.com/oraios/serena
- **Use Cases**:
  - Semantic code understanding and navigation
  - Symbol-level operations (rename, extract, move)
  - Find references and dependencies
  - Project memory and session persistence
  - Language Server Protocol (LSP) integration
  - Advanced code analysis and refactoring
- **Key Commands**:
  - `/sc:load` - Load project context
  - `/sc:save` - Save current session
  - `find_symbol` - Find code symbols
  - `find_referencing_symbols` - Find references
  - `insert_after_symbol` - Code insertion

### Playwright
- **Path**: `/home/ec2-user/playwright-mcp`
- **Repository**: https://github.com/microsoft/playwright-mcp
- **Browsers**: Chromium (installed)
- **Use Cases**:
  - Browser automation and web scraping
  - End-to-end (E2E) testing
  - Visual regression testing
  - Cross-browser testing
  - Form submission and interaction testing
  - Screenshot and video capture
  - Network request interception
  - Mobile device emulation
- **Key Features**:
  - Headless and headed browser modes
  - Auto-waiting for elements
  - Network mocking and stubbing
  - Multiple browser context support
  - Geolocation and timezone simulation
  - Accessibility testing (WCAG compliance)

### Context7
- **Path**: `/home/ec2-user/context7`
- **Repository**: https://github.com/upstash/context7
- **Language**: TypeScript/Node.js
- **Use Cases**:
  - Official documentation search
  - Framework and library guides
  - API reference lookup
  - Best practices and patterns
  - Version-specific documentation
  - Semantic documentation search
- **Key Features**:
  - Curated documentation sources
  - Vector-based semantic search
  - Context-aware recommendations
  - Multi-framework support (React, Vue, Angular, etc.)
  - Fast documentation retrieval
  - Offline documentation caching

### Magic
- **Package**: `@21st-dev/magic@latest`
- **Installation**: Via npx (no local install needed)
- **Repository**: https://21st.dev
- **Version**: v0.0.46+
- **API Key**: ✅ Configured (enhanced features enabled)
- **Use Cases**:
  - Modern UI component generation
  - Production-ready React components
  - Design system creation
  - Responsive layouts
  - Accessible components (WCAG compliant)
  - Interactive UI elements
  - Form components with validation
  - Data visualization components
- **Key Features**:
  - AI-powered component generation
  - Framework agnostic (React, Vue, Angular)
  - Built-in accessibility
  - Tailwind CSS integration
  - TypeScript support
  - Component customization
  - Best practices enforcement
  - Mobile-first responsive design
- **Commands**:
  - `/ui` or `/21` - Generate UI components
  - Automatic component suggestions
  - Code optimization and refinement

### Morphllm
- **Package**: `@morph-llm/morph-fast-apply`
- **Installation**: Via npx (no local install needed)
- **API Key**: ✅ Configured (MORPH_API_KEY)
- **Project Path**: `/home/ec2-user/DOT-V0.1`
- **Use Cases**:
  - Pattern-based code editing across multiple files
  - Bulk code transformations and refactoring
  - Framework migrations and updates
  - Style guide enforcement
  - Code cleanup and standardization
  - Natural language code edits
  - Token-efficient operations (30-50% reduction)
- **Key Features**:
  - Fast Apply mode for rapid transformations
  - Pattern matching and replacement
  - Context-aware edits
  - Multi-file operations
  - Preserves code structure and formatting
  - Intelligent dependency tracking
  - Rollback capability
- **Advantages**:
  - Faster than manual edits for bulk changes
  - Consistent application of patterns
  - Reduces LLM token usage significantly
  - Safer than regex-based replacements

### Tavily
- **Package**: `tavily-mcp`
- **Installation**: Global npm package
- **Version**: 0.2.10
- **API Key**: ✅ Configured (TAVILY_API_KEY)
- **Use Cases**:
  - Real-time web search and information retrieval
  - Current events and news lookup
  - Market data and trends analysis
  - Technical documentation search
  - Competitor analysis and research
  - Fact-checking and verification
  - Multi-source information aggregation
- **Key Features**:
  - AI-optimized search results
  - Structured data extraction
  - Source credibility ranking
  - Multi-language support
  - Search result summarization
  - Context-aware filtering
  - Real-time data fetching
  - API rate limiting management
- **Search Capabilities**:
  - Web pages and articles
  - News and current events
  - Academic papers
  - Social media trends
  - Product information
  - Company data
- **Advantages**:
  - Optimized for LLM consumption
  - Reduces hallucination with real data
  - Provides source citations
  - Time-aware search (recent vs historical)

## ❌ Removed MCP Servers

The following were removed due to redundancy or lack of necessity:

| MCP Server | Removal Reason |
|------------|---------------|
| **Git** | Redundant - GitHub MCP includes all Git functionality |
| **Fetch** | Redundant - WebFetch tool provides same functionality |
| **Time** | Unnecessary - Basic time operations sufficient |
| **Serena** | Complex setup, not currently needed |

## 🔄 Updating MCP Configuration

1. Edit `/home/ec2-user/DOT-V0.1/mcp-config.json`
2. Restart Claude Code for changes to take effect
3. Test with relevant MCP commands

## 📝 Notes

- MCP servers enhance Claude Code's capabilities but require proper installation
- Each MCP server must be both installed AND registered with Claude to work
- The configuration is optimized for the DOT-V0.1 project requirements
- Memory MCP helps maintain context across different sessions