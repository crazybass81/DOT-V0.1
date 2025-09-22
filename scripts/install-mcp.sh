#!/bin/bash
# MCP 서버 설치 스크립트 (수정된 버전)

echo "🚀 MCP 서버 설치 시작..."
echo "================================================"

# MCP 서버 설치 디렉토리 생성
MCP_DIR="$HOME/.config/mcp-servers"
mkdir -p "$MCP_DIR"
cd "$MCP_DIR"

# 색상 코드
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${YELLOW}📦 1. Filesystem MCP - 파일 시스템 접근${NC}"
echo "------------------------------------------------"
if [ ! -d "mcp-servers-official" ]; then
  git clone https://github.com/modelcontextprotocol/servers.git mcp-servers-official
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ GitHub 저장소 클론 실패${NC}"
    exit 1
  fi
fi

# Filesystem 서버 설치
if [ -d "mcp-servers-official/src/filesystem" ]; then
  cd mcp-servers-official/src/filesystem
  npm install
  npm run build
  echo -e "${GREEN}✓ Filesystem MCP 설치 완료${NC}"
else
  echo -e "${RED}❌ Filesystem 디렉토리를 찾을 수 없습니다${NC}"
fi
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 2. GitHub MCP - GitHub 작업${NC}"
echo "------------------------------------------------"
if [ -d "mcp-servers-official/src/github" ]; then
  cd mcp-servers-official/src/github
  npm install
  npm run build
  echo -e "${GREEN}✓ GitHub MCP 설치 완료${NC}"
else
  echo -e "${RED}❌ GitHub 디렉토리를 찾을 수 없습니다${NC}"
fi
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 3. Tavily MCP - 웹 검색 및 크롤링${NC}"
echo "------------------------------------------------"
if [ -d "mcp-servers-official/src/tavily" ]; then
  cd mcp-servers-official/src/tavily
  npm install
  npm run build
  echo -e "${GREEN}✓ Tavily MCP 설치 완료${NC}"
else
  echo -e "${RED}❌ Tavily 디렉토리를 찾을 수 없습니다${NC}"
fi
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 4. Sequential-thinking MCP - 복잡한 분석${NC}"
echo "------------------------------------------------"
# 대체 패키지 설치 시도
npm install -g @modelcontextprotocol/server-sequential-thinking 2>/dev/null || {
  echo -e "${YELLOW}⚠️  Sequential-thinking 패키지를 찾을 수 없습니다. 건너뜁니다.${NC}"
}
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Sequential-thinking MCP 설치 완료${NC}"
fi

echo ""
echo -e "${YELLOW}📦 5. Playwright MCP - 브라우저 자동화 테스트${NC}"
echo "------------------------------------------------"
if [ ! -d "playwright-mcp" ]; then
  git clone https://github.com/executeautomation/mcp-playwright.git playwright-mcp 2>/dev/null
  if [ $? -eq 0 ] && [ -d "playwright-mcp" ]; then
    cd playwright-mcp
    npm install
    npm run build
    npx playwright install chromium
    echo -e "${GREEN}✓ Playwright MCP 설치 완료${NC}"
  else
    echo -e "${YELLOW}⚠️  Playwright MCP 저장소를 찾을 수 없습니다.${NC}"
  fi
else
  cd playwright-mcp
  npm install
  npm run build
  echo -e "${GREEN}✓ Playwright MCP 업데이트 완료${NC}"
fi
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 6. Magic MCP - UI 컴포넌트 생성${NC}"
echo "------------------------------------------------"
# Magic 서버 대체 설치
if [ ! -d "magic-mcp" ]; then
  git clone https://github.com/modelcontextprotocol/magic.git magic-mcp 2>/dev/null
  if [ $? -eq 0 ] && [ -d "magic-mcp" ]; then
    cd magic-mcp
    npm install
    npm run build
    echo -e "${GREEN}✓ Magic MCP 설치 완료${NC}"
  else
    echo -e "${YELLOW}⚠️  Magic MCP를 건너뜁니다.${NC}"
  fi
fi
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 7. MorphLLM MCP - 코드 편집${NC}"
echo "------------------------------------------------"
if [ ! -d "morphllm-mcp" ]; then
  git clone https://github.com/modelcontextprotocol/morphllm.git morphllm-mcp 2>/dev/null
  if [ $? -eq 0 ] && [ -d "morphllm-mcp" ]; then
    cd morphllm-mcp
    npm install
    npm run build
    echo -e "${GREEN}✓ MorphLLM MCP 설치 완료${NC}"
  else
    echo -e "${YELLOW}⚠️  MorphLLM MCP를 건너뜁니다.${NC}"
  fi
