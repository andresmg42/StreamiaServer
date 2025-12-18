#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploys Streamia microservices infrastructure to Kubernetes in the correct order.

.DESCRIPTION
    This script deploys infrastructure components in three stages:
    1. Namespaces and ConfigMaps/Secrets
    2. Database, Message Queue, and Cache (waits for them to be ready)
    3. Microservices deployments

.EXAMPLE
    .\deploy-infrastructure.ps1
#>

param(
    [int]$TimeoutSeconds = 300
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Colors for output
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$RED = "`e[31m"
$RESET = "`e[0m"

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Info {
    param([string]$Message)
    Write-Host "${GREEN}[INFO]${RESET} $Message"
}

function Write-WarningMsg {
    param([string]$Message)
    Write-Host "${YELLOW}[WARNING]${RESET} $Message"
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "${RED}[ERROR]${RESET} $Message"
}

function Test-KubernetesConnection {
    Write-Info "Testing Kubernetes connection..."
    $output = kubectl cluster-info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Cannot connect to Kubernetes cluster"
        exit 1
    }
    Write-Info "Kubernetes cluster is accessible"
}

function Apply-ConfigFiles {
    param(
        [string]$FolderPath,
        [string]$Description
    )
    
    Write-Info "Applying $Description from: $FolderPath"
    
    if (-not (Test-Path $FolderPath)) {
        Write-WarningMsg "Folder not found: $FolderPath"
        return $false
    }
    
    $files = @(Get-ChildItem -Path $FolderPath -Filter "*.yaml" -ErrorAction SilentlyContinue)
    
    if ($files.Count -eq 0) {
        Write-WarningMsg "No YAML files found in $FolderPath"
        return $false
    }
    
    foreach ($file in $files) {
        Write-Info "  Applying: $($file.Name)"
        $output = kubectl apply -f $file.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Failed to apply $($file.Name)"
            Write-ErrorMsg "$output"
            return $false
        }
    }
    
    return $true
}

function Wait-ForStatefulSet {
    param(
        [string]$Name,
        [string]$Namespace = "streamia",
        [int]$Timeout = 300
    )
    
    Write-Info "Waiting for StatefulSet '$Name' to be ready (timeout: ${Timeout}s)..."
    
    $startTime = Get-Date
    $timeoutSpan = New-TimeSpan -Seconds $Timeout
    
    while ((Get-Date) - $startTime -lt $timeoutSpan) {
        try {
            $ready = kubectl get statefulset $Name -n $Namespace -o jsonpath='{.status.readyReplicas}' 2>$null
            $desired = kubectl get statefulset $Name -n $Namespace -o jsonpath='{.status.replicas}' 2>$null
            
            if ($ready -and $desired -and ([int]$ready -eq [int]$desired)) {
                Write-Host ""
                Write-Info "$Name is ready (${ready}/${desired} replicas)"
                return $true
            }
        }
        catch {
            # Ignore errors during polling
        }
        
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 5
    }
    
    Write-Host ""
    Write-ErrorMsg "$Name did not become ready within ${Timeout} seconds"
    return $false
}

