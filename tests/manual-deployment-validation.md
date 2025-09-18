# DOT Platform 배포 검증 매뉴얼 테스트 가이드

## 개요
이 문서는 DOT Platform V0.1의 배포 검증 시스템을 수동으로 테스트하기 위한 체크리스트와 절차를 제공합니다.

## 테스트 환경 요구사항

### 시스템 요구사항
- [ ] Linux 환경 (Ubuntu 18.04+ 또는 Amazon Linux 2)
- [ ] Docker 및 Docker Compose 설치됨
- [ ] curl, jq, git 도구 설치됨
- [ ] 최소 4GB RAM, 10GB 디스크 공간

### 네트워크 요구사항
- [ ] 인터넷 연결 (GitHub Container Registry 접근)
- [ ] 포트 3000, 5432, 6379, 80 사용 가능
- [ ] localhost 및 127.0.0.1 접근 가능

## Phase 1: 기본 배포 검증

### 1.1 스크립트 실행 권한 확인
```bash
# 체크리스트
- [ ] chmod +x scripts/*.sh 실행
- [ ] 모든 스크립트 파일이 실행 가능한지 확인
- [ ] 스크립트 파일 구문 오류 없음 확인

# 실행 명령어
find scripts/ -name "*.sh" -exec chmod +x {} \;
find scripts/ -name "*.sh" -exec bash -n {} \;
```

### 1.2 Docker 환경 확인
```bash
# 체크리스트
- [ ] Docker 서비스 실행 중
- [ ] Docker Compose 버전 1.25+
- [ ] 현재 사용자가 docker 그룹에 속함

# 확인 명령어
docker --version
docker-compose --version
docker ps
```

### 1.3 기본 배포 스크립트 테스트
```bash
# 체크리스트
- [ ] scripts/deploy.sh가 오류 없이 실행됨
- [ ] 모든 컨테이너가 정상 시작됨
- [ ] 헬스체크가 통과됨

# 실행 명령어
./scripts/deploy.sh
docker-compose ps
```

## Phase 2: 검증 스크립트 테스트

### 2.1 시스템 검증 스크립트
```bash
# 체크리스트
- [ ] scripts/validate-system.sh 실행 성공
- [ ] 모든 시스템 요구사항 검증 통과
- [ ] 로그 파일 정상 생성

# 실행 명령어
./scripts/validate-system.sh
cat logs/validation/system-*.log
```

### 2.2 배포 검증 스크립트
```bash
# 체크리스트
- [ ] scripts/validate-deployment.sh 실행 성공
- [ ] 모든 서비스 상태 검증 통과
- [ ] API 엔드포인트 응답 정상

# 실행 명령어
./scripts/validate-deployment.sh
tail -f logs/validation/deployment-*.log
```

### 2.3 한국어 요구사항 검증
```bash
# 체크리스트
- [ ] scripts/validate-korean-requirements.sh 실행 성공
- [ ] 응답 시간 < 3초 확인
- [ ] UTF-8 인코딩 지원 확인
- [ ] 10명 동시 사용자 지원 확인

# 실행 명령어
./scripts/validate-korean-requirements.sh
grep "응답시간" logs/validation/korean-requirements-*.log
```

## Phase 3: 성능 벤치마크 테스트

### 3.1 K6 설치 및 환경 설정
```bash
# 체크리스트
- [ ] K6 자동 설치 성공
- [ ] 벤치마크 디렉토리 생성됨
- [ ] 테스트 스크립트 생성됨

# 실행 명령어
./scripts/benchmark-performance.sh setup
k6 version
ls -la benchmarks/
```

### 3.2 한국어 요구사항 벤치마크
```bash
# 체크리스트
- [ ] 한국어 요구사항 테스트 실행 성공
- [ ] 10명 동시 사용자 시나리오 완료
- [ ] 95퍼센타일 응답 시간 < 3초
- [ ] 오류율 < 5%

# 실행 명령어
./scripts/benchmark-performance.sh korean-requirements
cat benchmarks/results/*/korean-requirements-*.json | jq '.metrics'
```

### 3.3 로드 테스트
```bash
# 체크리스트
- [ ] 로드 테스트 실행 성공
- [ ] 모든 임계값 기준 통과
- [ ] 결과 리포트 생성됨

# 실행 명령어
./scripts/benchmark-performance.sh load-test --duration 300
ls -la benchmarks/results/*/
```

## Phase 4: 리포팅 시스템 테스트

### 4.1 검증 결과 리포트 생성
```bash
# 체크리스트
- [ ] scripts/generate-report.sh 실행 성공
- [ ] HTML 리포트 생성됨
- [ ] JSON 리포트 생성됨
- [ ] 모든 섹션 데이터 포함됨

# 실행 명령어
./scripts/generate-report.sh --format all
ls -la reports/
python3 -m http.server 8000 -d reports/
# 브라우저에서 http://localhost:8000 접속하여 HTML 리포트 확인
```

### 4.2 알림 시스템 테스트
```bash
# 체크리스트
- [ ] 강제 알림 생성 테스트
- [ ] 알림 로그 파일 생성 확인
- [ ] 알림 형식 및 내용 검증

# 실행 명령어
./scripts/validate-deployment.sh --force-alert
ls -la logs/alerts/
cat logs/alerts/alert-*.json | jq .
```

