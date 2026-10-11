---
sidebar: aiSidebar
title: AI Sandbox
description: >-
  Introduces the core concepts, risk isolation mechanisms, and practical solutions of the AI  sandbox to help safely run
  AI-generated code and commands locally.
keywords:
  - AI programming
  - LLM
  - Workflow
  - AI
  - sandbox
  - basics
  - ai sandbox
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - AI coding
  - Tailwind CSS 4
  - cross-platform
---

# AI Sandbox (AI Sandbox)

## Overview

An **AI Sandbox** is an **isolated execution environment** used to safely run AI-generated code, execute commands, or conduct experiments. The sandbox ensures that AI operations do not impact the host system while providing a controlled testing environment.

> **Core Value**: Safety + Controllability + Repeatability

---

## Why you need an AI sandbox

### 1. Security risks

Without a sandbox, the AI might:

- Delete important files
- Execute malicious commands
- Access sensitive data
- Consumes system resources
- Infect the network environment

### 2. Typical scenario

| Scenario                    | Risk                             | Sandbox Solution         |
| --------------------------- | -------------------------------- | ------------------------ |
| AI generated code execution | Code may contain malicious logic | Execution in container   |
| AI calls system commands    | Commands may damage the system   | Limit available commands |
| AI accesses the network     | May access malicious websites    | Network isolation/proxy  |
| AI modifies files           | May delete important files       | File system isolation    |

---

## Type of sandbox

### 1. Process-level sandbox

Isolate a single process:

```
┌─────────────────────────────────────────────────────────┐
│ Process Sandbox │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐         ┌──────────────┐             │
│ │ Host system │ │ Sandbox process │ │
│  │              │         │              │             │
│  │  ┌────────┐  │  ──▶    │  ┌────────┐  │             │
│ │ │ Others │ │ │ │ AI code │ │ │
│ │ │ process │ │ │ │ execution │ │ │
│  │  └────────┘  │         │  └────────┘  │             │
│  │              │         │              │             │
│  └──────────────┘         └──────────────┘             │
│         ▲                         ▲                     │
│         └─────────────────────────┘                     │
│ Permission isolation (chroot, namespace) │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**technology**:

- Linux: chroot, namespace, seccomp
- macOS: sandbox_exec
- Windows: Job Objects, Restricted Tokens

### 2. Container-level sandbox

Isolation using container technology:

```
┌─────────────────────────────────────────────────────────┐
│ Container Sandbox │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│ │ Host system │ │
│  │  ┌─────────────────────────────────────┐   │        │
│ │ │ Docker/Podman container │ │ │
│  │  │  ┌─────────────────────────────┐    │   │        │
│ │ │ │ AI execution environment │ │ │ │
│ │ │ │ - Independent file system │ │ │ │
│ │ │ │ - Standalone network stack │ │ │ │
│ │ │ │ - Resource limit │ │ │ │
│  │  │  └─────────────────────────────┘    │   │        │
│  │  └─────────────────────────────────────┘   │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**technology**:

- Docker
- Podman
- Kubernetes (Pod)
- gVisor (user space kernel)

### 3. Virtual machine-level sandbox

Complete virtualization isolation:

```
┌─────────────────────────────────────────────────────────┐
│ Virtual Machine Sandbox │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│ │ Host operating system │ │
│  │  ┌─────────────────────────────────────┐   │        │
│  │  │         Hypervisor (KVM/VMware)      │   │        │
│  │  │  ┌─────────────────────────────┐    │   │        │
│ │ │ │ Virtual machine operating system │ │ │ │
│  │  │  │  ┌─────────────────────┐     │    │   │        │
│ │ │ │ │ AI execution environment │ │ │ │ │
│ │ │ │ │ - Complete Isolation │ │ │ │ │
│ │ │ │ │ - independent kernel │ │ │ │ │
│ │ │ │ │ - Hardware Virtualization │ │ │ │ │
│  │  │  │  └─────────────────────┘     │    │   │        │
│  │  │  └─────────────────────────────┘    │   │        │
│  │  └─────────────────────────────────────┘   │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**technology**:

- KVM / QEMU
- VMware
- VirtualBox
- Firecracker (micro virtual machine)

### 4. Web Sandbox

Execute JavaScript on the browser/server side:

```
┌─────────────────────────────────────────────────────────┐
│ Web Sandbox │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│ │ Browser/Server │ │
│  │  ┌─────────────────────────────────────┐   │        │
│  │  │         iframe / Web Worker         │   │        │
│  │  │  ┌─────────────────────────────┐    │   │        │
│ │ │ │ AI generated JavaScript │ │ │ │
│ │ │ │ - SOP Limitations │ │ │ │
│ │ │ │ - CSP Strategy │ │ │ │
│ │ │ │ - Memory isolation │ │ │ │
│  │  │  └─────────────────────────────┘    │   │        │
│  │  └─────────────────────────────────────┘   │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**technology**:

- iframe + sandbox attribute
- Web Workers
- Service Workers
- QuickJS (embedded JS engine)

---

## Mainstream AI sandbox solution

### 1. E2B

A sandbox designed specifically for AI code execution:

```bash
# Install E2B
pip install e2b

# Usage example
from e2b import Sandbox

sandbox = Sandbox()
result = sandbox.run_code("print('Hello from AI!')")
```

**Features**:

- Designed specifically for LLM
- Pre-installed commonly used tools
- Supports multiple programming languages
- API is simple and easy to use