function Main {
    Write-Host ""
    Write-Info "=========================================="
    Write-Info "Streamia Infrastructure Deployment Script"
    Write-Info "=========================================="
    Write-Host ""
    
    # Get the script directory
    $scriptDir = $PSScriptRoot
    if (-not $scriptDir) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    $kubeDir = Join-Path (Split-Path -Parent $scriptDir) "kubernetes"
    
    # Test Kubernetes connection
    Test-KubernetesConnection
    Write-Host ""
    
    # ==========================================
    # Stage 1: Namespaces and ConfigMaps/Secrets
    # ==========================================
    Write-Info "========== STAGE 1: Namespaces and Configuration =========="
    Write-Host ""
    
    $namespacesPath = Join-Path $kubeDir "namespaces"
    $result1 = Apply-ConfigFiles -FolderPath $namespacesPath -Description "Namespaces"
    if (-not $result1) {
        Write-WarningMsg "No namespaces to apply, continuing..."
    }
    Write-Host ""
    
    $generatedPath = Join-Path $kubeDir "generated"
    $result2 = Apply-ConfigFiles -FolderPath $generatedPath -Description "ConfigMaps and Secrets"
    if (-not $result2) {
        Write-WarningMsg "No generated config to apply, continuing..."
    }
    Write-Host ""
    
    # ==========================================
    # Stage 2: Infrastructure Services (with wait)
    # ==========================================
    Write-Info "========== STAGE 2: Infrastructure Services =========="
    Write-Host ""
    
    $globalPath = Join-Path $kubeDir "global"
    $globalExists = Apply-ConfigFiles -FolderPath $globalPath -Description "Infrastructure (MongoDB, RabbitMQ, Redis)"
    
    if (-not $globalExists) {
        Write-WarningMsg "No global config to apply, checking deployments folder..."
        
        # Fallback: check deployments folder for these files
        $deployPath = Join-Path $kubeDir "deployments"
        $mongoFile = Join-Path $deployPath "mongodb.yaml"
        $redisFile = Join-Path $deployPath "redis.yaml"
        $rabbitmqFile = Join-Path $deployPath "rabbitmq.yaml"
        
        if ((Test-Path $mongoFile) -or (Test-Path $redisFile) -or (Test-Path $rabbitmqFile)) {
            Write-Info "Found infrastructure files in deployments folder, applying..."
            if (Test-Path $mongoFile) {
                Write-Info "  Applying: mongodb.yaml"
                kubectl apply -f $mongoFile 2>&1 | Out-Null
            }
            if (Test-Path $redisFile) {
                Write-Info "  Applying: redis.yaml"
                kubectl apply -f $redisFile 2>&1 | Out-Null
            }
            if (Test-Path $rabbitmqFile) {
                Write-Info "  Applying: rabbitmq.yaml"
                kubectl apply -f $rabbitmqFile 2>&1 | Out-Null
            }
        }
    }
    Write-Host ""
    
    # Wait for infrastructure services
    Write-Info "Waiting for infrastructure services to be ready..."
    Write-Host ""
    
    $allReady = $true
    
    if (-not (Wait-ForStatefulSet -Name "mongodb" -Timeout $TimeoutSeconds)) {
        $allReady = $false
    }
    Write-Host ""
    
    if (-not (Wait-ForStatefulSet -Name "redis" -Timeout $TimeoutSeconds)) {
        $allReady = $false
    }
    Write-Host ""
    
    if (-not (Wait-ForStatefulSet -Name "rabbitmq" -Timeout $TimeoutSeconds)) {
        $allReady = $false
    }
    Write-Host ""
    
    if (-not $allReady) {
        Write-ErrorMsg "Some infrastructure services failed to become ready"
        Write-Info "Check pod status with: kubectl get pods -n streamia"
        Write-Info "Check pod logs with: kubectl logs -n streamia <pod-name>"
        exit 1
    }
    
    Write-Info "All infrastructure services are ready!"
    Write-Host ""
    
    # ==========================================
    # Stage 3: Microservices Deployments
    # ==========================================
    Write-Info "========== STAGE 3: Microservices Deployments =========="
    Write-Host ""
    
    $deploymentsPath = Join-Path $kubeDir "deployments"
    
    # Get all deployment files except infrastructure ones
    $deploymentFiles = @(Get-ChildItem -Path $deploymentsPath -Filter "*.yaml" -ErrorAction SilentlyContinue | 
        Where-Object { $_.Name -notin @("mongodb.yaml", "redis.yaml", "rabbitmq.yaml") })
    
    if ($deploymentFiles.Count -eq 0) {
        Write-WarningMsg "No microservice deployments found"
    }
    else {
        foreach ($file in $deploymentFiles) {
            Write-Info "  Applying: $($file.Name)"
            $output = kubectl apply -f $file.FullName 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-ErrorMsg "Failed to apply $($file.Name)"
                Write-ErrorMsg "$output"
                $allReady = $false
            }
        }
    }
    
    Write-Host ""
    Write-Info "=========================================="
    Write-Info "Deployment Complete!"
    Write-Info "=========================================="
    Write-Host ""
    
    if ($allReady) {
        Write-Info "All resources have been deployed successfully"
        Write-Info "Check pod status with: kubectl get pods -n streamia"
        Write-Info "Check pod logs with: kubectl logs -n streamia <pod-name>"
        exit 0
    }
    else {
        Write-ErrorMsg "Some resources failed to deploy"
        exit 1
    }
}

# ============================================================================
# Main Execution
# ============================================================================
Main
