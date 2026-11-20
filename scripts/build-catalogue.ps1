# Usage: ./scripts/build-catalogue.ps1 -Root <FModel Output\Exports folder>
# See docs/game-data/extraction.md. Writes into data/raw/ of this checkout.
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$Out = (Join-Path $PSScriptRoot '..\data\raw')
)
$ErrorActionPreference = 'Stop'
$root = $Root
$out  = $Out
New-Item -ItemType Directory -Force -Path $out | Out-Null

function Clean-Name([string]$n) { return ($n -replace '_\d+_[0-9A-F]{32}$', '') }

function Get-Text($v) {
    if ($null -eq $v) { return $null }
    if ($v -is [string]) { return $v }
    if ($v.PSObject.Properties.Name -contains 'SourceString') { return $v.SourceString }
    return $null
}

function Get-Prop($props, [string]$want) {
    foreach ($p in $props.PSObject.Properties) {
        if ((Clean-Name $p.Name) -eq $want) { return $p.Value }
    }
    return $null
}

# A tiered object's CDO often overrides only part of PurchaseInfo; Name,
# Description and Price live on the CDO its "Template" points to (not the
# SuperStruct parent). Follow the Template chain until each field is found.
function Resolve-PurchaseInfo($cdo, [string]$root) {
    $result = [ordered]@{ displayName = $null; description = $null; price = $null }
    $seen = New-Object System.Collections.Generic.HashSet[string]
    $current = $cdo
    while ($current -and $seen.Add($current.Name)) {
        $pi = Get-Prop $current.Properties 'PurchaseInfo'
        if ($pi) {
            if (-not $result.displayName) { $result.displayName = Get-Text (Get-Prop $pi 'Name') }
            if (-not $result.description) { $result.description = Get-Text (Get-Prop $pi 'Description') }
            if ($null -eq $result.price) {
                $pr = Get-Prop $pi 'Price'
                if ($pr -is [int] -or $pr -is [double] -or $pr -is [long]) { $result.price = $pr }
            }
        }
        if ($result.displayName -and $result.description -and $null -ne $result.price) { break }

        $template = $current.Template
        if (-not $template) { break }
        $tpath = ($template.ObjectPath -replace '\.\d+$')
        $tfile = (Join-Path $root (($tpath -replace '^/Game/', 'parcel\Content\') -replace '/', '\')) + '.json'
        if (-not (Test-Path $tfile)) { break }
        $tj = Get-Content $tfile -Raw | ConvertFrom-Json
        $current = $tj | Where-Object { $_.Name -like 'Default__*' } | Select-Object -First 1
    }
    return $result
}

# Shop object catalogue.
$mm = Get-Content (Join-Path $root 'parcel\Content\Core\Blueprints\Framework\Managers\AC_MoneyManager.json') -Raw | ConvertFrom-Json
$order = 0
$catalogue = foreach ($it in $mm[0].Properties.ShopItems) {
    $order++
    $cls  = $it.ObjectName -replace "^BlueprintGeneratedClass'" -replace "_C'$"
    $gpath = $it.ObjectPath -replace '\.\d+$'
    $file = (Join-Path $root (($gpath -replace '^/Game/', 'parcel\Content\') -replace '/', '\')) + '.json'

    $entry = [ordered]@{
        id           = $cls
        shopOrder    = $order
        assetPath    = $gpath
        displayName  = $null
        description  = $null
        price        = $null
        upgradePrice = $null
        speed        = $null
        inheritsFrom = $null
    }
    if (-not (Test-Path $file)) { $entry.note = 'export absent'; [pscustomobject]$entry; continue }

    $j   = Get-Content $file -Raw | ConvertFrom-Json
    $bgc = $j | Where-Object { $_.Type -eq 'BlueprintGeneratedClass' } | Select-Object -First 1
    if ($bgc.SuperStruct) { $entry.inheritsFrom = ($bgc.SuperStruct.ObjectName -replace "^[A-Za-z]+'" -replace "'$") }

    $cdo = $j | Where-Object { $_.Name -like 'Default__*' } | Select-Object -First 1
    if ($cdo) {
        $p  = $cdo.Properties
        $resolved = Resolve-PurchaseInfo $cdo $root
        $entry.displayName = $resolved.displayName
        $entry.description = $resolved.description
        $entry.price       = $resolved.price
        $up = Get-Prop $p 'UpgradePrice'; if ($up -ne $null) { $entry.upgradePrice = $up }
        $sp = Get-Prop $p 'Speed';        if ($sp -is [double] -or $sp -is [int]) { $entry.speed = $sp }
    }
    [pscustomobject]$entry
}
# UTF-8 without BOM: PowerShell 5.1's Set-Content -Encoding utf8 writes one,
# and Node's JSON.parse rejects it.
$json = $catalogue | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText(
    (Join-Path $out 'shop-items.json'),
    $json,
    (New-Object System.Text.UTF8Encoding $false)
)

# Useful DataTables, copied as is.
$tables = @{
    'upgrades-legacy'    = 'parcel\Content\Core\Blueprints\Widgets\Dashboard\Components\Upgrades\DT_Upgrades.json'
    'upgrades-tiered'    = 'parcel\Content\Core\Blueprints\Widgets\Dashboard\Components\Upgrades\DT_TieredUpgrades.json'
    'licences'           = 'parcel\Content\Core\Blueprints\Framework\Managers\Money\DT_Licences.json'
    'licence-for-tier'   = 'parcel\Content\Core\Blueprints\Actors\WarehouseTile\DT_RequiredLicenceForTier.json'
    'cargo-types'        = 'parcel\Content\Core\Blueprints\Data\Criteria\CargoType\DT_CargoTypes.json'
    'countries'          = 'parcel\Content\Core\Blueprints\Data\Criteria\Country\DT_Countries.json'
    'flooring'           = 'parcel\Content\Core\Blueprints\Widgets\Flooring\DT_FlooringOptions.json'
}
foreach ($k in $tables.Keys) {
    $f = Join-Path $root $tables[$k]
    if (-not (Test-Path $f)) { Write-Output "MANQUE: $k"; continue }
    Copy-Item $f (Join-Path $out ("dt-$k.json")) -Force
}

Write-Output ("objets catalogues : " + $catalogue.Count)
Write-Output ("avec un prix      : " + (($catalogue | Where-Object { $null -ne $_.price }).Count))
Write-Output ("sans prix         : " + (($catalogue | Where-Object { $null -eq $_.price }).Count))
Write-Output ("avec upgradePrice : " + (($catalogue | Where-Object { $null -ne $_.upgradePrice }).Count))
Write-Output ("avec speed        : " + (($catalogue | Where-Object { $null -ne $_.speed }).Count))
Write-Output "--- sans prix ---"
$catalogue | Where-Object { $null -eq $_.price } | ForEach-Object { "  " + $_.id + "   herite de: " + $_.inheritsFrom }
