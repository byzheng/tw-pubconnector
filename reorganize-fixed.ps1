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
    
    # Extract title
    foreach ($line in $content -split "`n") {
        if ($line -match '^title:') {
            $title = $line -replace '^title:\s+', ''
            break
        }
    }
    
    if ($title -match 'tw-pubconnector/(.+)$') {
        $relPath = $matches[1]
        
        # Determine what the base name should be
        $baseName = $metaFile.Name -replace '\.meta$', ''
        
        # Remove the prefix to get just the part after pubconnector_
        if ($baseName -match '_tw-pubconnector_(.+)$') {
            $suffix = $matches[1]
            
            # The corresponding JS/CSS/JSON file
            $jsFile = Join-Path $sourceDir $baseName.Replace('.meta', '')
            
            # Verify the source file exists
            if (Test-Path $jsFile) {
                $targetFile = Join-Path $targetDir $relPath
                $targetFileDir = Split-Path $targetFile
                
                # Create directory if needed
                if (!(Test-Path $targetFileDir)) {
                    New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
                }
                
                # Copy JS file
                Copy-Item -Path $jsFile -Destination $targetFile -Force
                
                # Copy meta file
                $metaTarget = Join-Path $targetDir "$relPath.meta"
                Copy-Item -Path $metaFile.FullName -Destination $metaTarget -Force
                
                $copied += 2
                Write-Host "OK: $relPath"
            }
        }
    }
}

Write-Host "`nCopied: $copied files"

# Verify
$count = (Get-ChildItem $targetDir -Recurse -File 2>$null | Measure-Object).Count
Write-Host "Total files in target: $count"
