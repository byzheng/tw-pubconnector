$sourceDir = "dev\tiddlers"
$targetDir = "dev\plugins\tw-pubconnector"

Write-Host "Starting file reorganization..."
Write-Host "Source: $sourceDir"
Write-Host "Target: $targetDir"

$files = @(Get-ChildItem $sourceDir -Filter '$__plugins_bangyou_tw-pubconnector_*.meta')
Write-Host "Found $($files.Count) meta files"

$copied = 0
$failed = 0

foreach ($metaFile in $files) {
    try {
        $content = Get-Content $metaFile.FullName -Raw
        
        $title = $null
        foreach ($line in $content -split "`n") {
            if ($line -match '^title:') {
                $title = $line -replace '^title:\s+', ''
                break
            }
        }
        
        if ($title -and $title -match 'tw-pubconnector/(.+?)\.js') {
            $relPath = $matches[1]
            $jsSource = $metaFile.FullName -replace '\.meta$', ''
            $jsTarget = Join-Path $targetDir "$relPath.js"
            $metaTarget = "$jsTarget.meta"
            
            $targetDirectory = Split-Path $jsTarget
            if (!(Test-Path $targetDirectory)) {
                New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
            }
            
            if (Test-Path $jsSource) {
                Copy-Item $jsSource -Destination $jsTarget -Force
                Copy-Item $metaFile.FullName -Destination $metaTarget -Force
                $copied++
                Write-Host "OK: $relPath"
            }
        }
    } catch {
        $failed++
        Write-Host "Error: $_"
    }
}

Write-Host "Complete. Copied: $copied, Failed: $failed"
