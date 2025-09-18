#!/bin/bash

################################################################################
# DOT Platform 백업 스크립트
#
# 사용법:
#   ./scripts/backup.sh [옵션]
#
# 옵션:
#   --full        전체 백업 (DB + 파일)
#   --db-only     데이터베이스만 백업
#   --files-only  파일만 백업
#   --s3          S3로 백업 업로드
#   --compress    백업 파일 압축
#
# 예시:
#   ./scripts/backup.sh --full --compress --s3
################################################################################

set -e  # 오류 발생 시 즉시 종료

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 설정
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="dot_backup_${TIMESTAMP}"
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"

# 환경 변수 (Docker 환경에서 자동 설정됨)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-dot_production}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"

# S3 설정
S3_BUCKET="${S3_BUCKET:-dot-backups}"
S3_REGION="${AWS_REGION:-ap-northeast-2}"

# 백업 유형
BACKUP_TYPE="full"
COMPRESS=false
UPLOAD_S3=false

# 함수: 로그 출력
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# 함수: 사용법 출력
usage() {
    cat << EOF
사용법: $0 [옵션]

옵션:
    --full        전체 백업 (기본값)
    --db-only     데이터베이스만 백업
    --files-only  파일만 백업
    --compress    백업 압축
    --s3          S3로 업로드
    --help        도움말 출력
EOF
    exit 0
}

# 명령행 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        --full)
            BACKUP_TYPE="full"
            shift
            ;;
        --db-only)
            BACKUP_TYPE="db"
            shift
            ;;
        --files-only)
            BACKUP_TYPE="files"
            shift
            ;;
        --compress)
            COMPRESS=true
            shift
            ;;
        --s3)
            UPLOAD_S3=true
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

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

log "백업 시작: ${BACKUP_NAME}"
log "백업 유형: ${BACKUP_TYPE}"

# 함수: 데이터베이스 백업
backup_database() {
    log "데이터베이스 백업 시작..."

    # PostgreSQL 연결 확인
    export PGPASSWORD="$DB_PASSWORD"
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
        error "데이터베이스에 연결할 수 없습니다"
    fi

    # 스키마 + 데이터 백업
    DB_BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}/database.sql"

    log "데이터베이스 덤프 중..."
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        --create \
        --format=plain \
        --file="$DB_BACKUP_FILE" 2>> "$LOG_FILE"

    if [ $? -eq 0 ]; then
        log "데이터베이스 백업 완료: $(du -h "$DB_BACKUP_FILE" | cut -f1)"

        # 백업 검증
        if [ -s "$DB_BACKUP_FILE" ]; then
            LINE_COUNT=$(wc -l < "$DB_BACKUP_FILE")
            log "백업 파일 검증: ${LINE_COUNT} 줄"
        else
            error "백업 파일이 비어있습니다"
        fi
    else
        error "데이터베이스 백업 실패"
    fi

    # 개별 테이블 백업 (선택사항)
    TABLES=(
        "users"
        "attendances"
        "schedules"
        "pay_statements"
        "documents"
    )

    for TABLE in "${TABLES[@]}"; do
        TABLE_BACKUP="${BACKUP_DIR}/${BACKUP_NAME}/table_${TABLE}.sql"
        pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            --table="$TABLE" \
            --data-only \
            --file="$TABLE_BACKUP" 2>> "$LOG_FILE" || warning "테이블 ${TABLE} 백업 실패"
    done

    unset PGPASSWORD
}

# 함수: 파일 시스템 백업
backup_files() {
    log "파일 시스템 백업 시작..."

    # 백업할 디렉토리 목록
    DIRS_TO_BACKUP=(
        "./uploads"
        "./logs"
        "./backend/config"
        "./frontend/public/assets"
    )

    FILES_BACKUP_DIR="${BACKUP_DIR}/${BACKUP_NAME}/files"
    mkdir -p "$FILES_BACKUP_DIR"

    for DIR in "${DIRS_TO_BACKUP[@]}"; do
        if [ -d "$DIR" ]; then
            log "백업 중: $DIR"
            DIR_NAME=$(basename "$DIR")
            tar -czf "${FILES_BACKUP_DIR}/${DIR_NAME}.tar.gz" -C "$(dirname "$DIR")" "$DIR_NAME" 2>> "$LOG_FILE"
        else
            warning "디렉토리를 찾을 수 없음: $DIR"
        fi
    done

    # 환경 설정 파일 백업
    if [ -f ".env" ]; then
        cp .env "${FILES_BACKUP_DIR}/.env.backup"
        log "환경 설정 파일 백업 완료"
    fi

    # 설정 파일들 백업
    CONFIG_FILES=(
        "docker-compose.yml"
        "docker-compose.prod.yml"
        "nginx/nginx.prod.conf"
    )

    for FILE in "${CONFIG_FILES[@]}"; do
        if [ -f "$FILE" ]; then
            cp "$FILE" "${FILES_BACKUP_DIR}/" 2>> "$LOG_FILE"
        fi
    done

    log "파일 시스템 백업 완료"
}

