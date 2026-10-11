require 'digest'

# 回移上游四处显式丢弃，保留 get() 的同步和异常传播语义。
# https://github.com/lynx-family/lynx/commit/334ce5c4f388cea6d87f4d9fbab7a98c738f520c
# 升级到包含该修复的版本时删除本文件及 Podfile 调用，不能扩大版本范围。
module LynxSourcePatch
  SOURCE = File.join('core', 'template_bundle', 'template_codec', 'binary_decoder', 'parallel_parse_task_scheduler.cc')
  ORIGINAL_SHA = '5a4ad5116ff13ab70724479f3f7c9d57885095fca3db0c6dbb48e57bec19a1c4'
  PATCHED_SHA = 'b8967465ea0fa51be5a222d22485137329b89dc3294d863ee6fae3a6ef6acc43'

  def self.apply!(root, version)
    raise "Lynx source patch 仅适用 4.0.1，当前为 #{version}；请复查上游修复并移除回移" unless version.to_s == '4.0.1'

    file = File.join(root, SOURCE)
    source = File.binread(file)
    digest = Digest::SHA256.hexdigest(source)
    return if digest == PATCHED_SHA
    raise "Lynx 4.0.1 源码校验失败：#{file} (#{digest})" unless digest == ORIGINAL_SHA

    patched = source.gsub('    generate_element_template_parse_task_->GetFuture().get();', '    (void)generate_element_template_parse_task_->GetFuture().get();')
                    .gsub('    pair.second->GetFuture().get();', '    (void)pair.second->GetFuture().get();')
    raise 'Lynx 回移结果与上游四处修复不一致' unless Digest::SHA256.hexdigest(patched) == PATCHED_SHA

    mode = File.stat(file).mode & 0777
    begin
      File.chmod(mode | 0200, file)
      File.binwrite(file, patched)
    ensure
      File.chmod(mode, file)
    end
  end
end