### 2. Docker Exec

Use Docker directly as a sandbox:

```bash
#Run container execution code
docker run --rm -v $(pwd):/workspace python:3.12 \
  python /workspace/script.py

# Limit resources
docker run --rm \
  --memory="512m" \
  --cpus="1.0" \
  --network=none \
  python:3.12 python script.py
```

### 3. Firecracker

Micro virtual machine used by AWS Lambda:

```json
{
  "boot_source": {
    "kernel_image_path": "vmlinux.bin"
  },
  "drives": [
    {
      "drive_id": "rootfs",
      "path_on_host": "rootfs.ext4",
      "is_root_device": true,
      "is_read_only": false
    }
  ],
  "machine_config": {
    "vcpu_count": 1,
    "mem_size_mib": 512
  }
}
```

### 4. WebAssembly (WASM)

Safely execute in your browser:

```javascript
// QuickJS WASM sandbox
import { getQuickJS } from 'quickjs-emscripten';

const { evalCode } = await getQuickJS();

//Execute code in an isolated environment
const result = evalCode(`
  const sum = (a, b) => a + b;
  sum(1, 2);
`);
```

---

## Sandbox usage in AI tools

### Claude Code CLI

Claude Code uses a system-wide sandbox:

```typescript
// Safely execute commands
const result = await Bash({
  command: "npm test",
  options: {
    timeout: 30000,
    cwd: workspaceDir,
    env: { ...process.env, NODE_ENV: 'test' }
  }
});
```

**Safety Measures**:

- Command timeout limit
- working directory restrictions
- Environment variable filtering
- File access control

### Cursor IDE

Cursor uses a container to execute code:

- Each Tab runs in an independent environment
- File system access requires user authorization
- Network requests configurable

### GitHub Codespaces

Complete cloud development environment as sandbox:

```
User code → Codespaces container → Isolated execution environment
                      ↓
Resource limits
                      ↓
network isolation
```

---

## Build your own AI sandbox

### Basic solution: Python subprocess

```python
import subprocess
import tempfile
import os

def execute_in_sandbox(code: str, timeout: int = 30):
"""Execute code in temporary directory"""
    with tempfile.TemporaryDirectory() as tmpdir:
#Write code file
        code_file = os.path.join(tmpdir, 'script.py')
        with open(code_file, 'w') as f:
            f.write(code)

# Execute code (with timeout)
        result = subprocess.run(
            ['python', code_file],
            cwd=tmpdir,
            timeout=timeout,
            capture_output=True,
            text=True
        )

        return result.stdout, result.stderr, result.returncode
```

### Intermediate solution: Docker

```python
import docker

def execute_in_docker(code: str, language: str = 'python'):
"""Execute code in a Docker container"""
    client = docker.from_env()

# Run container
    container = client.containers.run(
        f'{language}:3.12-slim',
        command=['python', '-c', code],
        mem_limit='512m',
        cpu_quota=100000,
        network_disabled=True,
        detach=True
    )

# Wait for execution to complete
    result = container.wait()
    logs = container.logs()

# cleanup
    container.remove()

    return logs.decode('utf-8')
```

### Advanced solution: gVisor

```bash
# Use gVisor to run the container
docker run --runtime=runsc --rm python:3.12 python -c "print('Hello')"
```

---

## Best practices for sandboxing

### 1. Resource limitations

| Resources | Recommended Limitations | Reasons                   |
| --------- | ----------------------- | ------------------------- |
| CPU       | 1-2 cores               | Prevent CPU hogs          |
| Memory    | 512MB-2GB               | Prevent memory exhaustion |
| Disk      | 1GB                     | Limit storage usage       |
| Network   | Disable or proxy        | Prevent malicious access  |
| Time      | 30-60 seconds           | Prevent infinite loops    |

### 2. File system isolation

- Use temporary file system
- Disable access to host directory
- Provide virtual file system

### 3. Network isolation

- Network disabled by default
- Use whitelist when needed
- Log all network requests

### 4. Logging and monitoring

- Record all operations
- Monitor resource usage
- Abnormal behavior alerts

### 5. Cleaning mechanism

- Automatically clean up after execution
- Clean up residue regularly
- Resource recovery

---

## Comparison of sandbox solutions

| Solution            | Isolation level | Performance | Complexity | Applicable scenarios       |
| ------------------- | --------------- | ----------- | ---------- | -------------------------- |
| **Process Level**   | Low             | High        | Low        | Simple Script              |
| **Container**       | Medium          | High        | Medium     | General Scenario           |
| **Virtual Machine** | High            | Medium      | High       | High Security Requirements |
| **Web WASM**        | Medium          | Medium      | Low        | Browser Environment        |
| **E2B**             | Medium          | High        | Low        | Fast integration           |

---

## Reference resources

### Open source projects

- [E2B](https://github.com/e2b-dev/e2b) - AI code execution sandbox
- [gVisor](https://github.com/google/gvisor) - user space kernel
- [Firecracker](https://github.com/firecracker-microvm/firecracker) - Micro virtual machine
- [QuickJS](https://github.com/quickjs-ng/quickjs) - lightweight JS engine

### document

- [Docker Security](https://docs.docker.com/engine/security/)
- [Linux Namespace](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [seccomp](https://man7.org/linux/man-pages/man2/seccomp.2.html)

---

**Document updated: December 2025**
