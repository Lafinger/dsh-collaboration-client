# Current-request URL arrives only over stdin. Never write it to output or a temporary file.
$ErrorActionPreference = 'Stop'
try {
 $url = [Console]::In.ReadToEnd()
 if ($url.Length -gt 8192 -or $url -match '[\x00-\x20\x7f]') { exit 3 }
 $uri = New-Object System.Uri($url)
 if ($uri.Scheme -cne 'dingtalk' -or $uri.Host -cne 'dingtalkclient' -or $uri.AbsolutePath -cne '/action/openapp' -or $uri.UserInfo -or $uri.Fragment) { exit 3 }
 $start = New-Object System.Diagnostics.ProcessStartInfo
 $start.FileName = $url
 $start.UseShellExecute = $true
 # Invoke only Windows' registered handler. Do not inspect DingTalk account data or change URL associations.
 $process = [System.Diagnostics.Process]::Start($start)
 if ($null -ne $process) { $process.Dispose() }
 exit 0
} catch {
 # No raw exception/URL/arguments printed; JS returns a fixed sanitized action message.
 exit 2
}
