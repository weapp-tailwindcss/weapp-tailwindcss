require 'logger'
require 'cocoapods'
require 'tmpdir'
require 'fileutils'
require 'zlib'
require 'digest'
require_relative '../fixtures/lynx-native/ios/lynx-source-patch'

PODFILE = File.expand_path(File.join('..', 'fixtures', 'lynx-native', 'ios', 'Podfile'), __dir__)
FIXTURES = File.join(__dir__, 'fixtures', 'lynx-4.0.1')
GENERATOR = Pod::Installer::Xcode::PodsProjectGenerator
DEFINITION = 'Lynx_POD_VERSION=@\"9999_4.0.1\"'

def assert(condition, message)
  raise message unless condition
end

def pod_target(sandbox, podfile, spec)
  Pod::PodTarget.new(sandbox, Pod::BuildType.static_framework,
                    { 'Debug' => :debug, 'Release' => :release }, ['arm64'],
                    Pod::Platform.new(:ios, '15.0'), [spec.subspec_by_name('Lynx/Framework')],
                    [podfile.target_definitions.fetch('LynxCompatibilityHost')])
end

def fixture
  Dir.mktmpdir('lynx-podfile-') do |root|
    podfile = Pod::Podfile.from_file(Pathname.new(PODFILE))
    sandbox = Pod::Sandbox.new(File.join(root, 'Pods'))
    source_root = sandbox.pod_dir('Lynx')
    scheduler = File.join(source_root, LynxSourcePatch::SOURCE)
    version = File.join(source_root, 'platform', 'darwin', 'common', 'lynx', 'base', 'LynxVersion.m')
    [[scheduler, 'parallel_parse_task_scheduler.cc'], [version, 'LynxVersion.m']].each do |destination, name|
      FileUtils.mkdir_p(File.dirname(destination))
      FileUtils.cp(File.join(FIXTURES, name), destination)
    end
    json = Zlib::GzipReader.open(File.join(FIXTURES, 'Lynx.podspec.json.gz'), &:read)
    assert(Digest::SHA256.hexdigest(json) == '3a7cbc6a32e99f1b23e732f52d720a87e5665f3b5fa8b8a5768d21438b4762df', '官方 Podspec 原始字节不符')
    spec_file = File.join(root, 'Lynx.podspec.json')
    File.binwrite(spec_file, json)
    spec = Pod::Specification.from_file(Pathname.new(spec_file))
    assert(spec.checksum == 'ccabb2322b26f64a8d9ce4b8d7ae9871cda6c441', '真实 Podspec checksum 不符')
    pod = pod_target(sandbox, podfile, spec)
    assert(!pod.respond_to?(:native_target), '回归不得为 PodTarget 虚构 native_target API')
    project = Pod::Project.new(File.join(root, 'Pods.xcodeproj'))
    native = project.new_target(:framework, 'Lynx', :ios, '15.0')
    reference = project.new_file(version)
    native.source_build_phase.add_file_reference(reference)
    native.build_configurations.each_with_index { |config, i| config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = ['9.0', '10.0'][i] }
    other = project.new_target(:framework, 'LynxBase', :ios, '10.0')
    other.build_configurations.each { |config| config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = ['$(inherited)', 'KEEP=1'] }
    result = GENERATOR::TargetInstallationResult.new(pod, native)
    results = { pod.name => result }
    installer = Pod::Installer.new(sandbox, podfile)
    installer.instance_variable_set(:@pod_targets, [pod])
    installer.instance_variable_set(:@pods_project, project)
    installer.instance_variable_set(:@target_installation_results, GENERATOR::InstallationResults.new(results, {}))
    yield({ root: root, podfile: podfile, sandbox: sandbox, spec: spec, pod: pod,
            project: project, native: native, other: other, result: result,
            results: results, installer: installer, scheduler: scheduler, version: version })
  end
end

