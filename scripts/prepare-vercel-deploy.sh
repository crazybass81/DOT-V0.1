#!/bin/bash

# Vercel 배포 준비 스크립트
echo "🚀 Vercel 배포 준비를 시작합니다..."

# 1. 프론트엔드 빌드 확인
echo "📦 프론트엔드 빌드 테스트 중..."
cd frontend
npm install --legacy-peer-deps
npm run build
if [ $? -ne 0 ]; then
    echo "❌ 프론트엔드 빌드 실패"
    exit 1
fi
echo "✅ 프론트엔드 빌드 성공"

# 2. 백엔드 의존성 확인
echo "📦 백엔드 의존성 확인 중..."
cd ../backend
npm install --legacy-peer-deps
echo "✅ 백엔드 의존성 설치 완료"

# 3. 환경 변수 확인
cd ..
echo "🔐 환경 변수 확인 중..."
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local 파일이 없습니다. 생성 중..."
    cat > .env.local << 'EOF'
# Vercel 배포용 로컬 환경 변수
DATABASE_URL=postgresql://user:pass@localhost:5432/dot_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
EOF
    echo "✅ .env.local 파일 생성 완료"
fi

# 4. Vercel 설정 확인
echo "⚙️  Vercel 설정 확인 중..."
if [ ! -f "vercel.json" ]; then
    echo "❌ vercel.json 파일이 없습니다"
    exit 1
fi
echo "✅ Vercel 설정 파일 확인 완료"

# 5. API 테스트
echo "🧪 API 엔드포인트 구조 확인 중..."
if [ -d "api" ]; then
    echo "✅ API 디렉토리 확인 완료"
else
    echo "❌ API 디렉토리가 없습니다"
    exit 1
fi

echo ""
echo "✅ Vercel 배포 준비 완료!"
echo ""
echo "다음 명령어로 배포를 시작하세요:"
echo "  vercel --prod"
echo ""
echo "또는 개발 모드로 테스트:"
echo "  vercel dev"
echo ""
echo "⚠️  주의사항:"
echo "  1. Vercel 계정에 로그인이 필요합니다"
echo "  2. 환경 변수를 Vercel 대시보드에서 설정해야 합니다"
echo "  3. 데이터베이스는 외부 서비스(Supabase, Neon 등) 사용 권장"