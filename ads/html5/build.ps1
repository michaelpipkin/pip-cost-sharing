# Build PipSplit HTML5 ad assets - injects assets and zips each size for upload to Google Ads
# Run from project root: pwsh ads/html5/build.ps1
# Or via bash wrapper:   bash ads/html5/build.sh

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent (Split-Path -Parent $scriptDir)
$dist      = Join-Path $repoRoot "ads\dist"
$assetsDir = Join-Path $repoRoot "src\assets\images"

New-Item -ItemType Directory -Force -Path $dist | Out-Null

# Build data URIs for embedded assets
$iconBytes   = [IO.File]::ReadAllBytes((Join-Path $assetsDir "pip_split_icon_192x192.png"))
$iconB64     = [Convert]::ToBase64String($iconBytes)
$iconDataUri = "data:image/png;base64,$iconB64"

$badgeBytes   = [IO.File]::ReadAllBytes((Join-Path $assetsDir "google-play-badge.svg"))
$badgeB64     = [Convert]::ToBase64String($badgeBytes)
$badgeDataUri = "data:image/svg+xml;base64,$badgeB64"

foreach ($size in '300x250', '320x480', '480x320', '300x300') {
    $zip     = Join-Path $dist "$size.zip"
    $srcHtml = [IO.File]::ReadAllText((Join-Path $scriptDir "$size\index.html"), [Text.Encoding]::UTF8)

    # Inject assets into placeholders
    $html = $srcHtml.Replace('__ICON_DATA_URI__',  $iconDataUri)
    $html = $html.Replace(   '__BADGE_DATA_URI__', $badgeDataUri)

    # Write injected HTML to a temp directory, then zip it
    $tmpDir  = Join-Path $env:TEMP "pipsplit-$size"
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
    [IO.File]::WriteAllText((Join-Path $tmpDir "index.html"), $html, [Text.Encoding]::UTF8)

    if (Test-Path $zip) { Remove-Item $zip }
    Push-Location $tmpDir
    Compress-Archive -Path 'index.html' -DestinationPath $zip
    Pop-Location

    Remove-Item $tmpDir -Recurse -Force

    $kb = [Math]::Round((Get-Item $zip).Length / 1024, 1)
    Write-Host "Built $size.zip  ($kb KB)"
}

Write-Host ""
Write-Host "Done - zips are in: $dist"
Write-Host "Google Ads 150 KB limit: all files should be well under it"
