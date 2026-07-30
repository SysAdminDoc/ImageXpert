$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'version.json') | ConvertFrom-Json).version
$dist = Join-Path $repoRoot 'dist'
$stage = Join-Path ([IO.Path]::GetTempPath()) "imagexpert-package-$version"

if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'site\extension') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'chrome') -Force | Out-Null

$siteFiles = @(
    'ImageXpert.html', 'LICENSE', 'MediaHunter_Lite.user.js', 'README.md',
    'app-core.js', 'app.css', 'app.js', 'i18n.js', 'index.html', 'manifest.webmanifest', 'sw.js', 'version.json'
)
foreach ($file in $siteFiles) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination (Join-Path $stage "site\$file")
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'modules') -Destination (Join-Path $stage 'site\modules') -Recurse
foreach ($file in @('background.js', 'icon.png', 'manifest.json')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "extension\$file") -Destination (Join-Path $stage "site\extension\$file")
    Copy-Item -LiteralPath (Join-Path $repoRoot "extension\$file") -Destination (Join-Path $stage "chrome\$file")
}

Get-ChildItem -LiteralPath $dist -Filter '*.zip' | Remove-Item -Force
$siteArchive = Join-Path $dist "ImageXpert-v$version-site.zip"
$chromeArchive = Join-Path $dist "ImageXpert-Chrome-v$version.zip"
Compress-Archive -Path (Join-Path $stage 'site\*') -DestinationPath $siteArchive -CompressionLevel Optimal
Compress-Archive -Path (Join-Path $stage 'chrome\*') -DestinationPath $chromeArchive -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Output "Created $siteArchive"
Write-Output "Created $chromeArchive"
