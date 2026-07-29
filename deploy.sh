#!/bin/bash

echo "========================================================"
echo "开始安装专属 3x-ui 面板..."
echo "========================================================"

# 1. 检测并自动安装 Docker
if ! command -v docker &> /dev/null; then
    echo "未检测到 Docker，正在为您自动安装..."
    curl -fsSL https://get.docker.com | bash -s docker
    systemctl start docker
    systemctl enable docker
    echo "Docker 安装完成！"
else
    echo "Docker 已安装，跳过环境配置。"
fi

# 2. 清理可能存在的旧版本
docker rm -f 3x-ui &> /dev/null

# 3. 拉取并运行专属镜像
echo "正在拉取最新面板镜像..."
docker run -itd \
  --network=host \
  -v /root/3x-ui/db/:/etc/x-ui/ \
  -v /root/3x-ui/cert/:/root/cert/ \
  --name 3x-ui \
  --restart=always \
  ghcr.io/wstimin/my-3x-ui:latest

echo "========================================================"
echo "部署成功！"
echo "面板已在后台运行，请通过 浏览器访问 服务器IP:端口"
echo "默认用户名和密码取决于你原有的数据库，若为全新机器则为 admin/admin"
echo "========================================================"
