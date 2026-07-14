$expectedFile='expected_mapping.json'
$inspectFile='inspect_output.json'
$outCompare='compare_report_auto.json'
$outRules='rules_report_auto.json'
if(-not (Test-Path $expectedFile)) { Write-Output 'MISSING_EXPECTED'; exit 2 }
if(-not (Test-Path $inspectFile)) { Write-Output 'MISSING_INSPECT'; exit 3 }
$expected = Get-Content $expectedFile -Raw -Encoding UTF8 | ConvertFrom-Json
$inspect = Get-Content $inspectFile -Raw -Encoding UTF8 | ConvertFrom-Json
function idx($arr,$pattern){ for($i=0;$i -lt $arr.Count;$i++){ $cell = $arr[$i]; if($cell -ne $null){ $s = $cell.ToString().ToLower(); if($s -match $pattern){ return $i } } } return -1 }
$crmMap = @{}
$crmSource = @{}
$salesSet = @{}
$paidMap = @{}

foreach($file in $inspect){
  foreach($sheet in $file.sheets){
    $rows = $sheet.rows
    if(-not $rows){ continue }
    $header = $rows[0]
    if(-not $header){ continue }
    $refIdx = idx $header 'ref souscrip|ref souscri|ref souscr|ref souscription'
    $etatIdx = idx $header 'etat|statut'
    $dateActIdx = idx $header 'date activation|date activ'
    $contractIdx = idx $header 'numero contrat energie|numero contrat|numero contrat|num\.? contrat|ref souscription'
    $consoIdx = idx $header 'contrat conso|num\.? contrat conso|numero contrat conso'
    $payeBrutIdx = idx $header 'paye brut|brut paye|paye brut|paye'

    if($refIdx -ge 0 -and $etatIdx -ge 0){
      for($r=1;$r -lt $rows.Count;$r++){
        $row = $rows[$r]
        if(-not $row){ continue }
        $ref = $row[$refIdx]
        if($ref -eq $null){ continue }
        $refClean = ($ref.ToString() -replace '[^0-9]','').Trim()
        if($refClean -eq ''){ continue }
        if($row[$etatIdx] -ne $null){ $etat = $row[$etatIdx].ToString().Trim() } else { $etat = '' }
        $crmMap[$refClean] = $etat
        $crmSource[$refClean] = "$($file.file):$($sheet.name)"
      }
    }

    if($contractIdx -ge 0 -or $consoIdx -ge 0){
      $col = if($contractIdx -ge 0){ $contractIdx } else { $consoIdx }
      for($r=1;$r -lt $rows.Count;$r++){
        $row = $rows[$r]
        if(-not $row){ continue }
        $cell = $row[$col]
        if($cell -eq $null){ continue }
        $s = $cell.ToString()
        if($s -match '\d{5,}'){
          $matches = [regex]::Matches($s,'\d{5,}')
          foreach($m in $matches){ $num=$m.Value.Trim(); $salesSet[$num]=1 }
        }
      }
    }

    if($payeBrutIdx -ge 0 -and ($contractIdx -ge 0 -or $consoIdx -ge 0)){
      $col2 = $payeBrutIdx
      $colId = if($contractIdx -ge 0){ $contractIdx } else { $consoIdx }
      for($r=1;$r -lt $rows.Count;$r++){
        $row=$rows[$r]
        if(-not $row){ continue }
        $idcell = $row[$colId]
        if($idcell -eq $null){ continue }
        $sids = [regex]::Matches($idcell.ToString(),'\d{5,}')
        if($sids.Count -eq 0){ continue }
        $val = $row[$col2]
        foreach($m in $sids){ $num=$m.Value.Trim(); if($val -ne $null -and $val.ToString().Trim() -ne ''){ $paidMap[$num] = $val.ToString().Trim() } }
      }
    }
  }
}

$details = @()
function Remove-Diacritics($s){
  if(-not $s){ return $s }
  $sb = New-Object System.Text.StringBuilder
  $norm = $s.Normalize([System.Text.NormalizationForm]::FormD)
  foreach($c in $norm.ToCharArray()){
    if([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark){ $null = $sb.Append($c) }
  }
  return $sb.ToString().Normalize([System.Text.NormalizationForm]::FormC)
}
foreach($m in $expected.mappings){
  $contract = $m.contract.ToString()
  $expectedStatus = $m.expectedStatus
  if($crmMap.ContainsKey($contract)){ $actual = $crmMap[$contract] } elseif($salesSet.ContainsKey($contract)){ $actual = 'Found-NoCRM' } else { $actual = 'Introuvable' }
  $match = $false
  $actVal = if($actual){ $actual.ToString() } else { '' }
  $expVal = if($expectedStatus){ $expectedStatus.ToString() } else { '' }
  $actNorm = Remove-Diacritics($actVal.ToLower())
  $expNorm = Remove-Diacritics($expVal.ToLower())
  if($actNorm -ne '' -and $actNorm -ne 'introuvable'){
    $actAscii = ($actNorm -replace '[^a-z0-9]','')
    $expAscii = ($expNorm -replace '[^a-z0-9]','')
    if($actAscii -ne '' -and $expAscii -ne '' -and ($actAscii.Contains($expAscii) -or $expAscii.Contains($actAscii))){ $match = $true }
  }
  if(($expectedStatus -eq 'Introuvable (CRM)') -and $actual -eq 'Introuvable'){ $match = $true }
  $details += [pscustomobject]@{ contract=$contract; expected=$expectedStatus; actual=$actual; match=$match }
}
$summary = [pscustomobject]@{ generatedAt=(Get-Date).ToString('o'); total=$details.Count; matches=($details | Where-Object {$_.match}).Count; details=$details }
$summary | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $outCompare
Write-Output "COMPARE_DONE: $($summary.matches)/$($summary.total)"

$issues = @()
foreach($k in $crmMap.Keys){
  $etat = $crmMap[$k]
  $etatN = $etat.ToLower()
  $isChute = $etatN -match 'annul|resil|retract|refus'
  $paid = $paidMap.ContainsKey($k)
  if($isChute -and $paid){ $issues += [pscustomobject]@{contract=$k; issue='Annulation après paiement'; etat=$etat; paid=$paidMap[$k]; source=$crmSource[$k]} }
}
$rulesReport = [pscustomobject]@{ generatedAt=(Get-Date).ToString('o'); checkedContracts=(($crmMap.Keys + $salesSet.Keys) | Sort-Object | Get-Unique).Count; totalIssues=$issues.Count; issues=$issues }
$rulesReport | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $outRules
Write-Output "RULES_DONE: $($rulesReport.totalIssues) anomalies"
Write-Output "OUTPUTS: $outCompare , $outRules"
