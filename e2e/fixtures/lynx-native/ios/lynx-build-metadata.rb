require 'digest'

# 官方 source Pod 的 LynxVersion.m 要求由构建方提供带五字符前缀的版本宏。
# 只为已核实的 4.0.1 发布源码补齐构建输入，不改写 getter 或运行时证据。
module LynxBuildMetadata
  SOURCE = File.join('platform', 'darwin', 'common', 'lynx', 'base', 'LynxVersion.m')
  SOURCE_SHA = '4a0a2e32bceed9063e344cc632faeb0248984c6035b64134eff8e08f19ab55b8'
  SPEC_CHECKSUM = 'ccabb2322b26f64a8d9ce4b8d7ae9871cda6c441'
  SOURCE_URL = 'https://github.com/lynx-family/lynx/releases/download/4.0.1/Lynx-4.0.1.zip'
  SETTING = 'GCC_PREPROCESSOR_DEFINITIONS'
  MACRO = 'Lynx_POD_VERSION'

  def self.apply!(root, specification, target)
    raise '版本元数据缺少受管 Lynx Pod' unless specification && specification.name == 'Lynx'
    version = specification.version.to_s
    raise "Lynx source 版本元数据仅适用 4.0.1，当前为 #{version}" unless version == '4.0.1'
    raise 'Lynx 4.0.1 Podspec 校验失败' unless specification.checksum == SPEC_CHECKSUM
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
