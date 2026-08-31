#!/usr/bin/env bash
# Cloud-init for the doc-hub Docker host.
#
# This script only *prepares* the machine: Docker, the compose plugin, swap, and
# the deployment directory. It deliberately knows nothing about which containers
# run there — that is host/docker-compose.yml, shipped by the deploy job in
# .github/workflows/build-images.yml. Keeping the two apart means editing the
# runtime is a git push, not an instance replacement.
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg

# Canonical's AMI ships the SSM agent as a snap, but not always started. This
# is the host's only management path — both the CI deploy job and
# `aws ssm start-session` go through it — so make sure it is up rather than
# assuming it.
snap start --enable amazon-ssm-agent || systemctl enable --now amazon-ssm-agent

# Swap. Not in ba-hub's copy of this script, and the reason is doc-hub's shape:
# six containers on a 2 GiB t3.small, of which Strapi alone is budgeted 1 GiB in
# helm/doc-registry/values.yaml and peaks higher while it migrates its schema on
# first boot. Without this the first deploy ends in an OOM kill.
#
# Swap is a floor, not a fix — a host that leans on it is slow. If the registry
# is regularly paging, move var.instance_type to t3.medium and this becomes
# harmless ballast.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
  # Prefer reclaiming page cache over swapping anonymous memory; the containers
  # are long-lived Node processes whose working set should stay resident.
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' >/etc/sysctl.d/99-swappiness.conf
fi

# Docker's own repository rather than Ubuntu's docker.io package: only the
# former ships docker-compose-plugin, and `docker compose` is what the deploy
# job calls.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

cat >/etc/apt/sources.list.d/docker.list <<REPO
deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable
REPO

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
usermod -aG docker ubuntu

# Containers must come back after a reboot without anyone logging in. The unit
# is a one-shot that replays whatever compose file is currently on disk; the
# `restart: unless-stopped` policies handle everything short of a reboot.
install -d -o ubuntu -g ubuntu /opt/doc-hub

cat >/opt/doc-hub/.env <<ENV
ACME_EMAIL=${acme_email}
ENV
chown ubuntu:ubuntu /opt/doc-hub/.env
chmod 0640 /opt/doc-hub/.env

# The application secrets live next to it in secrets.env, written by the deploy
# job from the repository secrets — see iac/deploy.sh. Created empty here so the
# compose file's `env_file` always resolves, even on a host that has never been
# deployed to.
touch /opt/doc-hub/secrets.env
chown ubuntu:ubuntu /opt/doc-hub/secrets.env
chmod 0640 /opt/doc-hub/secrets.env

cat >/etc/systemd/system/doc-hub.service <<'UNIT'
[Unit]
Description=doc-hub containers
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/doc-hub
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
# Enabled but not started: there is no compose file on disk until the first
# deploy, and starting now would only log a failure.
systemctl enable doc-hub.service
