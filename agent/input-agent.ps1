# input-agent.ps1
# Proceso persistente que recibe comandos por stdin (uno por linea) y
# los traduce en movimientos de mouse / teclas reales via la API de Windows.
# No depende de ningun modulo nativo de Node: solo usa .NET, que ya viene con Windows.

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class InputSim {
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public KEYBDINPUT ki;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_UNICODE = 0x0004;
    public const uint KEYEVENTF_KEYUP = 0x0002;

    public static void MoveRelative(int dx, int dy) {
        POINT p;
        GetCursorPos(out p);
        SetCursorPos(p.X + dx, p.Y + dy);
    }

    public static void TypeUnicodeChar(char c) {
        INPUT down = new INPUT();
        down.type = INPUT_KEYBOARD;
        down.ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE, time = 0, dwExtraInfo = UIntPtr.Zero };

        INPUT up = new INPUT();
        up.type = INPUT_KEYBOARD;
        up.ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = UIntPtr.Zero };

        INPUT[] inputs = new INPUT[] { down, up };
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void KeyPress(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void KeyDown(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
    }

    public static void KeyUp(byte vk) {
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    [DllImport("user32.dll")]
    public static extern short VkKeyScanEx(char ch, IntPtr dwhkl);

    [DllImport("user32.dll")]
    public static extern IntPtr GetKeyboardLayout(uint idThread);

    public const byte VK_SHIFT = 0x10;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_MENU = 0x12;

    // Escribe un caracter simulando la tecla real (igual que las flechas/atajos),
    // que es mucho mas compatible con juegos y reproductores a pantalla completa
    // que el metodo de "paquete unicode" (SendInput+KEYEVENTF_UNICODE).
    // Devuelve false si el caracter no existe en la distribucion de teclado actual.
    public static bool TypeCharViaKey(char c) {
        IntPtr layout = GetKeyboardLayout(0);
        short scan = VkKeyScanEx(c, layout);
        if (scan == -1) return false;

        byte vk = (byte)(scan & 0xFF);
        byte state = (byte)((scan >> 8) & 0xFF);
        bool shift = (state & 1) != 0;
        bool ctrl = (state & 2) != 0;
        bool alt = (state & 4) != 0;

        if (shift) KeyDown(VK_SHIFT);
        if (ctrl) KeyDown(VK_CONTROL);
        if (alt) KeyDown(VK_MENU);

        KeyPress(vk);

        if (alt) KeyUp(VK_MENU);
        if (ctrl) KeyUp(VK_CONTROL);
        if (shift) KeyUp(VK_SHIFT);

        return true;
    }

    // --- Brillo de pantalla via DDC/CI (monitores/TVs que lo soporten por HDMI) ---
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct PHYSICAL_MONITOR {
        public IntPtr hPhysicalMonitor;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szPhysicalMonitorDescription;
    }

    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint pdwNumberOfPhysicalMonitors);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint dwPhysicalMonitorArraySize, [Out] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool SetMonitorBrightness(IntPtr hMonitor, uint dwNewBrightness);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool GetMonitorBrightness(IntPtr hMonitor, out uint pdwMinimumBrightness, out uint pdwCurrentBrightness, out uint pdwMaximumBrightness);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool DestroyPhysicalMonitor(IntPtr hMonitor);

    public const uint MONITOR_DEFAULTTONEAREST = 2;

    public static bool SetBrightness(uint percent) {
        IntPtr hMonitor = MonitorFromWindow(GetDesktopWindow(), MONITOR_DEFAULTTONEAREST);
        uint count;
        if (!GetNumberOfPhysicalMonitorsFromHMONITOR(hMonitor, out count) || count == 0) return false;

        PHYSICAL_MONITOR[] monitors = new PHYSICAL_MONITOR[count];
        if (!GetPhysicalMonitorsFromHMONITOR(hMonitor, count, monitors)) return false;

        bool anyOk = false;
        foreach (var mon in monitors) {
            uint min, cur, max;
            if (GetMonitorBrightness(mon.hPhysicalMonitor, out min, out cur, out max)) {
                uint target = min + (uint)((max - min) * (percent / 100.0));
                if (SetMonitorBrightness(mon.hPhysicalMonitor, target)) anyOk = true;
            }
            DestroyPhysicalMonitor(mon.hPhysicalMonitor);
        }
        return anyOk;
    }
}
"@

function Send-Click([string]$button) {
    switch ($button) {
        'left'   { [InputSim]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); [InputSim]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) }
        'right'  { [InputSim]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero); [InputSim]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero) }
        'middle' { [InputSim]::mouse_event(0x0020, 0, 0, 0, [UIntPtr]::Zero); [InputSim]::mouse_event(0x0040, 0, 0, 0, [UIntPtr]::Zero) }
        'x1'     { [InputSim]::mouse_event(0x0080, 0, 0, 1, [UIntPtr]::Zero); [InputSim]::mouse_event(0x0100, 0, 0, 1, [UIntPtr]::Zero) }
        'x2'     { [InputSim]::mouse_event(0x0080, 0, 0, 2, [UIntPtr]::Zero); [InputSim]::mouse_event(0x0100, 0, 0, 2, [UIntPtr]::Zero) }
    }
}

