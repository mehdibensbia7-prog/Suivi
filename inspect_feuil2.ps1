$path = 'C:\Users\z\OneDrive\Desktop\Suivi Primelink\Suivi'
Set-Location $path
$workbook = 'tableau statut brut.xlsx'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open((Join-Path $path $workbook))
$ws = $wb.Worksheets.Item('Feuil2')
$out = @()
$row = @()
for ($c = 1; $c -le 60; $c++) {
    $val = $ws.Cells.Item(1, $c).Text
    if ($null -eq $val) { $row += "[$c]=<empty>" } else { $row += "[$c]=$val" }
}
$out += 'HEADER: ' + ($row -join ' | ')
for ($r = 1; $r -le 10; $r++) {
    $row = @()
    for ($c = 1; $c -le 60; $c++) {
        $val = $ws.Cells.Item($r, $c).Text
        if ($null -eq $val) { $row += '' } else { $row += $val }
    }
    $out += 'ROW ' + $r + ': ' + ($row -join ' | ')
}
$wb.Close($false)
$excel.Quit()
$out | Set-Content -Path feuil2_inspect.txt -Encoding utf8