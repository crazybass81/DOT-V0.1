#!/bin/bash

################################################################################
# DOT Platform 복구 스크립트
#
# 사용법:
#   ./scripts/restore.sh <백업파일> [옵션]
#
# 옵션:
#   --confirm     확인 없이 즉시 복구
#   --db-only     데이터베이스만 복구
#   --files-only  파일만 복구
#   --from-s3     S3에서 백업 다운로드
#   --dry-run     실제 복구 없이 시뮬레이션
#
# 예시:
#   ./scripts/restore.sh backups/dot_backup_20241201_120000.tar.gz
#   ./scripts/restore.sh s3://dot-backups/backups/dot_backup_20241201_120000.tar.gz --from-s3
################################################################################

set -e

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정
RESTORE_DIR="${RESTORE_DIR:-./restore_temp}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="./restore_${TIMESTAMP}.log"

# 환경 변수
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-dot_production}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"

# S3 설정
S3_BUCKET="${S3_BUCKET:-dot-backups}"
S3_REGION="${AWS_REGION:-ap-northeast-2}"

# 복구 옵션
RESTORE_TYPE="full"
CONFIRM=false
FROM_S3=false
DRY_RUN=false
BACKUP_FILE=""

# 함수: 로그 출력
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    cleanup
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# 함수: 사용법 출력
usage() {
    cat << EOF
사용법: $0 <백업파일> [옵션]

옵션:
    --confirm     확인 없이 즉시 복구
    --db-only     데이터베이스만 복구
    --files-only  파일만 복구
    --from-s3     S3에서 백업 다운로드
    --dry-run     실제 복구 없이 시뮬레이션
    --help        도움말 출력

예시:
    $0 backups/dot_backup_20241201_120000.tar.gz
    $0 s3://dot-backups/backups/backup.tar.gz --from-s3
EOF
    exit 0
}

# 함수: 정리
cleanup() {
    if [ -d "$RESTORE_DIR" ]; then
        log "임시 디렉토리 정리 중..."
        rm -rf "$RESTORE_DIR"
    fi
}

# 명령행 인자 파싱
if [ $# -eq 0 ]; then
    usage
fi

BACKUP_FILE=$1
shift

while [[ $# -gt 0 ]]; do
    case $1 in
        --confirm)
            CONFIRM=true
            shift
            ;;
        --db-only)
            RESTORE_TYPE="db"
            shift
            ;;
        --files-only)
            RESTORE_TYPE="files"
            shift
            ;;
        --from-s3)
            FROM_S3=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "알 수 없는 옵션: $1"
            usage
            ;;
    esac
done

# 함수: 백업 파일 다운로드 (S3)
download_from_s3() {
    local s3_path=$1
    local local_path="./backups/$(basename "$s3_path")"

    log "S3에서 백업 다운로드 중: $s3_path"

    mkdir -p ./backups
    aws s3 cp "$s3_path" "$local_path" --region "$S3_REGION"

    if [ $? -eq 0 ]; then
        log "다운로드 완료: $local_path"
        BACKUP_FILE="$local_path"
    else
        error "S3 다운로드 실패"
    fi
}

# 함수: 백업 검증
validate_backup() {
    log "백업 파일 검증 중..."

    if [ ! -f "$BACKUP_FILE" ]; then
        error "백업 파일을 찾을 수 없습니다: $BACKUP_FILE"
    fi

    # 파일 타입 확인
    if file "$BACKUP_FILE" | grep -q "gzip compressed"; then
        log "백업 파일 형식: gzip 압축"
    else
        error "지원되지 않는 백업 파일 형식"
    fi

    # 백업 추출
    mkdir -p "$RESTORE_DIR"
    tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR"

    # 메타데이터 확인
    METADATA_FILE=$(find "$RESTORE_DIR" -name "metadata.json" -type f | head -1)
    if [ -f "$METADATA_FILE" ]; then
        log "백업 메타데이터 발견"
        info "백업 정보:"
        cat "$METADATA_FILE" | python3 -m json.tool | head -20
    else
        warning "메타데이터 파일이 없습니다"
    fi
}

# 함수: 데이터베이스 복구
restore_database() {
    log "데이터베이스 복구 시작..."

    # 데이터베이스 백업 파일 찾기
    DB_BACKUP_FILE=$(find "$RESTORE_DIR" -name "database.sql" -type f | head -1)

    if [ ! -f "$DB_BACKUP_FILE" ]; then
        error "데이터베이스 백업 파일을 찾을 수 없습니다"
    fi

    if [ "$DRY_RUN" = true ]; then
        info "[DRY-RUN] 데이터베이스 복구 시뮬레이션"
        info "복구할 파일: $DB_BACKUP_FILE"
        info "대상 데이터베이스: $DB_NAME"
        return
    fi

    # 현재 데이터베이스 백업 (안전을 위해)
    warning "기존 데이터베이스를 백업합니다..."
    SAFETY_BACKUP="./backups/safety_backup_${DB_NAME}_${TIMESTAMP}.sql"
    mkdir -p ./backups

    export PGPASSWORD="$DB_PASSWORD"
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-owner --no-acl > "$SAFETY_BACKUP" 2>> "$LOG_FILE"

    if [ $? -eq 0 ]; then
        log "안전 백업 완료: $SAFETY_BACKUP"
    else
        error "안전 백업 실패. 복구를 중단합니다."
    fi

    # 데이터베이스 복구
    log "데이터베이스 복구 중..."

    # 기존 연결 종료
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres << EOF >> "$LOG_FILE" 2>&1
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
EOF

    # 데이터베이스 재생성
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres << EOF >> "$LOG_FILE" 2>&1
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME};
EOF

    # PostGIS 확장 설치 (필요한 경우)
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << EOF >> "$LOG_FILE" 2>&1
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOF

    # 백업 복구
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$DB_BACKUP_FILE" >> "$LOG_FILE" 2>&1

    if [ $? -eq 0 ]; then
        log "데이터베이스 복구 완료"

        # 테이블 수 확인
        TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null)
        info "복구된 테이블 수: $TABLE_COUNT"
    else
        error "데이터베이스 복구 실패. 안전 백업에서 복구를 시도하세요: $SAFETY_BACKUP"
    fi

    unset PGPASSWORD
}

