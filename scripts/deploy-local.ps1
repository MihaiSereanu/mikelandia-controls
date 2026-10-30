[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $source 'deploy.local.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'Create deploy.local.json with a destination property containing the full installed module path.'
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if (-not $config.destination -or -not [IO.Path]::IsPathRooted($config.destination)) {
    throw 'The destination must be an absolute module folder path.'
}

$source = [IO.Path]::GetFullPath($source).TrimEnd('\')
$destination = [IO.Path]::GetFullPath($config.destination).TrimEnd('\')
$manifest = Get-Content -LiteralPath (Join-Path $source 'module.json') -Raw | ConvertFrom-Json
if ((Split-Path -Leaf $destination) -cne $manifest.id) {
    throw 'The destination folder name must match the module ID.'
}
if ($destination -ieq $source -or
    $destination.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $source.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The source and destination must be separate folders, with neither inside the other.'
}

# Reject links in the destination path before replacing anything.
$ancestor = $destination
while ($ancestor) {
    if (Test-Path -LiteralPath $ancestor) {
        $item = Get-Item -LiteralPath $ancestor -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'The destination path must contain only regular folders.'
        }
    }
    $ancestor = Split-Path -Parent $ancestor
}

function Copy-ModuleTree([string]$From, [string]$To) {
    New-Item -ItemType Directory -Path $To -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $From -Force) {
        if ($item.Name -in @('.git', 'deploy.local.json', '.env') -or
            ($item.Name -like '.env.*' -and $item.Name -ne '.env.example')) {
            continue
        }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'The source contains a link or junction. Replace it with regular files before deploying.'
        }
        $target = Join-Path $To $item.Name
        if ($item.PSIsContainer) {
            Copy-ModuleTree -From $item.FullName -To $target
        } else {
            Copy-Item -LiteralPath $item.FullName -Destination $target -Force
        }
    }
}

if (-not $PSCmdlet.ShouldProcess($destination, 'Replace installed module with a copy of this checkout')) {
    return
}

$parent = Split-Path -Parent $destination
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$stage = Join-Path $parent ('.' + $manifest.id + '-staging-' + [guid]::NewGuid().ToString('N'))
try {
    Copy-ModuleTree -From $source -To $stage
    if (Test-Path -LiteralPath $destination) {
        $resolved = (Resolve-Path -LiteralPath $destination).ProviderPath.TrimEnd('\')
        if ($resolved -ine $destination) {
            throw 'The resolved destination differs from the configured module folder.'
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Move-Item -LiteralPath $stage -Destination $destination
    Write-Host 'Installed module replaced. Project folder preserved.'
} finally {
    if (Test-Path -LiteralPath $stage) {
        # Only remove the uniquely named staging folder created by this run.
        $resolvedStage = (Resolve-Path -LiteralPath $stage).ProviderPath.TrimEnd('\')
        if ($resolvedStage -ieq $stage -and (Split-Path -Parent $resolvedStage) -ieq $parent) {
            Remove-Item -LiteralPath $resolvedStage -Recurse -Force
        }
    }
}
