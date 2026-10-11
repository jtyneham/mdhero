plugins { id("com.android.application") version "8.11.0" }
layout.buildDirectory.set(file("../../artifacts/provider-build"))
android {
    namespace = "com.mdhero.providerfixture"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.mdhero.providerfixture"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}