fi
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 8. Vercel MCP - 배포 및 문서${NC}"
echo "------------------------------------------------"
if [ -d "mcp-servers-official/src/vercel" ]; then
  cd mcp-servers-official/src/vercel
  npm install
  npm run build
  echo -e "${GREEN}✓ Vercel MCP 설치 완료${NC}"
else
  echo -e "${RED}❌ Vercel 디렉토리를 찾을 수 없습니다${NC}"
fi
cd "$MCP_DIR"

echo ""
echo -e "${YELLOW}📦 9. IDE MCP - VS Code 통합${NC}"
echo "------------------------------------------------"
if [ -d "mcp-servers-official/src/vscode" ]; then
  cd mcp-servers-official/src/vscode
  npm install
  npm run build
  echo -e "${GREEN}✓ IDE MCP 설치 완료${NC}"
else
  echo -e "${YELLOW}⚠️  IDE MCP 디렉토리를 찾을 수 없습니다${NC}"
fi
cd "$MCP_DIR"

echo ""
echo "================================================"
echo -e "${YELLOW}📝 MCP 설정 파일 생성...${NC}"
echo "================================================"

# MCP 설정 파일 생성 (현재 이용 가능한 서버만 포함)
cat > "$HOME/DOT-V0.1/mcp-config.json" << 'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["${MCP_DIR}/mcp-servers-official/dist/filesystem/index.js"],
      "env": {
        "ALLOWED_DIRECTORIES": "${HOME}/DOT-V0.1,${HOME}/.claude,${HOME}/projects"
      },
      "description": "파일 시스템 접근 및 프로젝트 메모리"
    },
    "github": {
      "command": "node",
      "args": ["${MCP_DIR}/mcp-servers-official/dist/github/index.js"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "description": "GitHub 작업 - PR, Issues, Commits"
    },
    "tavily": {
      "command": "node",
      "args": ["${MCP_DIR}/mcp-servers-official/dist/tavily/index.js"],
      "env": {
        "TAVILY_API_KEY": "${TAVILY_API_KEY}"
      },
      "description": "웹 검색 및 크롤링"
    },
    "sequential-thinking": {
      "command": "node",
      "args": ["${MCP_DIR}/mcp-servers-official/dist/sequential-thinking/index.js"],
      "description": "복잡한 분석 및 체계적 문제 해결"
    },
    "vercel": {
      "command": "node",
      "args": ["${MCP_DIR}/mcp-servers-official/dist/vercel/index.js"],
      "env": {
        "VERCEL_TOKEN": "${VERCEL_TOKEN}"
      },
      "description": "Vercel 배포 및 문서"
    },
    "ide": {
      "command": "node",
      "args": ["${MCP_DIR}/mcp-servers-official/dist/vscode/index.js"],
      "description": "VS Code IDE 통합"
    }
  }
}
EOF

# 실제 경로로 변수 치환
MCP_DIR_ESCAPED=$(echo "$MCP_DIR" | sed 's/\//\\\//g')
HOME_ESCAPED=$(echo "$HOME" | sed 's/\//\\\//g')
sed -i "s/\${MCP_DIR}/$MCP_DIR_ESCAPED/g" "$HOME/DOT-V0.1/mcp-config.json"
sed -i "s/\${HOME}/$HOME_ESCAPED/g" "$HOME/DOT-V0.1/mcp-config.json"

echo -e "${GREEN}✓ MCP 설정 파일 생성 완료${NC}"

echo ""
echo "================================================"
echo -e "${GREEN}✅ MCP 서버 설치 완료!${NC}"
echo "================================================"
echo ""
echo "📌 설치된 MCP 서버:"
ls -la "$MCP_DIR" | grep "^d" | awk '{print "   • " $NF}'
echo ""
echo "📁 설정 파일 위치:"
echo "   $HOME/DOT-V0.1/mcp-config.json"
echo ""
echo "⚙️  환경 변수 설정 필요:"
echo "   export GITHUB_TOKEN=your_github_token"
echo "   export VERCEL_TOKEN=your_vercel_token"
echo "   export TAVILY_API_KEY=your_tavily_api_key"
echo ""
echo "🔧 Claude Desktop에 적용하려면:"
echo "   1. Claude Desktop 앱 종료"
echo "   2. cp $HOME/DOT-V0.1/mcp-config.json ~/.config/claude/claude_desktop_config.json"
echo "   3. 필요한 환경 변수를 ~/.bashrc 또는 ~/.zshrc에 추가"
echo "   4. Claude Desktop 앱 재시작"
echo ""
echo "💡 MCP 서버 테스트:"
echo "   node $MCP_DIR/mcp-servers-official/dist/filesystem/index.js --version"