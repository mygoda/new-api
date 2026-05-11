# dalasi 环境部署

dalasi 是单机部署的 new-api 实例，由仓库内 `deploy.sh` 脚本一键完成镜像构建、容器替换、Doris 初始化、模型表迁移。对应自动化 skill：`/dalasi-deploy`。

## 目标主机

| 项 | 值 |
|---|---|
| 主机 | `148.153.38.18` |
| 用户 | `root`（已加 key） |
| 工作目录 | `/root/my-new-api/mynewapi` |
| 部署脚本 | `./deploy.sh` |
| 服务端口 | `3010` |

## 一键部署

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new root@148.153.38.18 \
  'set -e; cd /root/my-new-api/mynewapi && git pull && ./deploy.sh' 2>&1
```

部署含 docker build，全程 5–15 分钟。建议 SSH 调用 timeout 设 15 分钟（`900s`）。

`deploy.sh` 在镜像构建完后会顺序执行：

1. 用本次 commit 短 hash 给镜像打 tag（如 `new-api:b43ce7b8`）和 `latest`
2. 重新生成 `docker-compose.deploy.yml`，重启容器
3. 触发 Doris 建表（幂等）
4. 触发 `migrate-models.sh`（幂等）
5. 静态资源预热

## 判定部署成功

按下面的优先级判：

1. **退出码非 0** → 失败。
2. **退出码 0**，但日志里出现以下任意关键字 → 视为可疑：
   - `error` / `ERROR` / `Error response from daemon`
   - `failed` / `FAILED`
   - `unhealthy`
   - `No such file or directory`
   - `Permission denied`
3. **退出码 0** 且无以上关键字 → 成功。

成功的日志一般包含：

```
镜像构建完成: new-api:<hash>
==> Doris setup completed successfully!
[INFO]  new-api 已启动!
[INFO]  访问地址: http://localhost:3010
```

`migrate-models.sh` 输出的 `ALTER ... IF NOT EXISTS 失败，尝试 5.7 兼容路径` 是预期分支（MySQL 5.7.8 不支持 `IF NOT EXISTS`，脚本设计如此），后续看到 `列已存在，跳过` 即可。

## 失败处理

- 不要自动重试，避免对生产抖动。
- 失败时，原文展示最后 50 行 stdout + 完整 stderr。
- 常见根因：git 冲突、docker build 失败（看 `/var/log/...`）、Doris 未就绪、磁盘满。

## 安全约束

- 不在远程修改 `git config`、不强制 reset、不删除分支
- 不带 `--no-verify` 之类的绕过参数
- 不在远程执行 `git pull && ./deploy.sh` 之外的「顺手」命令
- 不输出或回传任何 secret（`.env`、token）
- 任何非预期 prompt（密码、host key 改变）一律停下来交给人处理
