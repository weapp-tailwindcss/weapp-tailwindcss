require 'tmpdir'
require 'fileutils'
require 'open3'
require 'json'
require 'zlib'
require_relative '../fixtures/lynx-native/ios/lynx-build-metadata'

def assert(condition, message)
  raise message unless condition
end

def rejects(message)
  begin
    yield
  rescue RuntimeError => error
    raise unless error.message.include?(message)
    return
  end
  raise "意外接受：#{message}"
end

specification = Struct.new(:name, :version, :source, :checksum, :to_hash)
configuration = Struct.new(:build_settings)
target_type = Struct.new(:name, :build_configurations, :source_build_phase)
source_phase = Struct.new(:files)
source_file = Struct.new(:settings)
spec = specification.new('Lynx', '4.0.1', { :http => 'https://github.com/lynx-family/lynx/releases/download/4.0.1/Lynx-4.0.1.zip' }, 'ccabb2322b26f64a8d9ce4b8d7ae9871cda6c441')
definition = 'Lynx_POD_VERSION=@\"9999_4.0.1\"'
fixture = File.join(__dir__, 'fixtures', 'lynx-4.0.1')
spec.to_hash = JSON.parse(Zlib::GzipReader.open(File.join(fixture, 'Lynx.podspec.json.gz'), &:read))

