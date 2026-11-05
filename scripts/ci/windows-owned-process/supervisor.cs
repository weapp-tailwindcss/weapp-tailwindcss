using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Weapp.CI {
  public static class OwnedProcess {
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimit {
      public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
      public uint LimitFlags;
      public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
      public uint ActiveProcessLimit;
      public UIntPtr Affinity;
      public uint PriorityClass, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters {
      public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
      public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimit {
      public BasicLimit BasicLimitInformation;
      public IoCounters IoInfo;
      public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct Accounting {
      public long TotalUserTime, TotalKernelTime, ThisPeriodTotalUserTime, ThisPeriodTotalKernelTime;
      public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo {
      public int cb;
      public string reserved, desktop, title;
      public uint x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
      public ushort showWindow, reservedSize;
      public IntPtr reservedBytes, stdin, stdout, stderr;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct StartupInfoEx {
      public StartupInfo startup;
      public IntPtr attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo {
      public IntPtr process, thread;
      public uint processId, threadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int information, ref ExtendedLimit value, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool QueryInformationJobObject(IntPtr job, int information, out Accounting value, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool InitializeProcThreadAttributeList(IntPtr attributes, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UpdateProcThreadAttribute(IntPtr attributes, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")]
    static extern void DeleteProcThreadAttributeList(IntPtr attributes);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcess(string application, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]
    static extern IntPtr GetStdHandle(int handle);

    static Exception Error(string operation) {
      return new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }

    // 这里只编码原生 Node 可执行文件和本模块路径，不将用户参数交给 shell。
    static string Quote(string value) {
      if (String.IsNullOrEmpty(value) || value.IndexOf('"') >= 0 || value.EndsWith("\\")) throw new ArgumentException("Invalid owned executable file path");
      return "\"" + value + "\"";
    }

    static void Close(ref IntPtr handle, List<Exception> failures) {
      if (handle != IntPtr.Zero) {
        if (!CloseHandle(handle)) failures.Add(Error("CloseHandle"));
        handle = IntPtr.Zero;
      }
    }

    public static int Run(string node, string worker) {
      IntPtr job = IntPtr.Zero, attributes = IntPtr.Zero, jobValue = IntPtr.Zero;
      bool attributesInitialized = false;
      ProcessInfo process = new ProcessInfo();
      List<Exception> failures = new List<Exception>();
      uint exitCode = 1;
      try {
        job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw Error("CreateJobObject");
        ExtendedLimit limits = new ExtendedLimit();
        limits.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE；不允许后代 breakaway。
        if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimit)))) throw Error("SetInformationJobObject");

        IntPtr size = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        if (size == IntPtr.Zero) throw Error("InitializeProcThreadAttributeList size");
        attributes = Marshal.AllocHGlobal(size);
        if (!InitializeProcThreadAttributeList(attributes, 1, 0, ref size)) throw Error("InitializeProcThreadAttributeList");
        attributesInitialized = true;
        jobValue = Marshal.AllocHGlobal(IntPtr.Size);
        Marshal.WriteIntPtr(jobValue, job);
        // Windows 10+ 在创建时原子纳入 Job，强制终止 supervisor 也不会遗留尚未 Assign 的挂起进程。
        if (!UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x0002000D), jobValue, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero)) throw Error("UpdateProcThreadAttribute JOB_LIST");
        StartupInfoEx startup = new StartupInfoEx();
        startup.startup.cb = Marshal.SizeOf(typeof(StartupInfoEx));
        startup.startup.flags = 0x100; // STARTF_USESTDHANDLES，保留原始 UTF-8 输出管道。
        startup.startup.stdin = GetStdHandle(-10);
        startup.startup.stdout = GetStdHandle(-11);
        startup.startup.stderr = GetStdHandle(-12);
        startup.attributes = attributes;
        StringBuilder command = new StringBuilder(Quote(node) + " " + Quote(worker) + " --owned-worker");
        if (!CreateProcess(node, command, IntPtr.Zero, IntPtr.Zero, true, 0x08080004, IntPtr.Zero, null, ref startup, out process)) throw Error("CreateProcess suspended in Job");
        if (ResumeThread(process.thread) == UInt32.MaxValue) throw Error("ResumeThread");
        Close(ref process.thread, failures);

        bool rootExited = false;
        while (true) {
          if (!rootExited) {
            uint status = WaitForSingleObject(process.process, 50);
            if (status == UInt32.MaxValue) throw Error("WaitForSingleObject");
            if (status == 0) {
              rootExited = true;
              if (!GetExitCodeProcess(process.process, out exitCode)) throw Error("GetExitCodeProcess");
            }
          }
          else {
            System.Threading.Thread.Sleep(50);
          }
          Accounting accounting;
          if (!QueryInformationJobObject(job, 1, out accounting, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) throw Error("QueryInformationJobObject");
          // 根包装进程自然退出后仍持有 Job，直到所有后代退出或调用方终止 supervisor。
          if (rootExited && accounting.ActiveProcesses == 0) break;
        }
      }
      catch (Exception error) {
        failures.Add(error);
      }
      finally {
        Close(ref process.thread, failures);
        Close(ref job, failures);
        if (process.process != IntPtr.Zero && WaitForSingleObject(process.process, 5000) != 0) failures.Add(new Exception("Owned process did not terminate after closing Job"));
        Close(ref process.process, failures);
        if (attributesInitialized) DeleteProcThreadAttributeList(attributes);
        if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
        if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
      }
      if (failures.Count > 0) throw new AggregateException("Windows owned Job supervisor failed", failures);
      return unchecked((int)exitCode);
    }
  }
}
