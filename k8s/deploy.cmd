@echo off
REM Build and deploy ECEV Provisioning to Kubernetes
REM Usage: deploy.cmd [REGISTRY]
REM Example: deploy.cmd myregistry.azurecr.io

SET REGISTRY=%1

echo === Building Docker images ===
docker build -t ecev-backend:latest ./backend
docker build -t ecev-frontend:latest ./frontend

IF NOT "%REGISTRY%"=="" (
    echo === Tagging and pushing to %REGISTRY% ===
    docker tag ecev-backend:latest %REGISTRY%/ecev-backend:latest
    docker tag ecev-frontend:latest %REGISTRY%/ecev-frontend:latest
    docker push %REGISTRY%/ecev-backend:latest
    docker push %REGISTRY%/ecev-frontend:latest
    echo === Update k8s/deployment.yaml image references to %REGISTRY%/ecev-backend:latest and %REGISTRY%/ecev-frontend:latest ===
)

echo === Creating ConfigMap from config files ===
kubectl create configmap ecev-config --from-file=config.json=config/config.json --from-file=catalog.json=config/catalog.json --dry-run=client -o yaml | kubectl apply -f -

echo === Deploying to Kubernetes ===
kubectl apply -f k8s/deployment.yaml

echo === Done! Check status with: kubectl get pods -l app=ecev-provisioning ===
