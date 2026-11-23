/** Minimal environment for local helper CLIs; omit unrelated API and CI secrets. */
export function localToolEnvironment(): Record<string, string> {
  const allowed = process.platform === "win32"
    ? ["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "TEMP", "TMP", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "OPENCODE_CONFIG_DIR"]
    : ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "OPENCODE_CONFIG_DIR"];
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value]];
  }));
}
