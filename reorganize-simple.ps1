$sourceDir = "dev\tiddlers"
$targetDir = "dev\plugins\tw-pubconnector"

Write-Host "Starting file reorganization..."

# Get all meta files
$metaFiles = Get-ChildItem $sourceDir -Filter '$__plugins_bangyou_tw-pubconnector_*.meta' -File
Write-Host "Found $($metaFiles.Count) meta files`n"

$copied = 0

foreach ($metaFile in $metaFiles) {
    $content = Get-Content $metaFile.FullName -Raw
    $title = ""
    
    foreach ($line in $content -split "`n") {
        if ($line -match '^title:') {
            $title = $line -replace '^title:\s+', ''
            break
        }
    }
    
    if ($title -match 'tw-pubconnector/(.+)$') {
        $relPath = $matches[1]
        $jsFileName = $relPath
        
        # Handle different file extensions
        if ($relPath -like '*.js') {
            $jsFile = Join-Path $sourceDir "$($relPath -replace '\.js$', '').js"
        } elseif ($relPath -like '*.css') {
            $jsFile = Join-Path $sourceDir "$($relPath -replace '\.css$', '').css"
        } else {
            $jsFile = Join-Path $sourceDir "$relPath.js"
        }
        
        # Check if JS file exists
        if (!(Test-Path $jsFile)) {
            # Try alternative extensions
            if (Test-Path "$jsFile.css") {
                $jsFile = "$jsFile.css"
            } elseif (Test-Path "$jsFile.json") {
                $jsFile = "$jsFile.json"  
            }
        }
        
        if (Test-Path $jsFile) {
            $targetFile = Join-Path $targetDir $jsFileName
            $targetFileDir = Split-Path $targetFile
            
            # Create directory if needed
            if (!(Test-Path $targetFileDir)) {
                New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
            }
            
            # Copy JS file
            Copy-Item -Path $jsFile -Destination $targetFile -Force
            
            # Copy meta file
            $metaFileName = "$jsFileName.meta"
            $metaTarget = Join-Path $targetDir $metaFileName
            Copy-Item -Path $metaFile.FullName -Destination $metaTarget -Force
            
            $copied += 2
            Write-Host "OK: $jsFileName"
        }
    }
}

Write-Host "`nCopied $copied files"

# Verify
$count = (Get-ChildItem $targetDir -Recurse -File).Count
Write-Host "Total files in target: $count"
