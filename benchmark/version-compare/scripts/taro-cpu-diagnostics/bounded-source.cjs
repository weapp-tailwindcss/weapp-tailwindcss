const { Buffer } = require('node:buffer')
const fs = require('node:fs')

/** 按 descriptor 读取，保留关闭失败和实际读取字节。 */
exports.createBoundedSources = function createBoundedSources({ limits, physical, same, fail, digest }) {
  let readBytes = 0
  function read(file) {
    const physicalFile = fs.realpathSync(file)
    const fd = fs.openSync(physicalFile, 'r')
    let primaryError
    let value
    try {
      const stat = fs.fstatSync(fd, {
        bigint: true,
      })
      const allowance = Math.min(limits.singleReadBytes, limits.totalReadBytes - readBytes)
      if (!stat.isFile() || stat.size > BigInt(allowance)) {
        fail('file/read budget exceeded')
      }
      const bytes = Buffer.alloc(Number(stat.size))
      let length = 0
      let count
      do {
        count = fs.readSync(fd, bytes, length, bytes.length - length, null)
        readBytes += count
        length += count
        if (length > allowance || BigInt(length) > stat.size) {
          fail('file grew beyond bounded read')
        }
      } while (count > 0 && length < bytes.length)
      const finalStat = fs.fstatSync(fd, {
        bigint: true,
      })
      const pathStat = fs.statSync(physicalFile, {
        bigint: true,
      })
      if (BigInt(length) !== stat.size || pathStat.dev !== stat.dev || pathStat.ino !== stat.ino || finalStat.size !== stat.size || finalStat.mtimeNs !== stat.mtimeNs || finalStat.ctimeNs !== stat.ctimeNs || !same(fs.realpathSync(file), physicalFile)) {
        fail('file identity changed during observation')
      }
      value = {
        bytes: bytes.subarray(0, length),
        physicalFile,
        ...physical(stat),
      }
    }
    catch (error) {
      primaryError = error
    }
    try {
      fs.closeSync(fd)
    }
    catch (error) {
      if (!primaryError) {
        primaryError = error
      }
      else {
        const name = String(error.name || 'Error')
        const message = String(error.message || error)
        primaryError.suppressedCloseError = {
          name: name.slice(0, 256),
          message: message.slice(0, 4096),
          textTruncated: name.length > 256 || message.length > 4096,
        }
      }
    }
    if (primaryError) {
      throw primaryError
    }
    return value
  }
  const hashIdentity = (file) => {
    const {
      bytes,
      ...location
    } = read(file)
    return {
      ...location,
      bytes: bytes.length,
      sha256AtObservation: digest(bytes),
    }
  }
  return { read, hashIdentity, getReadBytes: () => readBytes }
}
