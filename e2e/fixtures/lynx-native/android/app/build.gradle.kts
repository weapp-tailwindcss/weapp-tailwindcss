import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.zip.ZipFile
import org.gradle.api.artifacts.component.ModuleComponentIdentifier

plugins {
  id("com.android.application")
}

abstract class GenerateLynxSdkIdentity : DefaultTask() {
  @get:InputFile @get:PathSensitive(PathSensitivity.NONE)
  abstract val aarFile: RegularFileProperty
  @get:InputFile @get:PathSensitive(PathSensitivity.NONE)
  abstract val contextFile: RegularFileProperty
  @get:InputFile @get:PathSensitive(PathSensitivity.NONE)
  abstract val bundleFile: RegularFileProperty
  @get:InputFile @get:PathSensitive(PathSensitivity.NONE)
  abstract val referenceFile: RegularFileProperty
  @get:Input abstract val component: Property<String>
  @get:Input abstract val artifactVersion: Property<String>
  @get:OutputDirectory abstract val assetsDirectory: DirectoryProperty
  @get:OutputFile abstract val evidenceAar: RegularFileProperty
  @get:OutputFile abstract val evidenceManifest: RegularFileProperty

  private fun hash(input: java.io.InputStream): String = input.use {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(8192)
    var length = it.read(buffer)
    while (length != -1) {
      digest.update(buffer, 0, length)
      length = it.read(buffer)
    }
    digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 255) }
  }

  @TaskAction
  fun generate() {
    val parser = JsonSlurper()
    val reference = parser.parse(referenceFile.get().asFile) as Map<*, *>
    val context = parser.parse(contextFile.get().asFile) as Map<*, *>
    val aar = aarFile.get().asFile
    val aarHash = hash(aar.inputStream())
    check(component.get() == reference["component"] && artifactVersion.get() == reference["artifactVersion"] && aarHash == reference["aarSha256"]) {
      "Resolved Lynx SDK component or original AAR fingerprint differs from reviewed reference"
    }
    check(context["version"] == 1 && context["runId"].toString().matches(Regex("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"))
      && context["bundleSha256"] == hash(bundleFile.get().asFile.inputStream())) { "SDK identity requires current run and actual bundle" }
    val libraries = linkedMapOf<String, String>()
    ZipFile(aar).use { zip ->
      for ((abi, expected) in reference["libraries"] as Map<*, *>) {
        val name = "jni/$abi/liblynx.so"
        val entries = zip.entries().asSequence().filter { it.name == name }.toList()
        check(entries.size == 1) { "Missing or duplicate resolved ABI library: $name" }
        val actual = hash(zip.getInputStream(entries.single()))
        check(actual == expected) { "Resolved native SDK bytes differ: $abi" }
        libraries[abi.toString()] = actual
      }
    }
    val manifest = linkedMapOf(
      "version" to 1, "source" to "lynx-gradle-resolved-sdk-v1", "runId" to context["runId"], "bundleSha256" to context["bundleSha256"],
      "component" to component.get(), "artifactVersion" to artifactVersion.get(), "aarSha256" to aarHash, "libraries" to libraries
    )
    val output = assetsDirectory.file("lynx-sdk-identity.json").get().asFile
    val manifestSource = JsonOutput.prettyPrint(JsonOutput.toJson(manifest)) + "\n"
    output.parentFile.mkdirs()
    output.writeText(manifestSource, Charsets.UTF_8)
    val savedManifest = evidenceManifest.get().asFile
    savedManifest.parentFile.mkdirs()
    savedManifest.writeText(manifestSource, Charsets.UTF_8)
    val savedAar = evidenceAar.get().asFile
    savedAar.parentFile.mkdirs()
    Files.copy(aar.toPath(), savedAar.toPath(), StandardCopyOption.REPLACE_EXISTING)
  }
}

android {
  namespace = "com.weapptailwindcss.lynxcompat"
  compileSdk = providers.gradleProperty("lynxCompileSdk").orNull?.toInt() ?: 35
  buildToolsVersion = providers.gradleProperty("lynxBuildToolsVersion").orNull ?: "35.0.0"

  defaultConfig {
    applicationId = "com.weapptailwindcss.lynxcompat"
    minSdk = 24
    targetSdk = 35
    versionCode = 1
    versionName = "1.0"
  }

  packaging {
    jniLibs.pickFirsts += setOf("lib/*/libc++_shared.so")
    // 原生验收逐字节核对官方 AAR 与 APK；保留 liblynx.so，避免 strip 改写证据。
    jniLibs.keepDebugSymbols += "**/liblynx.so"
  }
}

androidComponents.onVariants(androidComponents.selector().withBuildType("debug")) { variant ->
  val resolved = configurations.named("${variant.name}RuntimeClasspath").flatMap { it.incoming.artifacts.resolvedArtifacts }.map { artifacts ->
    artifacts.filter {
      val id = it.id.componentIdentifier
      id is ModuleComponentIdentifier && id.group == "org.lynxsdk.lynx" && id.module == "lynx"
    }.single().also { check(it.file.extension == "aar") { "Expected original resolved Lynx AAR" } }
  }
  val identity = tasks.register<GenerateLynxSdkIdentity>("generateLynxSdkIdentity${variant.name.replaceFirstChar { it.uppercase() }}") {
    aarFile.set(layout.file(resolved.map { it.file }))
    component.set(resolved.map { (it.id.componentIdentifier as ModuleComponentIdentifier).let { id -> "${id.group}:${id.module}:${id.version}" } })
    artifactVersion.set(resolved.map { (it.id.componentIdentifier as ModuleComponentIdentifier).version })
    contextFile.set(layout.projectDirectory.file("src/main/assets/run-context.json"))
    bundleFile.set(layout.projectDirectory.file("src/main/assets/main.lynx.bundle"))
    referenceFile.set(rootProject.layout.projectDirectory.file("sdk-reference.json"))
    assetsDirectory.set(layout.buildDirectory.dir("generated/lynxSdkIdentity/${variant.name}/assets"))
    evidenceAar.set(layout.buildDirectory.file("lynxSdkEvidence/${variant.name}/resolved.aar"))
    evidenceManifest.set(layout.buildDirectory.file("lynxSdkEvidence/${variant.name}/resolved.json"))
  }
  variant.sources.assets?.addGeneratedSourceDirectory(identity, GenerateLynxSdkIdentity::assetsDirectory)
}

dependencies {
  implementation("androidx.core:core:1.15.0")
  implementation("org.lynxsdk.lynx:lynx:4.0.1")
}
