$path = 'C:\Users\z\OneDrive\Desktop\Suivi Primelink\Suivi'
Set-Location $path
$files = Get-ChildItem -Filter '*.xlsx' | Select-Object -ExpandProperty Name
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
foreach ($f in $files) {
    Write-Output "FILE: $f"
    $wb = $excel.Workbooks.Open((Join-Path $path $f))
    foreach ($ws in $wb.Worksheets) {
        Write-Output " SHEET: $($ws.Name)"
        $row = @()
        for ($c = 1; $c -le 40; $c++) {
            $val = $ws.Cells.Item(1, $c).Text
            if ($null -eq $val) { break }
            $row += "[$c]=$val"
        }
        Write-Output "  HEADER: $($row -join ', ')"
        $lastRow = $ws.UsedRange.Rows.Count
        Write-Output "  USED ROWS: $lastRow"
    }
    $wb.Close($false)
}
$excel.Quit()