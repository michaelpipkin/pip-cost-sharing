#!/usr/bin/env bash
# Build PipSplit HTML5 ad assets — delegates to build.ps1 (Windows-compatible)
# Run from project root: bash ads/html5/build.sh
# Or directly:           pwsh ads/html5/build.ps1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS_SCRIPT="$(cygpath -w "$SCRIPT_DIR/build.ps1")"

powershell.exe -ExecutionPolicy Bypass -File "$PS_SCRIPT"