## Phase 5: 통합 시나리오 테스트

### 5.1 전체 배포-검증 파이프라인
```bash
# 체크리스트
- [ ] 전체 파이프라인 순차 실행
- [ ] 각 단계별 성공 확인
- [ ] 종료 코드 0 반환 확인

# 실행 명령어 (순서대로)
./scripts/deploy.sh
./scripts/validate-system.sh
./scripts/validate-deployment.sh
./scripts/validate-korean-requirements.sh
./scripts/benchmark-performance.sh korean-requirements
./scripts/generate-report.sh --format html
```

### 5.2 실패 시나리오 테스트
```bash
# 체크리스트
- [ ] 서비스 중단 시 알림 발생 확인
- [ ] 성능 기준 위반 시 경고 확인
- [ ] 적절한 오류 메시지 출력 확인

# 실행 명령어
docker-compose stop dot-backend
./scripts/validate-deployment.sh
docker-compose start dot-backend
```

## Phase 6: 한국어 지원 검증

### 6.1 UTF-8 인코딩 테스트
```bash
# 체크리스트
- [ ] 한국어 텍스트 정상 표시
- [ ] 로그 파일 한국어 인코딩 정상
- [ ] API 응답 한국어 인코딩 정상

# 실행 명령어
curl -H "Accept-Language: ko-KR" http://localhost/api/health
grep -r "한국어" logs/
```

### 6.2 다국어 지원 테스트
```bash
# 체크리스트
- [ ] Accept-Language 헤더 인식
- [ ] 언어별 응답 메시지 확인
- [ ] 언어 변경 기능 동작 확인

# 실행 명령어
curl -H "Accept-Language: en-US" http://localhost/api/health
curl -H "Accept-Language: ja-JP" http://localhost/api/health
curl -H "Accept-Language: zh-CN" http://localhost/api/health
```

## Phase 7: 보안 및 접근성 검증

### 7.1 기본 보안 검증
```bash
# 체크리스트
- [ ] HTTPS 설정 확인 (운영환경)
- [ ] 기본 인증 정보 변경 확인
- [ ] 불필요한 포트 노출 없음 확인

# 실행 명령어
netstat -tlnp | grep -E "(3000|5432|6379)"
docker-compose config | grep -E "(POSTGRES_PASSWORD|REDIS_PASSWORD)"
```

### 7.2 접근성 기본 검증
```bash
# 체크리스트
- [ ] 키보드 네비게이션 가능
- [ ] 색상 대비 적절함
- [ ] 스크린 리더 호환성 확인

# 브라우저 개발자 도구에서 Lighthouse 접근성 점수 확인
```

## 테스트 결과 문서화

### 성공 기준
- [ ] 모든 체크리스트 항목 통과
- [ ] 한국어 요구사항 (응답시간 < 3초, 10명 동시 사용자) 만족
- [ ] 시스템 안정성 확인 (24시간 이상 무중단 운영)
- [ ] 성능 벤치마크 기준선 통과

### 실패 시 대응 절차
1. **로그 수집**: `tar -czf debug-logs.tar.gz logs/`
2. **시스템 정보 수집**: `docker-compose ps > system-status.txt`
3. **문제 분석**: 문서화된 트러블슈팅 가이드 참조
4. **이슈 리포트**: GitHub Issues 또는 지정된 채널에 보고

### 테스트 완료 확인서

```
DOT Platform V0.1 배포 검증 매뉴얼 테스트 완료 확인서

테스트 일시: ____________________
테스트 환경: ____________________
테스트 수행자: __________________

[ ] Phase 1: 기본 배포 검증 완료
[ ] Phase 2: 검증 스크립트 테스트 완료
[ ] Phase 3: 성능 벤치마크 테스트 완료
[ ] Phase 4: 리포팅 시스템 테스트 완료
[ ] Phase 5: 통합 시나리오 테스트 완료
[ ] Phase 6: 한국어 지원 검증 완료
[ ] Phase 7: 보안 및 접근성 검증 완료

전체 테스트 결과: [ ] 성공 [ ] 실패

특이사항:
_________________________________________________
_________________________________________________
_________________________________________________

서명: ____________________
```

## 자동화된 매뉴얼 테스트 실행

편의를 위해 전체 매뉴얼 테스트를 자동으로 실행하는 스크립트:

```bash
#!/bin/bash
# 사용법: ./scripts/run-manual-tests.sh

echo "DOT Platform 배포 검증 매뉴얼 테스트 시작..."

# Phase 1-7 자동 실행
phases=(
    "scripts/deploy.sh"
    "scripts/validate-system.sh"
    "scripts/validate-deployment.sh"
    "scripts/validate-korean-requirements.sh"
    "scripts/benchmark-performance.sh korean-requirements"
    "scripts/generate-report.sh --format all"
)

for phase in "${phases[@]}"; do
    echo "실행 중: $phase"
    if $phase; then
        echo "✅ $phase 성공"
    else
        echo "❌ $phase 실패"
        exit 1
    fi
done

echo "✅ 모든 매뉴얼 테스트 완료"
```