# 함수: 메타데이터 생성
create_metadata() {
    METADATA_FILE="${BACKUP_DIR}/${BACKUP_NAME}/metadata.json"

    cat > "$METADATA_FILE" << EOF
{
    "backup_name": "${BACKUP_NAME}",
    "timestamp": "$(date -Iseconds)",
    "type": "${BACKUP_TYPE}",
    "compressed": ${COMPRESS},
    "database": {
        "host": "${DB_HOST}",
        "name": "${DB_NAME}",
        "version": "$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c 'SELECT version()' 2>/dev/null | head -1 | xargs)"
    },
    "system": {
        "hostname": "$(hostname)",
        "os": "$(uname -a)",
        "user": "$(whoami)"
    },
    "git": {
        "branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
        "commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    }
}
EOF

    log "메타데이터 생성 완료"
}

# 메인 백업 프로세스
main() {
    # 백업 유형에 따른 실행
    case $BACKUP_TYPE in
        full)
            backup_database
            backup_files
            ;;
        db)
            backup_database
            ;;
        files)
            backup_files
            ;;
    esac

    # 메타데이터 생성
    create_metadata

    # 압축
    if [ "$COMPRESS" = true ]; then
        log "백업 압축 중..."
        ARCHIVE_NAME="${BACKUP_NAME}.tar.gz"

        cd "$BACKUP_DIR"
        tar -czf "$ARCHIVE_NAME" "$BACKUP_NAME" 2>> "$LOG_FILE"

        if [ $? -eq 0 ]; then
            ARCHIVE_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
            log "압축 완료: ${ARCHIVE_NAME} (${ARCHIVE_SIZE})"

            # 원본 디렉토리 삭제
            rm -rf "$BACKUP_NAME"
        else
            error "압축 실패"
        fi

        cd - > /dev/null
    fi

    # S3 업로드
    if [ "$UPLOAD_S3" = true ]; then
        log "S3 업로드 시작..."

        if [ "$COMPRESS" = true ]; then
            S3_FILE="${BACKUP_DIR}/${ARCHIVE_NAME}"
            S3_KEY="backups/${ARCHIVE_NAME}"
        else
            # 디렉토리 전체를 tar로 묶어서 업로드
            cd "$BACKUP_DIR"
            tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
            S3_FILE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
            S3_KEY="backups/${BACKUP_NAME}.tar.gz"
            cd - > /dev/null
        fi

        aws s3 cp "$S3_FILE" "s3://${S3_BUCKET}/${S3_KEY}" \
            --region "$S3_REGION" \
            --storage-class STANDARD_IA \
            --metadata "backup-type=${BACKUP_TYPE},timestamp=${TIMESTAMP}"

        if [ $? -eq 0 ]; then
            log "S3 업로드 완료: s3://${S3_BUCKET}/${S3_KEY}"

            # S3 라이프사이클 태그 추가 (30일 후 Glacier로 이동)
            aws s3api put-object-tagging \
                --bucket "$S3_BUCKET" \
                --key "$S3_KEY" \
                --tagging "TagSet=[{Key=retention,Value=30days}]" \
                --region "$S3_REGION"
        else
            error "S3 업로드 실패"
        fi
    fi

    # 오래된 백업 정리
    clean_old_backups

    log "백업 완료!"
}

# 함수: 오래된 백업 정리
clean_old_backups() {
    RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
    log "오래된 백업 정리 중 (${RETENTION_DAYS}일 이상)..."

    # 로컬 백업 정리
    find "$BACKUP_DIR" -name "dot_backup_*" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null
    find "$BACKUP_DIR" -name "dot_backup_*" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} + 2>/dev/null

    # S3 백업 정리 (라이프사이클 정책이 설정되어 있다면 스킵)
    if [ "$UPLOAD_S3" = true ]; then
        warning "S3 백업은 라이프사이클 정책에 따라 자동 관리됩니다"
    fi
}

# 트랩 설정 (오류 발생 시 정리)
trap 'error "백업 중 오류 발생"' ERR

# 메인 함수 실행
main

log "백업 스크립트 종료"
exit 0