# Only the validated current-request HTTPS URL arrives on stdin. Never print it or pass it to a command interpreter.
$ErrorActionPreference = 'Stop'
try {
 $url = [Console]::In.ReadToEnd()
 if ($url.Length -gt 2048 -or $url -match '[\x00-\x20\x7f]') { exit 3 }
 $uri = New-Object System.Uri($url)
 if ($uri.Scheme -cne 'https' -or $uri.AbsolutePath -cne '/collaboration/qr-login' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -cnotmatch '^#[A-Za-z0-9_-]{43}$') { exit 3 }
 $start = New-Object System.Diagnostics.ProcessStartInfo
 $start.FileName = $url
 $start.UseShellExecute = $true
 $process = [System.Diagnostics.Process]::Start($start)
 if ($null -ne $process) { $process.Dispose() }
 exit 0
} catch { exit 2 }