# 함수: 파일 시스템 복구
restore_files() {
    log "파일 시스템 복구 시작..."

    FILES_DIR=$(find "$RESTORE_DIR" -name "files" -type d | head -1)

    if [ ! -d "$FILES_DIR" ]; then
        warning "파일 백업을 찾을 수 없습니다"
        return
    fi

    if [ "$DRY_RUN" = true ]; then
        info "[DRY-RUN] 파일 시스템 복구 시뮬레이션"
        info "복구할 디렉토리: $FILES_DIR"
        ls -la "$FILES_DIR"
        return
    fi

    # uploads 디렉토리 복구
    if [ -f "$FILES_DIR/uploads.tar.gz" ]; then
        log "uploads 디렉토리 복구 중..."
        mkdir -p ./uploads_backup_${TIMESTAMP}
        if [ -d "./uploads" ]; then
            mv ./uploads ./uploads_backup_${TIMESTAMP}
        fi
        tar -xzf "$FILES_DIR/uploads.tar.gz" -C ./ 2>> "$LOG_FILE"
        log "uploads 복구 완료"
    fi

    # logs 디렉토리 복구
    if [ -f "$FILES_DIR/logs.tar.gz" ]; then
        log "logs 디렉토리 복구 중..."
        tar -xzf "$FILES_DIR/logs.tar.gz" -C ./ 2>> "$LOG_FILE"
        log "logs 복구 완료"
    fi

    # 설정 파일 복구
    if [ -f "$FILES_DIR/.env.backup" ]; then
        log "환경 설정 파일 복구 중..."
        if [ -f ".env" ]; then
            cp .env .env.backup_${TIMESTAMP}
        fi
        cp "$FILES_DIR/.env.backup" .env
        log "환경 설정 복구 완료"
    fi

    # Docker 설정 파일 복구
    for FILE in docker-compose.yml docker-compose.prod.yml; do
        if [ -f "$FILES_DIR/$FILE" ]; then
            log "$FILE 복구 중..."
            if [ -f "$FILE" ]; then
                cp "$FILE" "${FILE}.backup_${TIMESTAMP}"
            fi
            cp "$FILES_DIR/$FILE" ./
        fi
    done

    log "파일 시스템 복구 완료"
}

# 함수: 복구 후 검증
post_restore_validation() {
    log "복구 후 검증 시작..."

    if [ "$RESTORE_TYPE" = "full" ] || [ "$RESTORE_TYPE" = "db" ]; then
        # 데이터베이스 연결 테스트
        export PGPASSWORD="$DB_PASSWORD"
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
            info "✅ 데이터베이스 연결 정상"
        else
            warning "⚠️ 데이터베이스 연결 실패"
        fi
        unset PGPASSWORD
    fi

    if [ "$RESTORE_TYPE" = "full" ] || [ "$RESTORE_TYPE" = "files" ]; then
        # 파일 시스템 검증
        if [ -d "./uploads" ]; then
            FILE_COUNT=$(find ./uploads -type f | wc -l)
            info "✅ uploads 디렉토리: ${FILE_COUNT} 파일"
        fi
    fi

    log "복구 후 검증 완료"
}

# 메인 복구 프로세스
main() {
    log "DOT Platform 복구 시작"
    log "백업 파일: $BACKUP_FILE"
    log "복구 유형: $RESTORE_TYPE"

    if [ "$DRY_RUN" = true ]; then
        warning "DRY-RUN 모드: 실제 복구는 수행되지 않습니다"
    fi

    # S3에서 다운로드
    if [ "$FROM_S3" = true ]; then
        download_from_s3 "$BACKUP_FILE"
    fi

    # 백업 검증
    validate_backup

    # 확인 프롬프트
    if [ "$CONFIRM" = false ] && [ "$DRY_RUN" = false ]; then
        warning "⚠️  경고: 복구 작업은 기존 데이터를 덮어씁니다!"
        echo -n "계속하시겠습니까? (yes/no): "
        read -r response
        if [ "$response" != "yes" ]; then
            log "복구 취소됨"
            cleanup
            exit 0
        fi
    fi

    # 복구 유형에 따른 실행
    case $RESTORE_TYPE in
        full)
            restore_database
            restore_files
            ;;
        db)
            restore_database
            ;;
        files)
            restore_files
            ;;
    esac

    # 복구 후 검증
    post_restore_validation

    # 정리
    cleanup

    log "✅ 복구 완료!"
    info "복구 로그: $LOG_FILE"

    # 서비스 재시작 안내
    if [ "$DRY_RUN" = false ]; then
        warning "서비스를 재시작해야 할 수 있습니다:"
        echo "  docker-compose restart"
        echo "  또는"
        echo "  systemctl restart dot-backend"
    fi
}

# 트랩 설정
trap cleanup EXIT

# 메인 함수 실행
main

exit 0