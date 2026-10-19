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
source_file_type = Struct.new(:settings)
source_phase_type = Struct.new(:files)
target = Struct.new(:name, :build_configurations, :source_build_phase)
project = Struct.new(:targets)
installer = Struct.new(:pods_project, :pod_targets, :sandbox)
specification = Struct.new(:name, :version, :source, :checksum)
dependency = Struct.new(:pod_name, :root_spec, :native_target)

Dir.mktmpdir('lynx-podfile-') do |root|
  source_file = File.join(root, LynxSourcePatch::SOURCE)
  FileUtils.mkdir_p(File.dirname(source_file))
  FileUtils.cp(File.join(__dir__, 'fixtures', 'lynx-4.0.1', 'parallel_parse_task_scheduler.cc'), source_file)
  version_file = File.join(root, 'platform', 'darwin', 'common', 'lynx', 'base', 'LynxVersion.m')
  FileUtils.mkdir_p(File.dirname(version_file))
  FileUtils.cp(File.join(__dir__, 'fixtures', 'lynx-4.0.1', 'LynxVersion.m'), version_file)
  sandbox = Object.new
  sandbox.define_singleton_method(:pod_dir) do |name|
    raise '错误的 Pod 路径' unless name == 'Lynx'
    root
  end
  configs = [nil, '9.0', '10.0', '15.0', '18.0'].map do |version|
    configuration.new(version ? { 'IPHONEOS_DEPLOYMENT_TARGET' => version } : {})
  end
  original = configs.map { |config| config.build_settings.dup }
  native_target = target.new('Lynx', configs, source_phase_type.new([source_file_type.new(nil)]))
  other_config = configuration.new({ 'GCC_PREPROCESSOR_DEFINITIONS' => ['$(inherited)', 'KEEP=1'] })
  other_target = target.new('LynxBase', [other_config], source_phase_type.new([]))
  spec = specification.new('Lynx', '4.0.1', { :http => 'https://github.com/lynx-family/lynx/releases/download/4.0.1/Lynx-4.0.1.zip' }, 'ccabb2322b26f64a8d9ce4b8d7ae9871cda6c441')
  context = installer.new(project.new([native_target, other_target]), [dependency.new('Lynx', spec, native_target)], sandbox)
  2.times { hook.call(context) }
  raise 'Podfile 未应用上游修复' unless Digest::SHA256.file(source_file).hexdigest == LynxSourcePatch::PATCHED_SHA
  configs.each_with_index do |config, index|
    expected = original[index].merge(
      'CODE_SIGNING_ALLOWED' => 'NO',
      'IPHONEOS_DEPLOYMENT_TARGET' => '15.0',
      'GCC_PREPROCESSOR_DEFINITIONS' => ['$(inherited)', 'Lynx_POD_VERSION=@\"9999_4.0.1\"'],
    )
    raise '签名或受管部署版本被意外改变' unless config.build_settings == expected
  end
  raise 'Podfile 污染其他 Pod 的版本宏' unless other_config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] == ['$(inherited)', 'KEEP=1']
  begin
    hook.call(installer.new(nil, [], nil))
    raise '缺少 Lynx 时应拒绝'
  rescue RuntimeError => error
    raise unless error.message == '缺少受管 Lynx Pod'
  end
end
puts 'Podfile 回归通过：应用精确补丁、幂等、保留依赖部署边界、拒绝缺失 Pod'
