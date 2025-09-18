#!/bin/bash

# DOT Platform V0.1 - 보안 감사 스크립트
# 실행: ./scripts/security-audit.sh
# 목적: 보안 취약점 스캔 및 리포트 생성

set -e

echo "================================================"
echo "DOT Platform 보안 감사 시작"
echo "시간: $(date)"
echo "================================================"

# 결과 디렉토리 생성
AUDIT_DIR="security-audit-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$AUDIT_DIR"

# 색상 코드
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 심각도 카운터
CRITICAL=0
HIGH=0
MEDIUM=0
LOW=0

# 보고서 파일
REPORT="$AUDIT_DIR/security-report.md"

# 보고서 헤더
cat > "$REPORT" << EOF
# DOT Platform 보안 감사 리포트

**날짜**: $(date)
**프로젝트**: DOT Platform V0.1

## 요약

EOF

echo -e "\n${GREEN}[1/8] 의존성 취약점 검사${NC}"
echo "### 1. 의존성 취약점" >> "$REPORT"

# npm audit (backend)
echo "백엔드 의존성 검사 중..."
cd backend
if npm audit --json > "../$AUDIT_DIR/npm-audit-backend.json" 2>/dev/null; then
    echo "✓ 백엔드 의존성 문제 없음" | tee -a "../$REPORT"
else
    echo -e "${YELLOW}⚠ 백엔드 의존성 취약점 발견${NC}"
    npm audit >> "../$REPORT" 2>&1 || true

    # 자동 수정 시도
    echo "자동 수정 시도 중..."
    npm audit fix --force > "../$AUDIT_DIR/npm-fix-backend.log" 2>&1 || true
fi
cd ..

# npm audit (frontend)
echo "프론트엔드 의존성 검사 중..."
cd frontend
if npm audit --json > "../$AUDIT_DIR/npm-audit-frontend.json" 2>/dev/null; then
    echo "✓ 프론트엔드 의존성 문제 없음" | tee -a "../$REPORT"
else
    echo -e "${YELLOW}⚠ 프론트엔드 의존성 취약점 발견${NC}"
    npm audit >> "../$REPORT" 2>&1 || true

    # 자동 수정 시도
    echo "자동 수정 시도 중..."
    npm audit fix --force > "../$AUDIT_DIR/npm-fix-frontend.log" 2>&1 || true
fi
cd ..

echo -e "\n${GREEN}[2/8] 환경 변수 노출 검사${NC}"
echo -e "\n### 2. 환경 변수 보안" >> "$REPORT"

# .env 파일 검사
if find . -name ".env*" -not -path "*/node_modules/*" | grep -q .; then
    echo -e "${YELLOW}⚠ .env 파일 발견${NC}"
    echo "⚠ 다음 .env 파일들이 발견되었습니다:" >> "$REPORT"
    find . -name ".env*" -not -path "*/node_modules/*" >> "$REPORT"

    # .gitignore 확인
    if ! grep -q "^\.env" .gitignore 2>/dev/null; then
        echo -e "${RED}✗ CRITICAL: .env가 .gitignore에 없습니다!${NC}"
        echo "**CRITICAL**: .env 파일이 버전 관리에 포함될 수 있습니다!" >> "$REPORT"
        ((CRITICAL++))
    fi
else
    echo "✓ .env 파일 없음" | tee -a "$REPORT"
fi

echo -e "\n${GREEN}[3/8] 하드코딩된 시크릿 검사${NC}"
echo -e "\n### 3. 하드코딩된 시크릿" >> "$REPORT"

# 패턴 기반 시크릿 검색
echo "하드코딩된 시크릿 검색 중..."
PATTERNS=(
    "password.*=.*['\"].*['\"]"
    "api[_-]?key.*=.*['\"].*['\"]"
    "secret.*=.*['\"].*['\"]"
    "token.*=.*['\"].*['\"]"
    "AWS.*=.*['\"].*['\"]"
    "private[_-]?key"
)

