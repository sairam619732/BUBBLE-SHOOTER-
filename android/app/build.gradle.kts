import java.util.Properties
import javax.inject.Inject

plugins {
    id("com.android.application")
}

// ---- Release signing ------------------------------------------------------------------
// Either set environment variables (used by GitHub Actions):
//   ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
// or create android/keystore.properties with storeFile, storePassword, keyAlias, keyPassword.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(env: String, prop: String): String? =
    System.getenv(env)?.takeIf { it.isNotBlank() } ?: keystoreProps.getProperty(prop)

val releaseStoreFile = signingValue("ANDROID_KEYSTORE_FILE", "storeFile")?.let { rootProject.file(it) }

// ---- AdMob -----------------------------------------------------------------------------
// Your IDs go in android/gradle.properties (admobAppId, admobRewardedId, admobInterstitialId).
// Empty values fall back to Google's sample IDs, which only ever show test ads.
// Debug builds always use test ad units, so you never see (or click) your own live ads.
val testAdmobAppId = "ca-app-pub-3940256099942544~3347511713"
val testRewardedId = "ca-app-pub-3940256099942544/5224354917"
val testInterstitialId = "ca-app-pub-3940256099942544/1033173712"
fun gradleProp(name: String, fallback: String): String =
    findProperty(name)?.toString()?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
val admobAppId = gradleProp("admobAppId", testAdmobAppId)
val admobRewardedId = gradleProp("admobRewardedId", testRewardedId)
val admobInterstitialId = gradleProp("admobInterstitialId", testInterstitialId)

// versionCode must increase for every Play upload. CI passes the run number.
val appVersionCode = (System.getenv("VERSION_CODE") ?: findProperty("versionCode")?.toString() ?: "1").toInt()
val appVersionName = System.getenv("VERSION_NAME") ?: findProperty("versionName")?.toString() ?: "1.0.0"

android {
    namespace = "io.github.sairam619732.bubbleshooter"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.sairam619732.bubbleshooter"
        minSdk = 24
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName
        manifestPlaceholders["admobAppId"] = admobAppId
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (releaseStoreFile != null && releaseStoreFile.exists()) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = signingValue("ANDROID_KEYSTORE_PASSWORD", "storePassword")
                keyAlias = signingValue("ANDROID_KEY_ALIAS", "keyAlias")
                keyPassword = signingValue("ANDROID_KEY_PASSWORD", "keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
            buildConfigField("String", "REWARDED_ID", "\"$admobRewardedId\"")
            buildConfigField("String", "INTERSTITIAL_ID", "\"$admobInterstitialId\"")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "REWARDED_ID", "\"$testRewardedId\"")
            buildConfigField("String", "INTERSTITIAL_ID", "\"$testInterstitialId\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    lint {
        // The game is portrait-only by design; large screens letterbox it.
        disable += setOf("DiscouragedApi", "LockedOrientationActivity")
    }
}

dependencies {
    // Newest release within these major versions, resolved at build time.
    implementation("com.google.android.gms:play-services-ads:24.+")
    implementation("com.google.android.ump:user-messaging-platform:3.+")
}

// ---- Web game assets ------------------------------------------------------------------
// The game itself lives in ../web. Build it first (cd web && npm ci && npm run build);
// this task copies web/dist into the APK under assets/www.
abstract class CopyWebAssets @Inject constructor(private val fs: FileSystemOperations) : DefaultTask() {
    @get:InputFiles
    abstract val webDist: ConfigurableFileCollection

    @get:Internal
    abstract val webDistDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val dist = webDistDir.get().asFile
        if (!dist.resolve("index.html").exists()) {
            throw GradleException("Web game not built: ${dist.path} is missing.\nRun:  cd web && npm ci && npm run build")
        }
        fs.sync {
            from(dist)
            into(outputDir.dir("www"))
        }
    }
}

val webDistPath = rootProject.layout.projectDirectory.dir("../web/dist")
val copyWebAssets = tasks.register<CopyWebAssets>("copyWebAssets") {
    webDist.from(webDistPath)
    webDistDir.set(webDistPath)
    outputDir.set(layout.buildDirectory.dir("generated/webAssets"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebAssets, CopyWebAssets::outputDir)
    }
}
