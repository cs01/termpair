#!/bin/sh
set -eu

REPO="cs01/termpair"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

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

  expected=$(grep -F "$expected_name" "$checksums_file" | awk '{print $1}')
  if [ -z "$expected" ]; then
    echo "error: no checksum found for $expected_name in checksums file" >&2
    exit 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$archive" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$archive" | awk '{print $1}')
  else
    echo "error: neither sha256sum nor shasum found, cannot verify integrity" >&2
    exit 1
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
  download "$checksums_url" "$tmp/sha256sums.txt" || {
    echo "error: could not download checksums, aborting installation" >&2
    exit 1
  }
  verify_checksum "$tmp/${archive_name}" "$archive_name" "$tmp/sha256sums.txt"

  tar xzf "$tmp/${archive_name}" -C "$tmp" --no-same-owner --no-same-permissions 2>/dev/null || \
    tar xzf "$tmp/${archive_name}" -C "$tmp"

  mkdir -p "$INSTALL_DIR"
  mv "$tmp/termpair" "$INSTALL_DIR/termpair"
  chmod +x "$INSTALL_DIR/termpair"

  echo ""
  echo "Installed termpair to ${INSTALL_DIR}/termpair"

  in_path=false
  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) in_path=true ;;
  esac

  if [ "$in_path" = false ]; then
    echo ""
    echo "Add ${INSTALL_DIR} to your PATH:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo ""
    echo "To make it permanent, add that line to your ~/.bashrc or ~/.zshrc"
  fi

  echo ""
  echo "Quick start:"
  echo "  termpair share                  # private encrypted session"
  echo "  termpair share --public         # public session (read-only, no encryption)"
  echo "  termpair share --read-only      # private, viewers can't type"
  echo "  termpair serve --port 8000      # run your own server"
  echo ""
}

main
