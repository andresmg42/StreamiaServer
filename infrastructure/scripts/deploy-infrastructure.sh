#!/bin/bash

###############################################################################
# Streamia Infrastructure Deployment Script
#
# This script deploys infrastructure components to Kubernetes in three stages:
# 1. Namespaces and ConfigMaps/Secrets
# 2. Database, Message Queue, and Cache (waits for them to be ready)
# 3. Microservices deployments
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="streamia"
TIMEOUT_SECONDS=300

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

test_kubernetes_connection() {
    log_info "Testing Kubernetes connection..."
    if ! kubectl cluster-info > /dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    log_info "Kubernetes cluster is accessible"
}

apply_config_files() {
    local folder_path="$1"
    local description="$2"
    
    log_info "Applying $description from: $folder_path"
    
    if [ ! -d "$folder_path" ]; then
        log_warning "Folder not found: $folder_path"
        return 1
    fi
    
    local yaml_files=$(find "$folder_path" -maxdepth 1 -name "*.yaml" -type f)
    
    if [ -z "$yaml_files" ]; then
        log_warning "No YAML files found in $folder_path"
        return 1
    fi
    
    for file in $yaml_files; do
        log_info "  Applying: $(basename "$file")"
        if ! kubectl apply -f "$file"; then
            log_error "Failed to apply $(basename "$file")"
            return 1
        fi
    done
    
    return 0
}

wait_for_deployment() {
    local name="$1"
    local namespace="${2:-$NAMESPACE}"
    local timeout="${3:-$TIMEOUT_SECONDS}"
    
    log_info "Waiting for $name to be ready (timeout: ${timeout}s)..."
    
    local start_time=$(date +%s)
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -gt $timeout ]; then
            log_error "$name did not become ready within ${timeout} seconds"
            return 1
        fi
        
        local ready=$(kubectl get statefulset "$name" -n "$namespace" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        local desired=$(kubectl get statefulset "$name" -n "$namespace" -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
        
        if [ ! -z "$ready" ] && [ ! -z "$desired" ] && [ "$ready" = "$desired" ]; then
            log_info "$name is ready (${ready}/${desired} replicas)"
            return 0
        fi
        
        echo -n "."
        sleep 5
    done
}

main() {
    echo ""
    log_info "=========================================="
    log_info "Streamia Infrastructure Deployment Script"
    log_info "=========================================="
    echo ""
    
    # Get the script directory
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local kube_dir="$(dirname "$script_dir")/kubernetes"
    
    # Test Kubernetes connection
    test_kubernetes_connection
    echo ""
    
    # ==========================================
    # Stage 1: Namespaces and ConfigMaps/Secrets
    # ==========================================
    log_info "========== STAGE 1: Namespaces and Configuration =========="
    echo ""
    
    local namespaces_path="$kube_dir/namespaces"
    if ! apply_config_files "$namespaces_path" "Namespaces"; then
        log_warning "No namespaces to apply, continuing..."
    fi
    echo ""
    
    local generated_path="$kube_dir/generated"
    if ! apply_config_files "$generated_path" "ConfigMaps and Secrets"; then
        log_warning "No generated config to apply, continuing..."
    fi
    echo ""
    
    # ==========================================
    # Stage 2: Infrastructure Services (with wait)
    # ==========================================
    log_info "========== STAGE 2: Infrastructure Services =========="
    echo ""
    
    local global_path="$kube_dir/global"
    if ! apply_config_files "$global_path" "Infrastructure (MongoDB, RabbitMQ, Redis)"; then
        log_warning "No global config to apply, checking deployments folder..."
        
        # Fallback: check deployments folder for these files
        local deploy_path="$kube_dir/deployments"
        local mongo_file="$deploy_path/mongodb.yaml"
        local redis_file="$deploy_path/redis.yaml"
        local rabbitmq_file="$deploy_path/rabbitmq.yaml"
        
        if [ -f "$mongo_file" ] || [ -f "$redis_file" ] || [ -f "$rabbitmq_file" ]; then
            log_info "Found infrastructure files in deployments folder, applying..."
            [ -f "$mongo_file" ] && (log_info "  Applying: mongodb.yaml"; kubectl apply -f "$mongo_file")
            [ -f "$redis_file" ] && (log_info "  Applying: redis.yaml"; kubectl apply -f "$redis_file")
            [ -f "$rabbitmq_file" ] && (log_info "  Applying: rabbitmq.yaml"; kubectl apply -f "$rabbitmq_file")
        fi
    fi
    echo ""
    
    # Wait for infrastructure services
    log_info "Waiting for infrastructure services to be ready..."
    echo ""
    
    local all_ready=true
    
    if ! wait_for_deployment "mongodb" "$NAMESPACE" "$TIMEOUT_SECONDS"; then
        all_ready=false
    fi
    echo ""
    
    if ! wait_for_deployment "redis" "$NAMESPACE" "$TIMEOUT_SECONDS"; then
        all_ready=false
    fi
    echo ""
    
    if ! wait_for_deployment "rabbitmq" "$NAMESPACE" "$TIMEOUT_SECONDS"; then
        all_ready=false
    fi
    echo ""
    
    if [ "$all_ready" = false ]; then
        log_error "Some infrastructure services failed to become ready"
        log_info "Check pod status with: kubectl get pods -n $NAMESPACE"
        log_info "Check pod logs with: kubectl logs -n $NAMESPACE <pod-name>"
        exit 1
    fi
    
    log_info "All infrastructure services are ready!"
    echo ""
    
    # ==========================================
    # Stage 3: Microservices Deployments
    # ==========================================
    log_info "========== STAGE 3: Microservices Deployments =========="
    echo ""
    
    local deployments_path="$kube_dir/deployments"
    local deployment_files=$(find "$deployments_path" -maxdepth 1 -name "*.yaml" -type f | \
        grep -v "mongodb.yaml" | \
        grep -v "redis.yaml" | \
        grep -v "rabbitmq.yaml")
    
    if [ -z "$deployment_files" ]; then
        log_warning "No microservice deployments found"
    else
        for file in $deployment_files; do
            log_info "  Applying: $(basename "$file")"
            if ! kubectl apply -f "$file"; then
                log_error "Failed to apply $(basename "$file")"
                all_ready=false
            fi
        done
    fi
    
    echo ""
    log_info "=========================================="
    log_info "Deployment Complete!"
    log_info "=========================================="
    echo ""
    
    if [ "$all_ready" = true ]; then
        log_info "All resources have been deployed successfully"
        log_info "Check pod status with: kubectl get pods -n $NAMESPACE"
        log_info "Check pod logs with: kubectl logs -n $NAMESPACE <pod-name>"
        exit 0
    else
        log_error "Some resources failed to deploy"
        exit 1
    fi
}

# Run main function
main "$@"
