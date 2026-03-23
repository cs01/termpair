#!/bin/sh
set -eu

REPO="cs01/termpair"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  os="unknown-linux-gnu" ;;
    Darwin) os="apple-darwin" ;;
    MINGW*|MSYS*|CYGWIN*) echo "On Windows, download from https://github.com/${REPO}/releases" >&2; exit 1 ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac

  echo "${arch}-${os}"
}

get_latest_version() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//'
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//'
  else
    echo "Neither curl nor wget found" >&2; exit 1
  fi
}

download() {
  url="$1"; dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  else
    wget -qO "$dest" "$url"
  fi
}

verify_checksum() {
  archive="$1"; expected_name="$2"; checksums_file="$3"

  expected=$(grep "$expected_name" "$checksums_file" | awk '{print $1}')
  if [ -z "$expected" ]; then
    echo "warning: no checksum found for $expected_name, skipping verification" >&2
    return 0
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$archive" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$archive" | awk '{print $1}')
  else
    echo "warning: no sha256sum or shasum found, skipping verification" >&2
    return 0
  fi

  if [ "$actual" != "$expected" ]; then
    echo "error: checksum mismatch for $expected_name" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    exit 1
  fi
  echo "Checksum verified."
}

main() {
  platform="$(detect_platform)"
  version="${VERSION:-$(get_latest_version)}"

  if [ -z "$version" ]; then
    echo "Could not determine latest version" >&2; exit 1
  fi

  echo "Installing termpair ${version} for ${platform}..."

  archive_name="termpair-${platform}.tar.gz"
  url="https://github.com/${REPO}/releases/download/${version}/${archive_name}"
  checksums_url="https://github.com/${REPO}/releases/download/${version}/sha256sums.txt"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  download "$url" "$tmp/${archive_name}"
  download "$checksums_url" "$tmp/sha256sums.txt" 2>/dev/null && \
    verify_checksum "$tmp/${archive_name}" "$archive_name" "$tmp/sha256sums.txt" || \
    echo "warning: could not download checksums, skipping verification" >&2

  tar xzf "$tmp/${archive_name}" -C "$tmp"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$tmp/termpair" "$INSTALL_DIR/termpair"
  else
    echo "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "$tmp/termpair" "$INSTALL_DIR/termpair"
  fi

  chmod +x "$INSTALL_DIR/termpair"
  echo "Installed termpair to ${INSTALL_DIR}/termpair"
}

main
