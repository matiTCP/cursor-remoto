# Vigila el portapapeles de Windows y avisa por stdout (CLIP|<base64>) cada vez que
# se copia texto nuevo. Lo lanza server.js; recibe el PID del servidor para cerrarse
# solo si el servidor muere (si no, quedaria huerfano dando vueltas).
param([int]$parentPid = 0)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace MouseFinal -Name ClipSeq -MemberDefinition @'
[DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
'@

$MAX_CHARS = 20000
# Windows sube este numero con cada cambio del portapapeles: leerlo es casi gratis,
# asi que solo se abre el portapapeles cuando de verdad cambio algo.
# Lo que ya estaba copiado al arrancar no se registra.
$lastSeq = [MouseFinal.ClipSeq]::GetClipboardSequenceNumber()
$loops = 0

function Test-ExcludedFromHistory($data) {
    # Los gestores de contrasenas marcan lo que copian para que ningun historial lo guarde
    # (el mismo criterio que usa el historial de Windows, Win+V).
    $formats = $data.GetFormats()
    if ($formats -contains 'ExcludeClipboardContentFromMonitorProcessing') { return $true }
    if ($formats -contains 'Clipboard Viewer Ignore') { return $true }
    if ($formats -contains 'CanIncludeInClipboardHistory') {
        $flag = $data.GetData('CanIncludeInClipboardHistory')
        if ($flag -is [System.IO.MemoryStream] -and $flag.Length -ge 4) {
            $buf = New-Object byte[] 4
            [void]$flag.Read($buf, 0, 4)
            if ([BitConverter]::ToInt32($buf, 0) -eq 0) { return $true }
        }
    }
    return $false
}

while ($true) {
    Start-Sleep -Milliseconds 400

    $loops++
    if ($parentPid -and ($loops % 12 -eq 0)) {
        if (-not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { exit }
    }

    $seq = [MouseFinal.ClipSeq]::GetClipboardSequenceNumber()
    if ($seq -eq $lastSeq) { continue }

    try {
        $data = [System.Windows.Forms.Clipboard]::GetDataObject()
        $lastSeq = $seq
        if ($null -eq $data) { continue }
        if (Test-ExcludedFromHistory $data) { continue }
        if (-not $data.GetDataPresent([System.Windows.Forms.DataFormats]::UnicodeText)) { continue }

        $text = [string]$data.GetData([System.Windows.Forms.DataFormats]::UnicodeText)
        if ([string]::IsNullOrWhiteSpace($text) -or $text.Length -gt $MAX_CHARS) { continue }

        [Console]::Out.WriteLine('CLIP|' + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text)))
        [Console]::Out.Flush()
    } catch {
        # Otro programa tenia tomado el portapapeles: $lastSeq no se actualizo
        # (o se reintenta en el proximo cambio), no pasa nada.
    }
}