function Send-Scroll([int]$amount) {
    # La rueda usa dwData con signo (negativo = hacia abajo), pero la firma es uint:
    # [uint32] de un negativo tira error en PowerShell, asi que se reinterpretan los bits.
    $data = [BitConverter]::ToUInt32([BitConverter]::GetBytes($amount), 0)
    [InputSim]::mouse_event(0x0800, 0, 0, $data, [UIntPtr]::Zero)
}

$keyMap = @{
    'ESCAPE'           = 0x1B
    'F'                = 0x46
    'UP'               = 0x26
    'DOWN'             = 0x28
    'LEFT'             = 0x25
    'RIGHT'            = 0x27
    'BACKSPACE'        = 0x08
    'ENTER'            = 0x0D
    'TAB'              = 0x09
    'VOLUME_UP'        = 0xAF
    'VOLUME_DOWN'      = 0xAE
    'VOLUME_MUTE'      = 0xAD
    'MEDIA_PLAY_PAUSE' = 0xB3
    'BROWSER_BACK'     = 0xA6
    'BROWSER_FORWARD'  = 0xA7
    # Modificadores y teclas usadas en combos (ALT+TAB, CTRL+C, etc.)
    'CTRL'             = 0x11
    'ALT'              = 0x12
    'SHIFT'            = 0x10
    'WIN'              = 0x5B
    'A'                = 0x41
    'C'                = 0x43
    'V'                = 0x56
    'X'                = 0x58
    'Z'                = 0x5A
    'DELETE'           = 0x2E
    'F5'               = 0x74
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Length -eq 0) { continue }

    $parts = $line.Split('|')
    $cmd = $parts[0]

    try {
        switch ($cmd) {
            'MOVE' {
                [InputSim]::MoveRelative([int]$parts[1], [int]$parts[2])
            }
            'CLICK' {
                Send-Click $parts[1]
            }
            'SCROLL' {
                Send-Scroll ([int]$parts[1])
            }
            'KEY' {
                $code = $parts[1]
                if ($code -match '\+') {
                    # Combo tipo CTRL+C o ALT+TAB: se mantienen presionados los
                    # modificadores, se pulsa la tecla principal y se sueltan
                    # los modificadores en orden inverso.
                    $keys = $code -split '\+'
                    $mainKey = $keys[$keys.Length - 1]
                    $modifiers = $keys[0..($keys.Length - 2)]

                    foreach ($m in $modifiers) {
                        if ($keyMap.ContainsKey($m)) { [InputSim]::KeyDown([byte]$keyMap[$m]) }
                    }
                    if ($keyMap.ContainsKey($mainKey)) { [InputSim]::KeyPress([byte]$keyMap[$mainKey]) }
                    for ($i = $modifiers.Length - 1; $i -ge 0; $i--) {
                        if ($keyMap.ContainsKey($modifiers[$i])) { [InputSim]::KeyUp([byte]$keyMap[$modifiers[$i]]) }
                    }
                } elseif ($keyMap.ContainsKey($code)) {
                    [InputSim]::KeyPress([byte]$keyMap[$code])
                }
            }
            'BRIGHTNESS' {
                $percent = [int]$parts[1]
                if ($percent -lt 0) { $percent = 0 }
                if ($percent -gt 100) { $percent = 100 }
                [InputSim]::SetBrightness([uint32]$percent) | Out-Null
            }
            'CLIP' {
                # Pone texto en el portapapeles de Windows (para "Pegar" desde el baul).
                # Los saltos de linea se pasan a CRLF, que es lo que esperan los programas de Windows.
                $bytes = [Convert]::FromBase64String($parts[1])
                $text = [System.Text.Encoding]::UTF8.GetString($bytes) -replace "`r?`n", "`r`n"
                for ($try = 0; $try -lt 5; $try++) {
                    try { Set-Clipboard -Value $text -ErrorAction Stop; break }
                    catch { Start-Sleep -Milliseconds 60 } # otro programa lo tenia tomado
                }
            }
            'TYPE' {
                $bytes = [Convert]::FromBase64String($parts[1])
                $text = [System.Text.Encoding]::UTF8.GetString($bytes)
                foreach ($ch in $text.ToCharArray()) {
                    # Preferimos simular la tecla real (compatible con juegos/pantalla completa);
                    # si el caracter no existe en la distribucion actual (emoji, simbolos raros),
                    # caemos al metodo unicode como respaldo.
                    $ok = [InputSim]::TypeCharViaKey($ch)
                    if (-not $ok) { [InputSim]::TypeUnicodeChar($ch) }
                }
            }
        }
    } catch {
        # Ignoramos lineas mal formadas para que el agente nunca se caiga.
    }
}
