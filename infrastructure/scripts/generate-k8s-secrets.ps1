Param(
    [string]$EnvFile = "..\.env",
    [string]$OutputDir = "..\kubernetes\generated",
    [string]$Namespace = "streamia"
)

# Resolve relative paths from the script directory so the script works when
# executed from any working directory.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile = Join-Path $scriptDir $EnvFile
}
if (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir = Join-Path $scriptDir $OutputDir
}

# Note: default path above contains a space to avoid accidental execution when opened in some editors; pass explicit path when running, e.g. './generate-k8s-secrets.ps1 ..\.env ..\kubernetes\generated'

if (-not (Test-Path -Path $EnvFile)) {
    Write-Error "Env file not found: $EnvFile"
    exit 1
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$secretLines = @()
$configLines = @()

# Header lines
$secretLines += 'apiVersion: v1'
$secretLines += 'kind: Secret'
$secretLines += 'metadata:'
$secretLines += "  name: streamia-secrets"
$secretLines += "  namespace: $Namespace"
$secretLines += 'type: Opaque'
$secretLines += 'stringData:'

$configLines += 'apiVersion: v1'
$configLines += 'kind: ConfigMap'
$configLines += 'metadata:'
$configLines += "  name: streamia-config"
$configLines += "  namespace: $Namespace"
$configLines += 'data:'

Get-Content -Path $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { return }

    # split on first '=' only
    $parts = $line -split '=',2
    if ($parts.Count -lt 2) { return }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()

    # remove surrounding quotes if any
    if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1,$value.Length-2) }
    if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Substring(1,$value.Length-2) }

    # normalize CR/LF and remove internal newlines
    $value = $value -replace "\r","" -replace "\n",""
    $value = $value.Trim()

    # escape single quotes for YAML single-quoted style
    $esc = $value -replace "'", "''"

    # Decide whether this key is secret or config
    switch -Regex ($key) {
        '^(JWT_SECRET|JWT_REFRESH_SECRET|RABBITMQ_PASSWORD|RABBITMQ_USER|CLOUDINARY_API_.*|SMTP_PASSWORD|EMAIL_PASS|SMTP_PASS)$' {
            $secretLines += ('  {0}: ''{1}''' -f $key, $esc)
            break
        }
        '^(NODE_ENV|CORS_ORIGIN|.*_URL|.*_HOST|.*_PORT|.*_USER|.*_FROM|CLOUDINARY_CLOUD_NAME|ORIGIN|FRONTEND_URL|MONGODB_.*|.*PORT)$' {
            # skip keys containing PASSWORD or SECRET
            if ($key -match 'PASSWORD|SECRET') { break }
            $configLines += ('  {0}: ''{1}''' -f $key, $esc)
            break
        }
        default {
            # ignore other values by default
        }
    }
}

# Write files
$secretFile = Join-Path $OutputDir 'secrets-from-env.yaml'
$configFile = Join-Path $OutputDir 'configmap-from-env.yaml'

$secretLines | Out-File -FilePath $secretFile -Encoding utf8 -Force
$configLines | Out-File -FilePath $configFile -Encoding utf8 -Force

Write-Host "Created: $secretFile"
Write-Host "Created: $configFile"

Write-Host "To apply: kubectl apply -f $OutputDir/"
