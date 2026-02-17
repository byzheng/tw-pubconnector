# Reorganize plugin files from flat structure to folder structure
$sourceDir = "dev/tiddlers"
$targetDir = "dev/plugins/tw-pubconnector"

# Create target directory if it doesn't exist
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# Get all .meta files
$metaFiles = Get-ChildItem -Path $sourceDir -Filter '$__plugins_bangyou_tw-pubconnector_*.meta' -File

Write-Host "Found $($metaFiles.Count) meta files to process`n"

$count = 0
foreach ($metaFile in $metaFiles) {
    # Read the meta file to get the title
    $content = Get-Content $metaFile.FullName -Raw
    if ($content -match 'title:\s+(.+)') {
        $title = $matches[1].Trim()
        # Extract path from title: $:/plugins/bangyou/tw-pubconnector/utils/literature.js
        $pattern = ':\$:/plugins/bangyou/tw-pubconnector/(.+)$'
        if ($title -match $pattern) {
            $relativePath = $matches[1]
            $targetFile = Join-Path $targetDir $relativePath
            $targetFileDir = Split-Path $targetFile
            
            # Create subdirectories
            if (!(Test-Path $targetFileDir)) {
                New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
            }
            
            # Copy the JS file
            $jsFile = $metaFile.FullName -replace '\.meta$', ''
            if (Test-Path $jsFile) {
                Copy-Item -Path $jsFile -Destination $targetFile -Force
                $count++
            }
            
            # Copy the meta file
            $targetMetaFile = $targetFile + '.meta'
            Copy-Item -Path $metaFile.FullName -Destination $targetMetaFile -Force
            
            Write-Host "✓ $relativePath"
        }
    }
}

Write-Host "`n✅ Reorganized $count JavaScript files and their meta files to $targetDir"
