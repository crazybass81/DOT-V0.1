#!/bin/bash
# SuperClaude에 필요한 6개 MCP 서버 설치 스크립트

echo "🚀 SuperClaude MCP 서버 설치 시작 (6개 서버)..."
echo "================================================"

# MCP 서버 설치 디렉토리 생성
MCP_DIR="$HOME/.config/mcp-servers"
mkdir -p "$MCP_DIR"
cd "$MCP_DIR"

# 색상 코드
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${YELLOW}📦 1. Filesystem MCP (Serena 대체) - 파일 시스템 접근${NC}"
echo "------------------------------------------------"
if [ ! -d "mcp-servers-official" ]; then
  git clone https://github.com/modelcontextprotocol/servers.git mcp-servers-official
fi
cd mcp-servers-official/src/filesystem
npm install
npm run build
echo -e "${GREEN}✓ Filesystem MCP 설치 완료${NC}"
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 2. GitHub MCP - GitHub 작업${NC}"
echo "------------------------------------------------"
cd mcp-servers-official/src/github
npm install
npm run build
echo -e "${GREEN}✓ GitHub MCP 설치 완료${NC}"
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 3. Sequential-thinking MCP - 복잡한 분석${NC}"
echo "------------------------------------------------"
npm install -g @llmindset/mcp-server-sequential-thinking
echo -e "${GREEN}✓ Sequential-thinking MCP 설치 완료${NC}"

echo ""
echo -e "${YELLOW}📦 4. Playwright MCP - 브라우저 자동화 테스트${NC}"
echo "------------------------------------------------"
if [ ! -d "playwright-mcp" ]; then
  git clone https://github.com/executeautomation/mcp-playwright.git playwright-mcp
  cd playwright-mcp
  npm install
  npm run build
  # Playwright 브라우저 설치
  npx playwright install chromium
else
  cd playwright-mcp
  npm install
  npm run build
fi
echo -e "${GREEN}✓ Playwright MCP 설치 완료${NC}"
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 5. Vercel MCP (Context7 대체) - 문서 및 배포${NC}"
echo "------------------------------------------------"
cd mcp-servers-official/src/vercel
npm install
npm run build
echo -e "${GREEN}✓ Vercel MCP 설치 완료${NC}"
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 6. IDE MCP (Magic/Morphllm 대체) - 코드 편집${NC}"
echo "------------------------------------------------"
if [ ! -d "vscode-mcp" ]; then
  git clone https://github.com/asankagit/vscode-mcp-server.git vscode-mcp
  cd vscode-mcp
  npm install
  npm run build
else
  cd vscode-mcp
  npm install
  npm run build
fi
echo -e "${GREEN}✓ IDE MCP 설치 완료${NC}"
cd "$MCP_DIR"

echo ""
echo "================================================"
echo -e "${YELLOW}📝 MCP 설정 파일 생성...${NC}"
echo "================================================"

# MCP 설정 파일 생성 (6개 서버 모두 포함)
cat > "$HOME/DOT-V0.1/mcp-config-complete.json" << 'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["${HOME}/.config/mcp-servers/mcp-servers-official/src/filesystem/dist/index.js"],
      "env": {
        "ALLOWED_DIRECTORIES": "${HOME}/DOT-V0.1,${HOME}/.claude,${HOME}/projects"
      },
      "description": "Serena 대체 - 파일 시스템 접근 및 프로젝트 메모리"
    },
    "github": {
      "command": "node",
      "args": ["${HOME}/.config/mcp-servers/mcp-servers-official/src/github/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "description": "GitHub 작업 - PR, Issues, Commits"
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@llmindset/mcp-server-sequential-thinking"],
      "description": "Sequential - 복잡한 분석 및 체계적 문제 해결"
    },
    "playwright": {
      "command": "node",
      "args": ["${HOME}/.config/mcp-servers/playwright-mcp/dist/index.js"],
      "env": {
        "BROWSER": "chromium"
      },
      "description": "Playwright - 브라우저 자동화 및 E2E 테스트"
    },
    "vercel": {
      "command": "node",
      "args": ["${HOME}/.config/mcp-servers/mcp-servers-official/src/vercel/dist/index.js"],
      "env": {
        "VERCEL_TOKEN": "${VERCEL_TOKEN}"
      },
      "description": "Context7 대체 - Vercel 문서 및 배포"
    },
    "ide": {
      "command": "node",
      "args": ["${HOME}/.config/mcp-servers/vscode-mcp/dist/index.js"],
      "description": "Magic/Morphllm 대체 - IDE 통합 코드 편집"
    }
  }
}
EOF

echo -e "${GREEN}✓ MCP 설정 파일 생성 완료${NC}"

echo ""
echo "================================================"
echo -e "${GREEN}✅ SuperClaude MCP 6개 서버 설치 완료!${NC}"
echo "================================================"
echo ""
echo "📌 설치된 MCP 서버 목록:"
echo "   1. Filesystem MCP (Serena 대체) - 파일 시스템 및 프로젝트 메모리"
echo "   2. GitHub MCP - GitHub 작업 자동화"
echo "   3. Sequential-thinking MCP - 복잡한 분석"
echo "   4. Playwright MCP - 브라우저 자동화 테스트"
echo "   5. Vercel MCP (Context7 대체) - 문서 및 배포"
echo "   6. IDE MCP (Magic/Morphllm 대체) - 코드 편집"
echo ""
echo "📁 설정 파일 위치:"
echo "   $HOME/DOT-V0.1/mcp-config-complete.json"
echo ""
echo "⚙️  환경 변수 설정 필요:"
echo "   export GITHUB_TOKEN=your_github_token"
echo "   export VERCEL_TOKEN=your_vercel_token"
echo ""
echo "🔧 Claude Desktop에 적용하려면:"
echo "   1. Claude Desktop 앱 종료"
echo "   2. cp $HOME/DOT-V0.1/mcp-config-complete.json ~/.config/claude/claude_desktop_config.json"
echo "   3. Claude Desktop 앱 재시작"
echo ""
echo "💡 각 MCP의 SuperClaude 문서 매핑:"
echo "   • Serena → Filesystem MCP"
echo "   • Context7 → Vercel MCP"
echo "   • Magic/Morphllm → IDE MCP"
echo "   • Sequential → Sequential-thinking MCP"
echo "   • Playwright → Playwright MCP"
echo "   • GitHub → GitHub MCP"