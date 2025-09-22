# MCP (Model Context Protocol) 설치 가이드

## ✅ 설치 완료 상태

### 성공적으로 설치된 MCP 서버
1. **Filesystem MCP** ✓ - 파일 시스템 접근 및 프로젝트 관리
2. **Sequential-thinking MCP** ✓ - 복잡한 분석 및 체계적 문제 해결
3. **Memory MCP** ✓ - 세션 메모리 및 프로젝트 컨텍스트 유지
4. **Playwright MCP** ✓ - 브라우저 자동화 및 E2E 테스트
5. **Tavily MCP** ✓ - 웹 검색 및 크롤링 (npm 전역 패키지)

## 📁 설치 위치

```
~/.config/mcp-servers/
├── mcp-servers-official/       # 공식 MCP 서버들
│   └── src/
│       ├── filesystem/         # ✓ 파일 시스템 접근
│       ├── sequentialthinking/ # ✓ 분석 도구
│       ├── memory/            # ✓ 메모리 관리
│       ├── fetch/             # 웹 페이지 가져오기
│       ├── git/               # Git 작업
│       ├── time/              # 시간 관리
│       └── everything/        # 모든 기능 통합
├── mcp-servers-vercel/        # ✓ Vercel 관련 서버들
└── playwright-mcp/            # ✓ Playwright 브라우저 테스트
```

## ⚙️ 설정 파일

### 메인 설정
- **위치**: `/home/ec2-user/DOT-V0.1/mcp-config.json`
- **백업**: `/home/ec2-user/DOT-V0.1/mcp-config-backup.json`

### Claude Desktop 적용
```bash
# 1. 설정 파일 복사
cp /home/ec2-user/DOT-V0.1/mcp-config.json ~/.config/claude/claude_desktop_config.json

# 2. Claude Desktop 재시작
```

## 🔑 환경 변수 설정

```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
export GITHUB_TOKEN="your_github_token"      # GitHub API 액세스
export VERCEL_TOKEN="your_vercel_token"      # Vercel 배포
export TAVILY_API_KEY="your_tavily_api_key"  # 웹 검색
```

## 🚀 사용 방법

### Claude Desktop에서 MCP 사용
1. Claude Desktop 앱을 재시작합니다
2. 대화 중 MCP 기능이 자동으로 활성화됩니다
3. 파일 작업, 웹 검색, 브라우저 테스트 등이 가능합니다

### SuperClaude 매핑
- **Serena** → Filesystem MCP + Memory MCP
- **Sequential** → Sequential-thinking MCP
- **Playwright** → Playwright MCP
- **Context7** → Tavily MCP (부분적)
- **Magic/Morphllm** → 추후 설치 가능

## 🔧 문제 해결

### Node.js 버전 경고
- 현재 Node.js v18 사용 중
- 일부 패키지는 v20+ 권장하지만 작동에는 문제 없음

### 서버 테스트
```bash
# Filesystem 서버 확인
ls -la ~/.config/mcp-servers/mcp-servers-official/src/filesystem/dist/

# Playwright 서버 확인
ls -la ~/.config/mcp-servers/playwright-mcp/dist/
```

## 📝 참고 사항

- MCP는 Claude의 기능을 확장하는 프로토콜입니다
- 각 서버는 독립적으로 작동하며 필요에 따라 활성화됩니다
- API 키가 필요한 서버는 환경 변수 설정이 필수입니다

## 🔄 업데이트

```bash
# 저장소 업데이트
cd ~/.config/mcp-servers/mcp-servers-official
git pull && npm install && npm run build

# 전역 패키지 업데이트
npm update -g tavily-mcp
```