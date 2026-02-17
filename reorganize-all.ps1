$sourceDir = "dev\tiddlers"
$targetDir = "dev\plugins\tw-pubconnector"

Write-Host "Starting comprehensive file reorganization..."

$allFiles = Get-ChildItem $sourceDir -Filter '$__plugins_bangyou_tw-pubconnector_*' -File
Write-Host "Found $($allFiles.Count) total files`n"

$copied = 0
$skipped = 0

# Group files by base name (without extension)
$grouped = @{}
foreach ($file in $allFiles) {
    $base = $file.Name -replace '\.(js|meta|css|json|tid)(\..+)?$', ''
    if (!$grouped[$base]) { $grouped[$base] = @() }
    $grouped[$base] += $file
}

Write-Host "Processing $($grouped.Count) file groups...`n"

foreach ($base in $grouped.Keys) {
    $files = $grouped[$base]
    
    # Look for a .meta file to get the title
    $metaFile = $files | Where-Object { $_.Extension -eq '.meta' }
    
    if ($metaFile) {
        $content = Get-Content $metaFile.FullName -Raw
        $title = $null
        
        foreach ($line in $content -split "`n") {
            if ($line -match '^title:') {
                $title = $line -replace '^title:\s+', ''
                break
            }
        }
        
        # Extract path from title
        if ($title -and $title -match 'tw-pubconnector/(.+)$') {
            $relPath = $matches[1]
            $targetDir2 = Split-Path (Join-Path $targetDir $relPath)
            
            # Create target directory
            if (!(Test-Path $targetDir2)) {
                New-Item -ItemType Directory -Path $targetDir2 -Force | Out-Null
            }
            
            # Copy all files in this group
            foreach ($file in $files) {
                $ext = if ($file.Extension -eq '.meta') { 
                    # For .meta, check what original extension was
                    $content | Select-String '^type:' | ForEach-Object {
                        if ($_ -like '*application/json*') { '.json.meta' }
                        else { '.js.meta' }
                    }
                    # If not found, assume .js.meta
                    if (!$_) { '.js.meta' }
                } else {
                    $file.Extension
                    if ($file.Name -like '*.js.css*') { '.css' }
                }
                
                $targetFile = Join-Path $targetDir2 "$($relPath)$ext"
                Copy-Item $file.FullName -Destination $targetFile -Force
                $copied++
            }
            
            Write-Host "OK: $relPath"
        }
    } else {
        $skipped++
    }
}

Write-Host "`nComplete. Copied: $copied, Skipped groups: $skipped"