SECRET_FOUND=false
for pattern in "${PATTERNS[@]}"; do
    if grep -r -i "$pattern" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" \
           --exclude-dir=node_modules --exclude-dir=build --exclude-dir=dist . 2>/dev/null | \
           grep -v "process.env" | grep -v "example" | grep -v "test"; then
        echo -e "${RED}✗ 하드코딩된 시크릿 패턴 발견: $pattern${NC}"
        echo "⚠ 패턴 '$pattern' 매칭:" >> "$REPORT"
        grep -r -i "$pattern" --include="*.js" --include="*.jsx" \
             --exclude-dir=node_modules --exclude-dir=build . 2>/dev/null | \
             grep -v "process.env" | head -5 >> "$REPORT"
        SECRET_FOUND=true
        ((HIGH++))
    fi
done

if [ "$SECRET_FOUND" = false ]; then
    echo "✓ 하드코딩된 시크릿 없음" | tee -a "$REPORT"
fi

echo -e "\n${GREEN}[4/8] SQL 인젝션 취약점 검사${NC}"
echo -e "\n### 4. SQL 인젝션 취약점" >> "$REPORT"

# SQL 쿼리 패턴 검사
echo "SQL 인젝션 위험 패턴 검색 중..."
if grep -r "query.*\+.*\['\"\]" --include="*.js" --exclude-dir=node_modules backend/ 2>/dev/null; then
    echo -e "${RED}✗ SQL 인젝션 위험 패턴 발견${NC}"
    echo "⚠ 동적 SQL 쿼리 발견:" >> "$REPORT"
    grep -r "query.*\+.*\['\"\]" --include="*.js" --exclude-dir=node_modules backend/ | head -5 >> "$REPORT"
    ((HIGH++))
else
    echo "✓ SQL 인젝션 위험 패턴 없음" | tee -a "$REPORT"
fi

# Prepared statements 사용 확인
if grep -r "\$[0-9]" --include="*.js" backend/src/lib/ 2>/dev/null | grep -q "query"; then
    echo "✓ Prepared statements 사용 확인" | tee -a "$REPORT"
else
    echo -e "${YELLOW}⚠ Prepared statements 사용 권장${NC}"
    echo "권장: 모든 SQL 쿼리에 prepared statements 사용" >> "$REPORT"
    ((MEDIUM++))
fi

echo -e "\n${GREEN}[5/8] XSS 취약점 검사${NC}"
echo -e "\n### 5. XSS 취약점" >> "$REPORT"

# dangerouslySetInnerHTML 사용 검사
echo "XSS 위험 패턴 검색 중..."
if grep -r "dangerouslySetInnerHTML" --include="*.js" --include="*.jsx" frontend/ 2>/dev/null; then
    echo -e "${YELLOW}⚠ dangerouslySetInnerHTML 사용 발견${NC}"
    echo "⚠ dangerouslySetInnerHTML 사용:" >> "$REPORT"
    grep -r "dangerouslySetInnerHTML" --include="*.jsx" frontend/ | head -5 >> "$REPORT"
    ((MEDIUM++))
else
    echo "✓ dangerouslySetInnerHTML 사용 없음" | tee -a "$REPORT"
fi

# eval() 사용 검사
if grep -r "eval(" --include="*.js" --include="*.jsx" --exclude-dir=node_modules . 2>/dev/null; then
    echo -e "${RED}✗ eval() 사용 발견${NC}"
    echo "**위험**: eval() 사용 발견:" >> "$REPORT"
    grep -r "eval(" --include="*.js" --exclude-dir=node_modules . | head -5 >> "$REPORT"
    ((HIGH++))
else
    echo "✓ eval() 사용 없음" | tee -a "$REPORT"
fi

echo -e "\n${GREEN}[6/8] 인증/인가 검사${NC}"
echo -e "\n### 6. 인증/인가" >> "$REPORT"

# JWT 설정 검사
echo "JWT 보안 설정 검사 중..."
if grep -r "jsonwebtoken" backend/package.json 2>/dev/null; then
    # JWT 시크릿 길이 확인
    if grep -r "JWT_SECRET" backend/ 2>/dev/null | grep -q "length.*<.*32"; then
        echo -e "${YELLOW}⚠ JWT 시크릿 길이 부족 가능성${NC}"
        echo "권장: JWT 시크릿은 최소 32자 이상" >> "$REPORT"
        ((MEDIUM++))
    else
        echo "✓ JWT 설정 확인" | tee -a "$REPORT"
    fi
fi

