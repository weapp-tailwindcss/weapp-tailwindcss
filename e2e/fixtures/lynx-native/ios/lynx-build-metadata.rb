require 'digest'
require 'json'

# 官方 source Pod 的 LynxVersion.m 要求由构建方提供带五字符前缀的版本宏。
# 只为已核实的 4.0.1 发布源码补齐构建输入，不改写 getter 或运行时证据。
module LynxBuildMetadata
  SOURCE = File.join('platform', 'darwin', 'common', 'lynx', 'base', 'LynxVersion.m')
  SOURCE_SHA = '4a0a2e32bceed9063e344cc632faeb0248984c6035b64134eff8e08f19ab55b8'
  SPEC_SHA256 = '490dcea9b6a2fb6efeff6210679e9bef9f028dc298e56f2f0c5cdc86b6128be4'
  SOURCE_URL = 'https://github.com/lynx-family/lynx/releases/download/4.0.1/Lynx-4.0.1.zip'
  SETTING = 'GCC_PREPROCESSOR_DEFINITIONS'
  MACRO = 'Lynx_POD_VERSION'

  # CDN 可改变空白、转义和对象键序；完整语义身份保留所有属性、数组顺序与值类型。
  def self.canonical_specification(value)
    case value
    when Hash
      raise 'Lynx Podspec 语义键类型无效' unless value.keys.all? { |key| key.is_a?(String) }
      value.keys.sort.each_with_object({}) { |key, output| output[key] = canonical_specification(value.fetch(key)) }
    when Array
      value.map { |entry| canonical_specification(entry) }
    else
      value
    end
  end

  # PodTarget 是解析模型；生成的 PBX 目标只从安装结果的正式映射读取。
  def self.resolve!(installer)
    pods = installer.pod_targets.select { |target| target.pod_name == 'Lynx' }
    raise '缺少受管 Lynx Pod' if pods.empty?
    raise 'Lynx Pod 目标不唯一' unless pods.length == 1
    pod = pods.first
    installation = installer.target_installation_results
    results = installation && installation.pod_target_installation_results
    result_type = Pod::Installer::Xcode::PodsProjectGenerator::TargetInstallationResult
    result = results[pod.name] if results.is_a?(Hash)
    unless result.is_a?(result_type) && result.target.equal?(pod) &&
           results.values.count { |item| item.is_a?(result_type) && item.target.equal?(pod) } == 1
      raise 'Lynx 安装结果缺失、重复或未绑定当前 Pod'
    end
    target = result.native_target
    project = installer.pods_project
    unless target.is_a?(Xcodeproj::Project::Object::PBXNativeTarget) && target.name == 'Lynx' &&
           project.is_a?(Xcodeproj::Project) && target.project.equal?(project) &&
           project.targets.select { |item| item.name == 'Lynx' } == [target]
      raise 'Lynx 原生目标必须唯一且属于当前 Pods 工程'
    end
    unless results.values.count { |item| item.is_a?(result_type) && item.native_target.equal?(target) } == 1
      raise 'Lynx 安装结果将原生目标绑定到多个 Pod'
    end
    [pod, target]
  end

  def self.apply!(root, specification, target)
    raise '版本元数据缺少受管 Lynx Pod' unless specification && specification.name == 'Lynx'
    version = specification.version.to_s
    raise "Lynx source 版本元数据仅适用 4.0.1，当前为 #{version}" unless version == '4.0.1'
    semantic = specification.to_hash
    raise 'Lynx 4.0.1 Podspec 语义类型无效' unless semantic.is_a?(Hash)
    digest = Digest::SHA256.hexdigest(JSON.generate(canonical_specification(semantic)))
    raise "Lynx 4.0.1 Podspec 语义校验失败：#{digest}" unless digest == SPEC_SHA256
    source = specification.source
    raise 'Lynx 4.0.1 来源校验失败' unless source.is_a?(Hash) && source.size == 1 && source.transform_keys(&:to_s) == { 'http' => SOURCE_URL }
    file = File.join(root, SOURCE)
    raise 'Lynx 4.0.1 版本源码校验失败' unless Digest::SHA256.file(file).hexdigest == SOURCE_SHA
    raise '版本元数据必须绑定 Lynx 原生目标' unless target && target.name == 'Lynx'
    raise 'Lynx 原生目标缺少构建配置' if target.build_configurations.empty?

    definition = "#{MACRO}=@\\\"9999_#{version}\\\""
    # 先检查全部配置及逐文件参数，拒绝条件覆盖和重复定义后再统一写入。
    target.source_build_phase.files.each do |source_file|
      flags = (source_file.settings || {})['COMPILER_FLAGS']
      raise 'Lynx 逐文件版本宏存在冲突' if flags.to_s.include?(MACRO)
    end
    updates = target.build_configurations.map do |configuration|
      settings = configuration.build_settings
      settings.each do |key, value|
        if key.start_with?("#{SETTING}[") || (key != SETTING && Array(value).any? { |item| item.to_s.include?(MACRO) })
          raise 'Lynx 版本宏存在条件或其他参数覆盖'
        end
      end
      previous = settings[SETTING]
      unless previous.nil? || previous.is_a?(String) || (previous.is_a?(Array) && previous.all? { |entry| entry.is_a?(String) })
        raise 'Lynx 版本宏构建定义类型无效'
      end
      tokens = Array(previous).flat_map { |entry| entry.split(/\s+/) }.select { |entry| entry.include?(MACRO) }
      raise 'Lynx 版本宏存在冲突或重复定义' unless tokens.empty? || tokens == [definition]
      value = if tokens == [definition]
                previous
              elsif previous.nil? || previous.empty?
                ['$(inherited)', definition]
              elsif previous.is_a?(Array)
                previous + [definition]
              else
                "#{previous} #{definition}"
              end
      [settings, value]
    end
    updates.each { |settings, value| settings[SETTING] = value }
  end
end
