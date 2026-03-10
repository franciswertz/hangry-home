#!/bin/bash
set -euo pipefail

KUBE_BIN="${KUBE_BIN:-kubectl}"

if ! command -v "$KUBE_BIN" >/dev/null 2>&1; then
  echo "kubectl not available. Set KUBE_BIN or ensure kubectl is on PATH."
  exit 1
fi

echo "Deploying Hangry Home to k3s..."

echo "Applying namespace..."
"$KUBE_BIN" apply --server-side -f namespace.yaml --force-conflicts

if [ ! -f "config.env" ]; then
  echo "Missing k8s/config.env. Copy k8s/config.env.example and update it."
  exit 1
fi

echo "Applying Kustomize resources..."
"$KUBE_BIN" apply --server-side -k . --force-conflicts

echo "Scaling deployments to 1 replica..."
"$KUBE_BIN" scale deployment/hangry-home-server -n hangry-home --replicas=1
"$KUBE_BIN" scale deployment/hangry-home-client -n hangry-home --replicas=1

echo "Restarting deployments..."
"$KUBE_BIN" rollout restart deployment/hangry-home-server -n hangry-home
"$KUBE_BIN" rollout restart deployment/hangry-home-client -n hangry-home

echo "Waiting for rollouts..."
"$KUBE_BIN" rollout status deployment/hangry-home-server -n hangry-home --timeout=5m
"$KUBE_BIN" rollout status deployment/hangry-home-client -n hangry-home --timeout=5m

echo "Deployment complete."
