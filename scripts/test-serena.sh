#!/bin/bash

# Serena MCP 테스트 스크립트
echo "🔍 Serena MCP 서버 테스트 시작..."
echo "================================="

# 1. Serena 설치 확인
echo "1. Serena 설치 확인..."
if uv tool run --from git+https://github.com/oraios/serena serena --help >/dev/null 2>&1; then
    echo "   ✅ Serena 설치 확인"
else
    echo "   ❌ Serena 설치 실패"
    exit 1
fi

# 2. 프로젝트 인덱스 확인
echo ""
echo "2. 프로젝트 인덱스 확인..."
if [ -d "/home/ec2-user/DOT-V0.1/.serena/cache" ]; then
    echo "   ✅ 프로젝트 인덱스 존재"
    echo "   📁 캐시 파일:"
    ls -la /home/ec2-user/DOT-V0.1/.serena/cache/typescript/ 2>/dev/null | head -5
else
    echo "   ⚠️ 프로젝트 인덱스 없음 - 인덱싱 필요"
fi

# 3. Claude Desktop 구성 확인
echo ""
echo "3. Claude Desktop MCP 구성 확인..."
CONFIG_FILE="/home/ec2-user/.config/claude/claude_desktop_config.json"
if [ -f "$CONFIG_FILE" ]; then
    if grep -q '"serena"' "$CONFIG_FILE"; then
        echo "   ✅ Serena MCP 구성 완료"
    else
        echo "   ❌ Serena MCP 구성 없음"
    fi
else
    echo "   ❌ Claude Desktop 구성 파일 없음"
fi

# 4. 기타 MCP 서버 확인
echo ""
echo "4. 추가 MCP 서버 구성 확인..."
SERVERS=("filesystem" "github" "sequential-thinking" "tavily" "magic" "morphllm" "playwright" "vercel")
for server in "${SERVERS[@]}"; do
    if grep -q "\"$server\"" "$CONFIG_FILE" 2>/dev/null; then
        echo "   ✅ $server"
    else
        echo "   ❌ $server"
    fi
done

# 5. 프로젝트 정보 표시
echo ""
echo "5. 프로젝트 정보..."
echo "   📂 프로젝트 경로: /home/ec2-user/DOT-V0.1"
echo "   🏷️ 프로젝트 이름: DOT-V0.1"
echo "   📝 컨텍스트: ide-assistant"

echo ""
echo "================================="
echo "✨ Serena MCP 테스트 완료!"
echo ""
echo "💡 사용 팁:"
echo "   - Claude Desktop를 재시작하여 변경사항 적용"
echo "   - 'Activate the project DOT-V0.1' 명령으로 프로젝트 활성화"
echo "   - Serena 대시보드: http://localhost:24282/dashboard/"