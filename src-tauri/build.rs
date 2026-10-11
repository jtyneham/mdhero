fn main() {
    tauri_build::build();
    // The harness-free menu integration test uses TaskDialogIndirect through
    // muda. Unlike the Tauri application binary, it has no generated manifest.
    // Request Common Controls v6 so the Windows loader can resolve that import.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-tests=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
}
