$ErrorActionPreference = 'Stop'
# 预先编译进程树采样器，避免每次查询启动 PowerShell/WMI 而错过短任务。
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class DemoCostMemory {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct Entry {
    public uint size, usage, pid;
    public IntPtr heap;
    public uint module, threads, parent;
    public int priority;
    public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string exe;
  }
  [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static double Read(int root) {
    var snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) return -1;
    var parents = new Dictionary<int, int>();
    try {
      var entry = new Entry { size = (uint)Marshal.SizeOf(typeof(Entry)) };
      if (Process32FirstW(snapshot, ref entry)) do {
        parents[(int)entry.pid] = (int)entry.parent;
      } while (Process32NextW(snapshot, ref entry));
    } finally { CloseHandle(snapshot); }
    var selected = new HashSet<int> { root };
    bool changed;
    do {
      changed = false;
      foreach (var pair in parents) if (selected.Contains(pair.Value)) changed |= selected.Add(pair.Key);
    } while (changed);
    long bytes = 0;
    bool observed = false;
    foreach (int pid in selected) {
      try { using (var process = Process.GetProcessById(pid)) { bytes += process.WorkingSet64; observed = true; } }
      catch (ArgumentException) { }
      catch (InvalidOperationException) { }
      catch (System.ComponentModel.Win32Exception) { }
    }
    return observed ? bytes / 1048576.0 : -1;
  }
}
'@
# JIT 和进程枚举的首次初始化属于准备阶段。
$null = [DemoCostMemory]::Read($PID)
[Console]::WriteLine('ready')
[Console]::Out.Flush()
$measuredProcessId = [int][Console]::ReadLine()
while ($true) {
  $rss = [DemoCostMemory]::Read($measuredProcessId)
  [Console]::WriteLine($rss.ToString([Globalization.CultureInfo]::InvariantCulture))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 50
}
