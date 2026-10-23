$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$portable = Join-Path $root 'sandbox\rust-tools'
$compiler = Get-Command rustc -ErrorAction SilentlyContinue
if ($compiler) { $rustc = $compiler.Source }
elseif (Test-Path (Join-Path $portable 'cargo\bin\rustc.exe')) {
  $env:RUSTUP_HOME = Join-Path $portable 'rustup'
  $env:CARGO_HOME = Join-Path $portable 'cargo'
  $rustc = Join-Path $portable 'cargo\bin\rustc.exe'
} else { throw 'Install Rust and its wasm32-unknown-unknown target to rebuild the reader kernels.' }
& $rustc (Join-Path $PSScriptRoot 'scan-kernels.rs') --edition=2021 --target wasm32-unknown-unknown --crate-type cdylib -C opt-level=3 -C panic=abort -C link-arg=--export=__heap_base -C link-arg=--max-memory=134217728 -C strip=symbols -o (Join-Path $root 'js\scan-kernels.wasm')
if ($LASTEXITCODE -ne 0) { throw 'Reader kernel build failed. Run rustup target add wasm32-unknown-unknown if the target is missing.' }
Get-FileHash (Join-Path $root 'js\scan-kernels.wasm') -Algorithm SHA256
