require 'tmpdir'
require 'fileutils'
require_relative '../fixtures/lynx-native/ios/lynx-source-patch'

original = File.binread(File.join(__dir__, 'fixtures', 'lynx-4.0.1', 'parallel_parse_task_scheduler.cc'))
Dir.mktmpdir('lynx-source-patch-') do |root|
  file = File.join(root, LynxSourcePatch::SOURCE)
  FileUtils.mkdir_p(File.dirname(file))
  File.binwrite(file, original)
  File.chmod(0444, file)
  LynxSourcePatch.apply!(root, '4.0.1')
  patched = File.binread(file)
  raise '未保留源码权限' unless File.stat(file).mode & 0777 == 0444
  changes = original.lines.zip(patched.lines).reject { |before, after| before == after }
  raise '必须仅修改四处同步返回值' unless changes.length == 4
  changes.each do |before, after|
    raise '回移改变了 get() 或 Run() 语义' unless after == before.sub('    ', '    (void)') && after.include?('GetFuture().get();')
  end
  LynxSourcePatch.apply!(root, '4.0.1')
  raise '重复安装改变了已修复源码' unless File.binread(file) == patched

  ['4.0.2', '4.2.0', '4.0.1-nightly'].each do |version|
    begin
      LynxSourcePatch.apply!(root, version)
      raise '意外接受未验证版本'
    rescue RuntimeError => error
      raise unless error.message.include?('仅适用 4.0.1')
    end
    raise '拒绝版本时修改了文件' unless File.binread(file) == patched
  end

  [original + "\n", patched.sub('(void)', '')].each do |unknown|
    File.chmod(0644, file)
    File.binwrite(file, unknown)
    begin
      LynxSourcePatch.apply!(root, '4.0.1')
      raise '意外接受未知源码'
    rescue RuntimeError => error
      raise unless error.message.include?('源码校验失败')
    end
    raise '拒绝源码时修改了文件' unless File.binread(file) == unknown
  end
end
puts 'Lynx 4.0.1 上游回移：四处语义、幂等、权限、版本与源码校验通过'
