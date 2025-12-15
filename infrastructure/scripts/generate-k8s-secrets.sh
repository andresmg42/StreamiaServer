#!/bin/bash

# Script to generate Kubernetes secrets and configmaps from .env file
# Usage: ./generate-k8s-secrets.sh [env-file] [output-dir]

set -e

ENV_FILE="${1:-../.env}"
OUTPUT_DIR="${2:-../kubernetes/generated}"
NAMESPACE="streamia"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔧 Generating Kubernetes resources from .env file${NC}"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: .env file not found at $ENV_FILE${NC}"
    echo -e "${YELLOW}💡 Tip: Copy .env.example to .env and fill in the values${NC}"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${YELLOW}📁 Reading from: $ENV_FILE${NC}"
echo -e "${YELLOW}📁 Output to: $OUTPUT_DIR${NC}"

# Function to create secret from .env
create_secrets() {
    local output_file="$OUTPUT_DIR/secrets-from-env.yaml"
    
    echo "apiVersion: v1
kind: Secret
metadata:
  name: streamia-secrets
  namespace: $NAMESPACE
type: Opaque
stringData:" > "$output_file"

    # Read .env and add secret values
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        
        # Remove quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        
        # Add to secrets (sensitive data)
        case "$key" in
            JWT_SECRET|JWT_REFRESH_SECRET|MONGODB_*|RABBITMQ_PASSWORD|CLOUDINARY_*|SMTP_PASSWORD)
                echo "  $key: \"$value\"" >> "$output_file"
                ;;
        esac
    done < "$ENV_FILE"
    
    echo -e "${GREEN}✅ Created: $output_file${NC}"
}

# Function to create configmap from .env
create_configmap() {
    local output_file="$OUTPUT_DIR/configmap-from-env.yaml"
    
    echo "apiVersion: v1
kind: ConfigMap
metadata:
  name: streamia-config
  namespace: $NAMESPACE
data:" > "$output_file"

    # Read .env and add non-sensitive values
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        
        # Remove quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        
        # Add to configmap (non-sensitive data)
        case "$key" in
            NODE_ENV|CORS_ORIGIN|*_URL|*_HOST|*_PORT|*_USER|SMTP_FROM)
                # Skip passwords and secrets
                [[ "$key" == *PASSWORD* || "$key" == *SECRET* ]] && continue
                echo "  $key: \"$value\"" >> "$output_file"
                ;;
        esac
    done < "$ENV_FILE"
    
    echo -e "${GREEN}✅ Created: $output_file${NC}"
}

# Generate files
create_secrets
create_configmap

echo ""
echo -e "${GREEN}🎉 Generation complete!${NC}"
echo ""
echo -e "${YELLOW}To apply the generated resources:${NC}"
echo "  kubectl apply -f $OUTPUT_DIR/"
echo ""
echo -e "${YELLOW}Or use kubectl to create secrets directly from .env:${NC}"
echo "  kubectl create secret generic streamia-secrets --from-env-file=$ENV_FILE -n $NAMESPACE --dry-run=client -o yaml"
