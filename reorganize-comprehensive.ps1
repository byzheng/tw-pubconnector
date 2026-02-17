$sourceDir = "dev\tiddlers"
$targetDir = "dev\plugins\tw-pubconnector"

Write-Host "Comprehensive file reorganization..."
Write-Host "Processing all $__plugins_bangyou_tw-pubconnector_* files`n"

$allFiles = Get-ChildItem $sourceDir -Filter '$__plugins_bangyou_tw-pubconnector_*' -File
Write-Host "Found $($allFiles.Count) total files`n"

$copied = 0
$skipped = @()

# Keep track of what we've already processed to avoid duplicates
$processed = @{}

# First pass: process files with .meta companions
foreach ($metaFile in ($allFiles | Where-Object { $_.Name -like '*.meta' })) {
    $baseName = $metaFile.Name -replace '\.meta$', ''
    $jsFile = Get-ChildItem $sourceDir -Filter $baseName -File | Select-Object -First 1
    
    if ($jsFile) {
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
            $targetFile = Join-Path $targetDir $relPath
            $targetFileDir = Split-Path $targetFile
            
            if (!(Test-Path $targetFileDir)) {
                New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
            }
            
            Copy-Item -Path $jsFile.FullName -Destination $targetFile -Force
            Copy-Item -Path $metaFile.FullName -Destination "$targetFile.meta" -Force
            
            $processed[$baseName] = $true
            $processed[$metaFile.Name] = $true
            $copied += 2
            Write-Host "OK: $relPath"
        }
    }
}

Write-Host "`nPhase 1 done. Now processing remaining files...`n"

# Second pass: process files with embedded metadata
foreach ($file in $allFiles) {
    if ($processed[$file.Name]) { continue }
    
    # Try to extract title from embedded metadata
    if ($file.Extension -eq '.js' -or $file.Extension -eq '.css') {
        $firstLine = (Get-Content $file.FullName -TotalCount 5) -join "`n"
        if ($firstLine -match 'title:\s+\$:/plugins/bangyou/tw-pubconnector/(.+?)\.') {
            $relPath = $matches[1]
            if ($file.Extension -eq '.js') { $relPath = "$relPath.js" }
            else { $relPath = "$relPath.css" }
            
            $targetFile = Join-Path $targetDir $relPath
            $targetFileDir = Split-Path $targetFile
            
            if (!(Test-Path $targetFileDir)) {
                New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
            }
            
            Copy-Item -Path $file.FullName -Destination $targetFile -Force
            $copied++
            
            # Check if there's a corresponding .meta without title
            $metaFile = Get-ChildItem $sourceDir -Filter "$($file.Name).meta" -File
            if ($metaFile) {
                Copy-Item -Path $metaFile.FullName -Destination "$targetFile.meta" -Force
                $copied++
            }
            
            Write-Host "OK (embedded): $relPath"
            $processed[$file.Name] = $true
        }
    }
    elseif ($file.Extension -eq '.json') {
        # JSON files might not have standard metadata
        if ($file.Name -like '*config*') {
            $relPath = "config/$($file.BaseName).json"
            $targetFile = Join-Path $targetDir $relPath
            $targetFileDir = Split-Path $targetFile
            
            if (!(Test-Path $targetFileDir)) {
                New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
            }
            
            Copy-Item -Path $file.FullName -Destination $targetFile -Force
            $copied++
            
            # Copy corresponding .meta if exists
            $metaFile = Get-ChildItem $sourceDir -Filter "$($file.Name).meta" -File
            if ($metaFile) {
                Copy-Item -Path $metaFile.FullName -Destination "$targetFile.meta" -Force
                $copied++
            }
            
            Write-Host "OK (config): $relPath"
            $processed[$file.Name] = $true
        }
    }
}

Write-Host "`nPhase 2 done. Processing remaining .js files without meta...`n"

# Third pass: process .js files without meta files  
foreach ($file in ($allFiles | Where-Object { $_.Extension -eq '.js' -and !$processed[$_.Name] })) {
    # Extract info from the file name itself
    if ($file.Name -match '_tw-pubconnector_(.+?)\.js$') {
        $suffix = $matches[1]
        $relPath = "$suffix.js"
        
        # Determine folder based on suffix
        $folder = if ($suffix -like 'startup*') { 'startup' }
                  elseif ($suffix -like 'api*') { 'api' }
                  elseif ($suffix -like 'route*') { 'route' }
                  elseif ($suffix -like 'widget*') { 'widget' }
                  elseif ($suffix -like 'utils*') { 'utils' }
                  elseif ($suffix -like 'style*') { 'style' }
                  else { 'other' }
        
        $relPath = "$folder/$($suffix.Substring($folder.Length + 1)).js"
        $targetFile = Join-Path $targetDir $relPath
        $targetFileDir = Split-Path $targetFile
        
        if (!(Test-Path $targetFileDir)) {
            New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
        }
        
        Copy-Item -Path $file.FullName -Destination $targetFile -Force
        $copied++
        Write-Host "OK (fallback): $relPath"
        $processed[$file.Name] = $true
    }
}

Write-Host "`nTotal copied: $copied items"
$count = (Get-ChildItem $targetDir -Recurse -File 2>$null | Measure-Object).Count
Write-Host "Total files in target: $count"
