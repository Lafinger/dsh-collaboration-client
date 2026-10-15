param([ValidateSet('protect','unprotect')][string]$Action)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$raw=[Console]::In.ReadToEnd()
if($raw.Length -gt 32768){exit 3}
try{
 $bytes=[Convert]::FromBase64String($raw.Trim())
 $entropy=[Text.Encoding]::UTF8.GetBytes('dsh-collaboration-mvp-login-v1')
 if($Action -eq 'protect'){$out=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
 else{$out=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
 [Console]::Out.Write([Convert]::ToBase64String($out))
}catch{[Console]::Error.Write('System login vault unavailable');exit 2}
