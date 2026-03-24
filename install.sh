#!/bin/sh
set -eu

REPO="cs01/termpair"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

if [ -t 1 ]; then
  bold="\033[1m" dim="\033[2m" green="\033[32m" cyan="\033[36m"
  yellow="\033[33m" red="\033[31m" reset="\033[0m"
else
  bold="" dim="" green="" cyan="" yellow="" red="" reset=""
fi

info()  { printf "  ${cyan}>${reset} %s\n" "$1"; }
ok()    { printf "  ${green}>${reset} %s\n" "$1"; }
warn()  { printf "  ${yellow}!${reset} %s\n" "$1" >&2; }
err()   { printf "  ${red}x${reset} %s\n" "$1" >&2; exit 1; }

detect_platform() {
  os="$(uname -s)"; arch="$(uname -m)"
  case "$os" in
    Linux)  os="unknown-linux-gnu" ;;
    Darwin) os="apple-darwin" ;;
    MINGW*|MSYS*|CYGWIN*) err "On Windows, download from https://github.com/${REPO}/releases" ;;
    *) err "Unsupported OS: $os" ;;
  esac
  case "$arch" in
    x86_64|amd64)  arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *) err "Unsupported architecture: $arch" ;;
  esac
  echo "${arch}-${os}"
}

get_latest_version() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//'
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//'
  else
    err "Neither curl nor wget found"
  fi
}

download() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  else wget -qO "$2" "$1"; fi
}

verify_checksum() {
  archive="$1"; expected_name="$2"; checksums_file="$3"
  expected=$(grep -F "$expected_name" "$checksums_file" | awk '{print $1}')
  [ -z "$expected" ] && err "No checksum found for $expected_name"
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$archive" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$archive" | awk '{print $1}')
  else
    err "Neither sha256sum nor shasum found"
  fi
  [ "$actual" != "$expected" ] && err "Checksum mismatch (expected $expected, got $actual)"
}

main() {
  printf "\n"
  printf "  ${bold}TermPair Installer${reset}\n"
  printf "  ${dim}End-to-end encrypted terminal sharing${reset}\n"
  printf "\n"

  platform="$(detect_platform)"
  version="${VERSION:-$(get_latest_version)}"
  [ -z "$version" ] && err "Could not determine latest version"

  info "Downloading termpair ${version} (${platform})..."

  archive_name="termpair-${platform}.tar.gz"
  url="https://github.com/${REPO}/releases/download/${version}/${archive_name}"
  checksums_url="https://github.com/${REPO}/releases/download/${version}/sha256sums.txt"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  download "$url" "$tmp/${archive_name}"
  download "$checksums_url" "$tmp/sha256sums.txt" || err "Could not download checksums"
  info "Verifying checksum..."
  verify_checksum "$tmp/${archive_name}" "$archive_name" "$tmp/sha256sums.txt"

  tar xzf "$tmp/${archive_name}" -C "$tmp" --no-same-owner --no-same-permissions 2>/dev/null || \
    tar xzf "$tmp/${archive_name}" -C "$tmp"

  mkdir -p "$INSTALL_DIR"
  mv "$tmp/termpair" "$INSTALL_DIR/termpair"
  chmod +x "$INSTALL_DIR/termpair"

  ok "Installed to ${INSTALL_DIR}/termpair"

  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      printf "\n"
      warn "${INSTALL_DIR} is not in your PATH. Add it:"
      printf "    ${bold}export PATH=\"${INSTALL_DIR}:\$PATH\"${reset}\n"
      printf "    ${dim}Add to ~/.bashrc or ~/.zshrc to make permanent${reset}\n"
      ;;
  esac

  printf "\n"
  printf "  ${bold}Quick start${reset}\n"
  printf "\n"
  printf "    ${green}termpair share${reset}                  Private encrypted session\n"
  printf "    ${green}termpair share --public${reset}         Public, read-only, no encryption\n"
  printf "    ${green}termpair share --read-only${reset}      Viewers can watch but not type\n"
  printf "    ${green}termpair serve --port 8000${reset}      Run your own server\n"
  printf "\n"
  printf "  ${dim}https://github.com/cs01/termpair${reset}\n"
  printf "\n"
}

main
