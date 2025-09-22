#!/bin/bash

# 세레나 대시보드 수동 실행 스크립트
echo "🚀 세레나 대시보드를 시작합니다..."
echo "================================="

# 이미 실행 중인지 확인
if pgrep -f "serena start-mcp-server" > /dev/null; then
    echo "⚠️  세레나가 이미 실행 중입니다."
    echo "대시보드 URL: http://localhost:24282/dashboard/"
else
    echo "📊 세레나 MCP 서버를 대시보드와 함께 시작합니다..."

    # 백그라운드로 세레나 실행
    nohup uv tool run --from git+https://github.com/oraios/serena \
        serena start-mcp-server \
        --context ide-assistant \
        --project /home/ec2-user/DOT-V0.1 \
        --enable-web-dashboard true \
        --transport sse \
        --port 8000 \
        > /tmp/serena.log 2>&1 &

    echo "✅ 세레나가 시작되었습니다."
    echo ""
    echo "📌 접속 정보:"
    echo "   - 대시보드: http://localhost:24282/dashboard/"
    echo "   - API 서버: http://localhost:8000"
    echo "   - 로그 파일: /tmp/serena.log"
    echo ""
    echo "💡 종료하려면: pkill -f 'serena start-mcp-server'"
fi