# bcrypt rounds 확인
if grep -r "bcrypt" backend/ 2>/dev/null | grep -q "rounds.*10"; then
    echo "✓ bcrypt rounds 적절 (10+)" | tee -a "$REPORT"
else
    echo -e "${YELLOW}⚠ bcrypt rounds 확인 필요${NC}"
    echo "권장: bcrypt rounds는 10 이상 사용" >> "$REPORT"
    ((LOW++))
fi

echo -e "\n${GREEN}[7/8] HTTPS/보안 헤더 검사${NC}"
echo -e "\n### 7. 보안 헤더" >> "$REPORT"

# Helmet.js 사용 확인
if grep -r "helmet" backend/package.json 2>/dev/null; then
    echo "✓ Helmet.js 사용 확인" | tee -a "$REPORT"
else
    echo -e "${YELLOW}⚠ Helmet.js 미사용${NC}"
    echo "권장: Express에 Helmet.js 미들웨어 추가" >> "$REPORT"
    ((MEDIUM++))
fi

# CORS 설정 확인
if grep -r "cors" backend/ 2>/dev/null | grep -q "origin.*\*"; then
    echo -e "${YELLOW}⚠ CORS 와일드카드 사용${NC}"
    echo "경고: CORS origin에 와일드카드(*) 사용 중" >> "$REPORT"
    ((MEDIUM++))
else
    echo "✓ CORS 설정 확인" | tee -a "$REPORT"
fi

echo -e "\n${GREEN}[8/8] 파일 업로드 보안${NC}"
echo -e "\n### 8. 파일 업로드" >> "$REPORT"

# 파일 크기 제한 확인
if grep -r "multer" backend/ 2>/dev/null | grep -q "limits"; then
    echo "✓ 파일 크기 제한 설정" | tee -a "$REPORT"
else
    echo -e "${YELLOW}⚠ 파일 크기 제한 미설정${NC}"
    echo "권장: multer에 파일 크기 제한 설정" >> "$REPORT"
    ((MEDIUM++))
fi

# 파일 타입 검증 확인
if grep -r "fileFilter" backend/ 2>/dev/null; then
    echo "✓ 파일 타입 필터링 설정" | tee -a "$REPORT"
else
    echo -e "${YELLOW}⚠ 파일 타입 필터링 미설정${NC}"
    echo "권장: 허용된 파일 타입만 업로드 가능하도록 설정" >> "$REPORT"
    ((MEDIUM++))
fi

echo -e "\n================================================"
echo "보안 감사 완료"
echo "================================================"

# 최종 요약
cat >> "$REPORT" << EOF

## 최종 요약

- **Critical 이슈**: $CRITICAL
- **High 이슈**: $HIGH
- **Medium 이슈**: $MEDIUM
- **Low 이슈**: $LOW

### 권장 조치사항

1. **즉시 조치 필요 (Critical/High)**
   - 하드코딩된 시크릿 제거
   - SQL 인젝션 취약점 수정
   - eval() 사용 제거

2. **단기 조치 권장 (Medium)**
   - Helmet.js 설정
   - CORS 정책 강화
   - 파일 업로드 보안 강화
   - XSS 방지 조치

3. **장기 개선 사항 (Low)**
   - bcrypt rounds 최적화
   - 보안 헤더 추가 설정
   - 정기적인 의존성 업데이트

### 추가 권장사항

- 정기적인 보안 감사 실행 (주 1회)
- 의존성 자동 업데이트 설정
- 보안 테스트 자동화
- 침투 테스트 실시

---
*Generated by DOT Platform Security Audit Script*
EOF

# 결과 출력
echo -e "\n${GREEN}✓ 보안 감사 리포트 생성 완료${NC}"
echo "리포트 위치: $AUDIT_DIR/security-report.md"

# 심각도에 따른 종료 코드
if [ $CRITICAL -gt 0 ]; then
    echo -e "${RED}✗ CRITICAL 이슈 발견! 즉시 조치 필요${NC}"
    exit 2
elif [ $HIGH -gt 0 ]; then
    echo -e "${YELLOW}⚠ HIGH 이슈 발견. 조치 권장${NC}"
    exit 1
else
    echo -e "${GREEN}✓ 심각한 보안 이슈 없음${NC}"
    exit 0
fi