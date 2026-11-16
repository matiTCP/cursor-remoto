# Genera el icono de la app: flecha de cursor y pulso de ECG sobre fondo oscuro.
#   ./scripts/make-icon.ps1 ./public/icon-512.png 512
# (iOS redondea las esquinas solo; el lienzo va cuadrado y lleno.)
Add-Type -AssemblyName System.Drawing

function New-AppIcon([string]$outPath, [int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gfx.ScaleTransform($size / 512.0, $size / 512.0)
    $rect = New-Object System.Drawing.Rectangle 0, 0, 512, 512

    # Fondo: bg del tema con un degradado muy suave
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
        [System.Drawing.Color]::FromArgb(255, 0x1c, 0x1f, 0x24),
        [System.Drawing.Color]::FromArgb(255, 0x0f, 0x10, 0x12), 90)
    $gfx.FillRectangle($bg, $rect)

    # Flecha del cursor (misma forma que el ícono de la pestaña Mouse)
    $arrow = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pts = @(
        (New-Object System.Drawing.PointF 150, 92),
        (New-Object System.Drawing.PointF 258, 358),
        (New-Object System.Drawing.PointF 291, 242),
        (New-Object System.Drawing.PointF 407, 209)
    )
    $arrow.AddPolygon([System.Drawing.PointF[]]$pts)
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0xe8, 0xe9, 0xec))
    $gfx.FillPath($white, $arrow)
    $edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 0xe8, 0xe9, 0xec)), 22
    $edge.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $gfx.DrawPath($edge, $arrow)

    # Pulso de ECG en el color de acento
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 0x8a, 0xa2, 0xff)), 20
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $ecg = @(
        (New-Object System.Drawing.PointF 70, 420),
        (New-Object System.Drawing.PointF 190, 420),
        (New-Object System.Drawing.PointF 220, 380),
        (New-Object System.Drawing.PointF 256, 456),
        (New-Object System.Drawing.PointF 286, 400),
        (New-Object System.Drawing.PointF 306, 420),
        (New-Object System.Drawing.PointF 442, 420)
    )
    $gfx.DrawLines($pen, [System.Drawing.PointF[]]$ecg)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose(); $bmp.Dispose()
}

New-AppIcon $args[0] ([int]$args[1])
Write-Output "Listo: $($args[0])"
