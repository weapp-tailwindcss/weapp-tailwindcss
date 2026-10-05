require 'tmpdir'
require 'fileutils'
require_relative '../fixtures/lynx-native/ios/lynx-source-patch'

hook = nil
runner = Object.new
[:source, :platform, :use_frameworks!, :pod].each { |name| runner.define_singleton_method(name) { |*| } }
runner.define_singleton_method(:target) { |_, &block| block.call }
runner.define_singleton_method(:post_install) { |&block| hook = block }
file = File.expand_path(File.join('..', 'fixtures', 'lynx-native', 'ios', 'Podfile'), __dir__)
runner.instance_eval(File.read(file), file)
raise 'Podfile 缺少 post_install' unless hook

configuration = Struct.new(:build_settings)
target = Struct.new(:build_configurations)
project = Struct.new(:targets)
installer = Struct.new(:pods_project, :pod_targets, :sandbox)
specification = Struct.new(:version)
dependency = Struct.new(:pod_name, :root_spec)

Dir.mktmpdir('lynx-podfile-') do |root|
  source_file = File.join(root, LynxSourcePatch::SOURCE)
  FileUtils.mkdir_p(File.dirname(source_file))
  FileUtils.cp(File.join(__dir__, 'fixtures', 'lynx-4.0.1', 'parallel_parse_task_scheduler.cc'), source_file)
  sandbox = Object.new
  sandbox.define_singleton_method(:pod_dir) do |name|
    raise '错误的 Pod 路径' unless name == 'Lynx'
    root
  end
  configs = [nil, '9.0', '10.0', '15.0', '18.0'].map do |version|
    configuration.new(version ? { 'IPHONEOS_DEPLOYMENT_TARGET' => version } : {})
  end
  original = configs.map { |config| config.build_settings.dup }
  context = installer.new(project.new([target.new(configs)]), [dependency.new('Lynx', specification.new('4.0.1'))], sandbox)
  2.times { hook.call(context) }
  raise 'Podfile 未应用上游修复' unless Digest::SHA256.file(source_file).hexdigest == LynxSourcePatch::PATCHED_SHA
  configs.each_with_index do |config, index|
    raise '签名或部署版本被意外改变' unless config.build_settings == original[index].merge('CODE_SIGNING_ALLOWED' => 'NO')
  end
  begin
    hook.call(installer.new(nil, [], nil))
    raise '缺少 Lynx 时应拒绝'
  rescue RuntimeError => error
    raise unless error.message == '缺少受管 Lynx Pod'
  end
end
puts 'Podfile 回归通过：应用精确补丁、幂等、保留依赖部署边界、拒绝缺失 Pod'
