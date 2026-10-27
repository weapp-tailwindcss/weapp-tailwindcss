# 在进入 Lefthook 的 shell 命令拼接前保存 Git 原始参数，每次覆盖以免复用旧值。
WEAPP_TAILWINDCSS_COMMIT_MSG_FILE="${1-}"
export WEAPP_TAILWINDCSS_COMMIT_MSG_FILE
