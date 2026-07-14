$path = 'C:\Users\z\OneDrive\Desktop\Suivi Primelink\Suivi'
Set-Location $path
$files = Get-ChildItem -Filter '*.xlsx' | Select-Object -ExpandProperty Name
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$out = @()
foreach ($f in $files) {
    $full = Join-Path $path $f
    if (-Not (Test-Path $full)) {
        $out += @{ file = $f; error = 'missing' }
        continue
    }
    $wb = $excel.Workbooks.Open($full)
    $sheets = @()
    foreach ($ws in $wb.Worksheets) {
        $rows = @()
        for ($r = 1; $r -le 7; $r++) {
            $row = @()
            for ($c = 1; $c -le 20; $c++) {
                $val = $ws.Cells.Item($r, $c).Text
                if ($null -eq $val) { $row += '' } else { $row += $val }
            }
            $rows += ,$row
        }
        $sheets += @{ name = $ws.Name; rows = $rows }
    }
    $wb.Close($false)
    $out += @{ file = $f; sheets = $sheets }
}
$excel.Quit()
$out | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 inspect_output.json