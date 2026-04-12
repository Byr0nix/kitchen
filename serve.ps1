# Local static server for development (ES modules need http://, not file://).
# Run: powershell -ExecutionPolicy Bypass -File .\serve.ps1
$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$port = 3000
$prefix = "http://127.0.0.1:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Could not bind port $port. Close the other app or change `$port in this script."
  throw
}

function Get-MimeType([string]$ext) {
  switch ($ext.ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".js" { return "application/javascript; charset=utf-8" }
    ".mjs" { return "application/javascript; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".svg" { return "image/svg+xml" }
    ".json" { return "application/json; charset=utf-8" }
    ".ico" { return "image/x-icon" }
    ".webp" { return "image/webp" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    default { return "application/octet-stream" }
  }
}

Write-Host "Salomatlik Bufeti - server is running."
Write-Host "Open in browser: $prefix"
Write-Host "Stop: Ctrl+C"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = $req.Url.LocalPath
    if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }
    $rel = $path.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel))
    if (-not $candidate.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403
    } elseif (-not [IO.File]::Exists($candidate)) {
      $res.StatusCode = 404
    } else {
      $bytes = [IO.File]::ReadAllBytes($candidate)
      $res.ContentType = Get-MimeType([IO.Path]::GetExtension($candidate))
      $res.ContentLength64 = $bytes.LongLength
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } finally {
    $res.Close()
  }
}
