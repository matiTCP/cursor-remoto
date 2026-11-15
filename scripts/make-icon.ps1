# Genera el icono de la app sobre el fondo del tema.
#   ./scripts/make-icon.ps1 ./public/icon-512.png 512            (licker, por defecto)
#   ./scripts/make-icon.ps1 ./public/icon-512.png 512 stars      (badge de S.T.A.R.S.)
Add-Type -AssemblyName System.Drawing

function New-IconCanvas([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gfx.ScaleTransform($size / 512.0, $size / 512.0)
    $rect = New-Object System.Drawing.Rectangle 0, 0, 512, 512

    # Fondo del tema: negro calido con halo rojo
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 0x18, 0x12, 0x10),
        [System.Drawing.Color]::FromArgb(255, 0x05, 0x04, 0x04), 90)
    $gfx.FillRectangle($bg, $rect)

    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(16, 16, 480, 480)
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glow.CenterPoint = New-Object System.Drawing.PointF(256, 250)
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(140, 0xB8, 0x1D, 0x24)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0xB8, 0x1D, 0x24))
    $gfx.FillRectangle($glow, $rect)
    return $bmp, $gfx
}

function New-StarsIcon([string]$outPath, [int]$size) {
    $badgePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\img\re\stars.png'
    $badge = [System.Drawing.Image]::FromFile($badgePath)
    $bmp, $gfx = New-IconCanvas $size

    # Badge centrado, ocupando ~76% del lienzo
    $target = 388.0
    $scale = [Math]::Min($target / $badge.Width, $target / $badge.Height)
    $dw = $badge.Width * $scale
    $dh = $badge.Height * $scale
    $gfx.DrawImage($badge, [single](256 - $dw / 2), [single](256 - $dh / 2), [single]$dw, [single]$dh)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose(); $bmp.Dispose(); $badge.Dispose()
}

function New-LickerIcon([string]$outPath, [int]$size) {
    # public/img/licker.png: el licker ya recortado y recoloreado (tono carne cruda)
    $figPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\img\licker.png'
    $fig = [System.Drawing.Image]::FromFile($figPath)
    $bmp, $gfx = New-IconCanvas $size

    # Solo cabeza + lengua; el cuello sale por el borde inferior
    $srcRect = New-Object System.Drawing.Rectangle 28, 12, 210, 290
    $scale = (512 - 34) / 290.0
    $dw = 210 * $scale; $dh = 290 * $scale
    $dst = New-Object System.Drawing.RectangleF ([single](256 - $dw / 2 + 6)), 34, ([single]$dw), ([single]$dh)
    $gfx.DrawImage($fig, $dst, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    # Sombra abajo para que el corte del cuello se funda con el fondo
    $fadeRect = New-Object System.Drawing.Rectangle 0, 400, 512, 113
    $fade = New-Object System.Drawing.Drawing2D.LinearGradientBrush($fadeRect,
        [System.Drawing.Color]::FromArgb(0, 5, 4, 4), [System.Drawing.Color]::FromArgb(235, 5, 4, 4), 90)
    $gfx.FillRectangle($fade, $fadeRect)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose(); $bmp.Dispose(); $fig.Dispose()
}

if ($args[2] -eq 'stars') { New-StarsIcon $args[0] ([int]$args[1]) }
else { New-LickerIcon $args[0] ([int]$args[1]) }
Write-Output "Listo: $($args[0])"
