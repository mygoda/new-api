#!/bin/bash
# =====================================================
# New API 一键部署脚本（幂等版，支持重复执行）
# 包含: New API + MySQL + Redis
# 项目: https://github.com/QuantumNous/new-api
# 适用系统: Ubuntu 24.04
# =====================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
skip()    { echo -e "${YELLOW}[SKIP]${NC} $1 已存在，跳过生成"; }
step()    { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# =====================================================
# ⚙️  在这里修改配置（其余保持默认即可）
# =====================================================
DEPLOY_DIR="/opt/new-api"       # 部署目录
APP_PORT=3000                   # New API 对外端口

# 数据库密码（留空则自动生成）
MYSQL_PASSWORD=""

# Session / 加密密钥（留空则自动生成，多机部署时必须手动填写保持一致）
SESSION_SECRET=""
CRYPTO_SECRET=""
# =====================================================

if [ "$EUID" -ne 0 ]; then
  error "请使用 root 或 sudo 运行: sudo bash install-new-api.sh"
fi

if ! command -v docker &>/dev/null; then
  error "未检测到 Docker，请先安装 Docker。可使用配套脚本 install-docker.sh"
fi

# =====================================================
step "Step 1/4: 初始化目录与密钥"
# =====================================================

mkdir -p "$DEPLOY_DIR/data"
cd "$DEPLOY_DIR"
info "部署目录: $DEPLOY_DIR"

# 密钥持久化文件，保证重复运行时密钥不变
ENV_FILE="$DEPLOY_DIR/.env.secrets"

if [ -f "$ENV_FILE" ]; then
  skip ".env.secrets"
  source "$ENV_FILE"
  info "复用已有密钥配置"
else
  # 自动生成缺失的密钥
  [ -z "$MYSQL_PASSWORD" ]  && MYSQL_PASSWORD="NewApi@$(openssl rand -hex 6)!"
  [ -z "$SESSION_SECRET" ]  && SESSION_SECRET=$(openssl rand -hex 32)
  [ -z "$CRYPTO_SECRET" ]   && CRYPTO_SECRET=$(openssl rand -hex 32)

  cat > "$ENV_FILE" << ENVEOF
# New API 密钥配置 - 自动生成，请勿手动删除
MYSQL_PASSWORD=${MYSQL_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
CRYPTO_SECRET=${CRYPTO_SECRET}
ENVEOF
  chmod 600 "$ENV_FILE"
  info "密钥已生成并保存至 $ENV_FILE"
fi

# =====================================================
step "Step 2/4: 生成 docker-compose.yml"
# =====================================================

COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

if [ -f "$COMPOSE_FILE" ]; then
  skip "docker-compose.yml"
else
  cat > "$COMPOSE_FILE" << COMPOSEEOF
version: '3.8'

services:
  new-api:
    image: myapi:6c24136a
    #image: calciumion/new-api:latest
    container_name: new-api
    restart: always
    ports:
      - "${APP_PORT}:3000"
    environment:
      - TZ=Asia/Shanghai
      - SQL_DSN=root:${MYSQL_PASSWORD}@tcp(mysql:3306)/new_api?charset=utf8mb4&parseTime=True&loc=Local
      - REDIS_CONN_STRING=redis://redis:6379
      - SESSION_SECRET=${SESSION_SECRET}
      - CRYPTO_SECRET=${CRYPTO_SECRET}
      - STREAMING_TIMEOUT=300
    volumes:
      - ./data:/data
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - new-api-net
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"

  mysql:
    image: mysql:8.0
    container_name: new-api-mysql
    restart: always
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_PASSWORD}
      - MYSQL_DATABASE=new_api
      - TZ=Asia/Shanghai
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
    volumes:
      - ./data/mysql:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 40s
    networks:
      - new-api-net
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: new-api-redis
    restart: always
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - ./data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - new-api-net
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "2"

networks:
  new-api-net:
    driver: bridge
COMPOSEEOF
  info "docker-compose.yml 已生成"
fi

# =====================================================
step "Step 3/4: 启动 / 更新服务"
# =====================================================

cd "$DEPLOY_DIR"

if docker compose ps --quiet 2>/dev/null | grep -q .; then
  info "检测到服务已在运行，执行热更新镜像..."
  docker compose pull new-api
  docker compose up -d --remove-orphans
  info "热更新完成"
else
  info "首次启动，拉取镜像中（MySQL 首次初始化约需 30s）..."
  docker compose pull
  docker compose up -d
  info "容器已启动，等待 MySQL 健康检查通过..."

  # 等待 MySQL 就绪（最多等 90s）
  WAIT=0
  until docker compose exec -T mysql mysqladmin ping -h localhost -uroot "-p${MYSQL_PASSWORD}" --silent 2>/dev/null; do
    WAIT=$((WAIT+5))
    if [ "$WAIT" -ge 90 ]; then
      error "MySQL 启动超时，请执行: cd $DEPLOY_DIR && docker compose logs mysql"
    fi
    info "等待 MySQL 就绪... (${WAIT}s)"
    sleep 5
  done
fi

# =====================================================
step "Step 4/4: 验证服务状态"
# =====================================================

sleep 3
SERVER_IP=$(hostname -I | awk '{print $1}')

if docker compose ps | grep "new-api" | grep -q "Up"; then
  echo ""
  info "========================================"
  info "  ✅ New API 部署 / 更新成功！"
  info ""
  info "  访问地址  : http://${SERVER_IP}:${APP_PORT}"
  info "  默认账号  : root"
  info "  默认密码  : 123456  ← 登录后请立即修改！"
  info ""
  info "  密钥文件  : $ENV_FILE"
  info "  部署目录  : $DEPLOY_DIR"
  info ""
  info "  MySQL 密码: ${MYSQL_PASSWORD}"
  info ""
  info "  常用命令："
  info "    cd $DEPLOY_DIR"
  info "    docker compose logs -f          # 实时日志"
  info "    docker compose logs -f new-api  # 只看应用日志"
  info "    docker compose restart new-api  # 重启应用"
  info "    docker compose down             # 停止所有服务"
  info "    docker compose pull && docker compose up -d  # 升级到最新版"
  info "========================================"
else
  error "服务启动异常，请执行: cd $DEPLOY_DIR && docker compose logs"
fi