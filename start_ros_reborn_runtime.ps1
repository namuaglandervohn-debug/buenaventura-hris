$ErrorActionPreference = 'Stop'

$runtimePath = 'C:\Users\user\AppData\Local\RosRebornHook\runtime\current.json'
$remoteServers = 'C:\Users\user\AppData\Local\RosRebornHook\remote-servers.json'
$sessionsPath = 'C:\Users\user\AppData\Local\RosRebornHook\online-sessions.json'
$localStatePath = 'C:\Users\user\AppData\Roaming\Rules of Survival Reborn\Local State'
$gameDir = 'D:\ROS REBORN 2.0\RosReborn(2.0)'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class RosRebornDpapi {
  [StructLayout(LayoutKind.Sequential)]
  public struct DATA_BLOB {
    public int cbData;
    public IntPtr pbData;
  }

  [DllImport("crypt32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern bool CryptUnprotectData(
    ref DATA_BLOB pDataIn,
    IntPtr ppszDataDescr,
    IntPtr pOptionalEntropy,
    IntPtr pvReserved,
    IntPtr pPromptStruct,
    int dwFlags,
    ref DATA_BLOB pDataOut
  );

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr LocalFree(IntPtr hMem);

  public static byte[] Unprotect(byte[] data) {
    DATA_BLOB inBlob = new DATA_BLOB();
    DATA_BLOB outBlob = new DATA_BLOB();
    inBlob.cbData = data.Length;
    inBlob.pbData = Marshal.AllocHGlobal(data.Length);
    Marshal.Copy(data, 0, inBlob.pbData, data.Length);
    try {
      if (!CryptUnprotectData(ref inBlob, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, ref outBlob)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      }
      byte[] outData = new byte[outBlob.cbData];
      Marshal.Copy(outBlob.pbData, outData, 0, outBlob.cbData);
      return outData;
    } finally {
      if (inBlob.pbData != IntPtr.Zero) Marshal.FreeHGlobal(inBlob.pbData);
      if (outBlob.pbData != IntPtr.Zero) LocalFree(outBlob.pbData);
    }
  }
}
'@

function Get-RosRuntimeKey {
  param($Runtime, $LocalStatePath)

  $localState = Get-Content -LiteralPath $LocalStatePath -Raw | ConvertFrom-Json
  $encryptedKey = [Convert]::FromBase64String($localState.os_crypt.encrypted_key)
  $masterKey = [RosRebornDpapi]::Unprotect([byte[]]$encryptedKey[5..($encryptedKey.Length - 1)])

  $env:ROS_MASTER_KEY_B64 = [Convert]::ToBase64String($masterKey)
  $env:ROS_BUNDLE_KEY_B64 = $Runtime.bundleKey
  $nodeScript = @'
const crypto = require("crypto");
const key = Buffer.from(process.env.ROS_MASTER_KEY_B64, "base64");
const blob = Buffer.from(process.env.ROS_BUNDLE_KEY_B64, "base64");
const iv = blob.subarray(3, 15);
const tag = blob.subarray(blob.length - 16);
const ciphertext = blob.subarray(15, blob.length - 16);
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
process.stdout.write(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
'@
  $nodePath = Join-Path $env:TEMP 'ros_reborn_decrypt_key.js'
  Set-Content -LiteralPath $nodePath -Value $nodeScript -NoNewline -Encoding UTF8
  try {
    node $nodePath
  } finally {
    Remove-Item -LiteralPath $nodePath -Force -ErrorAction SilentlyContinue
  }
}

Get-Process | Where-Object { $_.ProcessName -match '^ros$|^ros64$' } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name python -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*\RosRebornHook\runtime\*' } |
  Stop-Process -Force -ErrorAction SilentlyContinue

$runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
$session = (Get-Content -LiteralPath $sessionsPath -Raw | ConvertFrom-Json).maem_botchoy
$env:ROS_RT_KEY = Get-RosRuntimeKey -Runtime $runtime -LocalStatePath $localStatePath
$env:ROS_GAME_DIR = $gameDir
$env:ROS_API = 'http://127.0.0.1:47610'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUNBUFFERED = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'

$args = @(
  '-B',
  $runtime.entry,
  '--local-auth',
  '--account=maem_botchoy',
  "--token=$($session.token)",
  "--remote-servers=$remoteServers",
  "--account-id=$($session.accountId)",
  '--max-fps=300'
)

$process = Start-Process -FilePath $runtime.python `
  -ArgumentList $args `
  -WorkingDirectory $runtime.app `
  -WindowStyle Hidden `
  -PassThru

"started runtime pid=$($process.Id)"