Dir.mktmpdir('lynx-build-metadata-') do |root|
  source = File.join(root, 'platform', 'darwin', 'common', 'lynx', 'base', 'LynxVersion.m')
  FileUtils.mkdir_p(File.dirname(source))
  FileUtils.cp(File.join(fixture, 'LynxVersion.m'), source)
  original = File.binread(source)
  configs = [nil, '', ['$(inherited)', 'COCOAPODS=1', 'KEEP=\"two words\"'], '$(inherited) COCOAPODS=1 KEEP=\"two words\"'].map do |value|
    configuration.new({ 'GCC_PREPROCESSOR_DEFINITIONS' => value, 'KEEP_OTHER_SETTING' => 'value' })
  end
  target = target_type.new('Lynx', configs, source_phase.new([source_file.new({ 'COMPILER_FLAGS' => '-Werror' })]))
  originals = Marshal.load(Marshal.dump(configs.map(&:build_settings)))
  2.times { LynxBuildMetadata.apply!(root, spec, target) }
  configs.each_with_index do |config, index|
    old = originals[index]['GCC_PREPROCESSOR_DEFINITIONS']
    expected = if old.nil? || old.empty?
                 ['$(inherited)', definition]
               elsif old.is_a?(Array)
                 old + [definition]
               else
                 "#{old} #{definition}"
               end
    assert(config.build_settings == originals[index].merge('GCC_PREPROCESSOR_DEFINITIONS' => expected), '版本宏覆盖或重复改变了其他构建定义')
  end
  assert(File.binread(source) == original, '版本元数据修复不得改写官方 getter')

  [[:name, 'LynxBase', '受管 Lynx Pod'], [:version, '4.0.2', '仅适用 4.0.1'], [:source, { :git => 'https://example.test/lynx' }, '来源校验失败'], [:source, { :http => spec.source[:http], :sha256 => '0' * 64 }, '来源校验失败']].each do |field, value, message|
    invalid = spec.dup
    invalid[field] = value
    rejects(message) { LynxBuildMetadata.apply!(root, invalid, target) }
  end
  # 任何完整 Podspec 语义变化都须拒绝；不能只比较版本或下载 URL。
  [
    ->(hash) { hash['license'] = { 'type' => 'MIT' } },
    ->(hash) { hash['source']['http'] += '?changed' },
    ->(hash) { hash['subspecs'].reverse! },
    ->(hash) { hash['new_build_flag'] = true },
    ->(hash) { hash['platforms']['ios'] = 9 },
  ].each do |change|
    invalid = spec.dup
    invalid.to_hash = Marshal.load(Marshal.dump(spec.to_hash))
    change.call(invalid.to_hash)
    rejects('Podspec 语义校验失败') { LynxBuildMetadata.apply!(root, invalid, target) }
  end
  # 文件 checksum 仅受格式影响，不再代替完整语义身份。
  reformatted = spec.dup
  reformatted.checksum = '1a461f83f48104309f7e2031dabf3af84b181807'
  LynxBuildMetadata.apply!(root, reformatted, target)
  rejects('Lynx 原生目标') { LynxBuildMetadata.apply!(root, spec, nil) }
  rejects('Lynx 原生目标') { LynxBuildMetadata.apply!(root, spec, target_type.new('LynxBase', configs, source_phase.new([]))) }
  rejects('缺少构建配置') { LynxBuildMetadata.apply!(root, spec, target_type.new('Lynx', [], source_phase.new([]))) }
  ["#{original}\n", original.sub('9999_1.4.0', '9999_4.0.1')].each do |unknown|
    File.binwrite(source, unknown)
    rejects('版本源码校验失败') { LynxBuildMetadata.apply!(root, spec, target) }
    assert(File.binread(source) == unknown, '拒绝未知源码时修改了文件')
  end
  File.binwrite(source, original)

  [{ 'GCC_PREPROCESSOR_DEFINITIONS' => ['Lynx_POD_VERSION=@\"9999_1.4.0\"'] },
   { 'GCC_PREPROCESSOR_DEFINITIONS' => "$(inherited) #{definition} Lynx_POD_VERSION=other" },
   { 'GCC_PREPROCESSOR_DEFINITIONS' => [definition, definition] },
   { 'GCC_PREPROCESSOR_DEFINITIONS' => 4 },
   { 'GCC_PREPROCESSOR_DEFINITIONS[sdk=iphonesimulator*]' => ['FOO=1'] },
   { 'OTHER_CFLAGS' => '-DLynx_POD_VERSION=@\"9999_1.4.0\"' }].each do |settings|
    before = Marshal.load(Marshal.dump(settings))
    target.build_configurations = [configuration.new({ 'KEEP' => 'first' }), configuration.new(settings)]
    rejects('版本宏') { LynxBuildMetadata.apply!(root, spec, target) }
    assert(settings == before && target.build_configurations.first.build_settings == { 'KEEP' => 'first' }, '拒绝冲突时修改了部分构建配置')
  end
  target.build_configurations = configs
  target.source_build_phase.files.first.settings['COMPILER_FLAGS'] = '-DLynx_POD_VERSION=wrong'
  rejects('版本宏') { LynxBuildMetadata.apply!(root, spec, target) }

  if RUBY_PLATFORM.include?('darwin')
    sdk, status = Open3.capture2('xcrun', '--sdk', 'macosx', '--show-sdk-path')
    assert(status.success?, '无法读取 macOS SDK')
    main = File.join(root, 'main.m')
    File.write(main, "#import <Lynx/LynxVersion.h>\n#include <stdio.h>\nint main(void) { @autoreleasepool { printf(\"%s\\n\", [[LynxVersion versionString] UTF8String]); } return 0; }\n")
    [['fallback', [], '1.4.0'], ['resolved', ["-D#{definition.gsub('\\"', '"')}"], '4.0.1']].each do |name, flags, expected|
      executable = File.join(root, name)
      output, status = Open3.capture2e('xcrun', '--sdk', 'macosx', 'clang', '-fobjc-arc', '-isysroot', sdk.strip, '-framework', 'Foundation', '-I', fixture, *flags, source, main, '-o', executable)
      assert(status.success?, "官方版本源码编译失败：#{output}")
      output, status = Open3.capture2e(executable)
      assert(status.success? && output.strip == expected, "官方 getter 应返回 #{expected}，实际 #{output}")
    end
  else
    raise 'Lynx iOS getter 编译回归要求 macOS 与 Xcode，不能以缺失编译证据放行'
  end
end
puts 'Lynx source Pod 版本元数据：保留原 getter、精确 spec/source/目标、幂等、冲突拒绝、原生编译读取通过'