fixture do |state|
  original = File.binread(state[:version])
  2.times { state[:podfile].post_install!(state[:installer]) }
  assert(Digest::SHA256.file(state[:scheduler]).hexdigest == LynxSourcePatch::PATCHED_SHA, 'Podfile 未应用精确上游补丁')
  assert(File.binread(state[:version]) == original, 'Podfile 不得改写官方版本 getter')
  state[:native].build_configurations.each do |config|
    assert(config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] == ['$(inherited)', DEFINITION], '版本宏没有精确绑定实际原生目标或不幂等')
  end
  state[:project].targets.each do |target|
    target.build_configurations.each do |config|
      assert(config.build_settings['CODE_SIGNING_ALLOWED'] == 'NO' && config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] == '15.0', '签名或部署版本边界错误')
    end
  end
  assert(state[:other].build_configurations.all? { |config| config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] == ['$(inherited)', 'KEEP=1'] }, '版本宏污染其他 Pod')
  state[:project].save
  reloaded = Xcodeproj::Project.open(state[:project].path)
  assert(reloaded.targets.find { |target| target.name == 'Lynx' }.build_configurations.all? { |config| config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] == ['$(inherited)', DEFINITION] }, '版本宏未进入保存的真实 PBX 工程')
end

def rejects(message)
  fixture do |state|
    yield state
    snapshot = Marshal.load(Marshal.dump(state[:project].targets.flat_map { |target| target.build_configurations.map(&:build_settings) }))
    begin
      state[:podfile].post_install!(state[:installer])
    rescue RuntimeError => error
      raise unless error.message.include?(message)
      current = state[:project].targets.flat_map { |target| target.build_configurations.map(&:build_settings) }
      assert(current == snapshot, '拒绝目标边界时修改了部分 PBX 构建设置')
      return
    end
    raise "意外接受：#{message}"
  end
end

rejects('缺少受管 Lynx Pod') { |s| s[:installer].instance_variable_set(:@pod_targets, []) }
rejects('Lynx Pod 目标不唯一') { |s| s[:installer].instance_variable_set(:@pod_targets, [s[:pod], pod_target(s[:sandbox], s[:podfile], s[:spec])]) }
rejects('安装结果') { |s| s[:installer].instance_variable_set(:@target_installation_results, nil) }
rejects('安装结果') { |s| s[:results].clear }
rejects('安装结果') { |s| s[:results]['other-key'] = s[:results].delete(s[:pod].name) }
rejects('安装结果') { |s| s[:results][s[:pod].name] = GENERATOR::TargetInstallationResult.new(pod_target(s[:sandbox], s[:podfile], s[:spec]), s[:native]) }
rejects('安装结果') { |s| s[:results]['alias'] = s[:result] }
rejects('原生目标') { |s| s[:results][s[:pod].name] = GENERATOR::TargetInstallationResult.new(s[:pod], nil) }
rejects('原生目标') { |s| s[:results][s[:pod].name] = GENERATOR::TargetInstallationResult.new(s[:pod], s[:other]) }
rejects('原生目标') do |s|
  foreign = Pod::Project.new(File.join(s[:root], 'Foreign.xcodeproj')).new_target(:framework, 'Lynx', :ios, '15.0')
  s[:results][s[:pod].name] = GENERATOR::TargetInstallationResult.new(s[:pod], foreign)
end
rejects('原生目标') { |s| s[:project].new_target(:framework, 'Lynx', :ios, '15.0') }
rejects('原生目标') do |s|
  aggregate = s[:project].new_aggregate_target('Lynx', [], :ios, '15.0')
  s[:results][s[:pod].name] = GENERATOR::TargetInstallationResult.new(s[:pod], aggregate)
end
rejects('安装结果') { |s| s[:results]['foreign'] = GENERATOR::TargetInstallationResult.new(pod_target(s[:sandbox], s[:podfile], s[:spec]), s[:native]) }

puts "Podfile 真实对象回归通过（CocoaPods #{Pod::VERSION}）：官方 spec/checksum、安装结果唯一映射、PBX 工程持久化、缺失/重复/错绑拒绝"
