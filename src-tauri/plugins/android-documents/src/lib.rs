use serde_json::Value;
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime, State,
};

struct Documents<R: Runtime>(PluginHandle<R>);

#[tauri::command]
async fn execute<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: State<'_, Documents<R>>,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    const ACTIONS: &[&str] = &[
        "pick",
        "create",
        "pickTree",
        "read",
        "write",
        "stat",
        "listTree",
        "resolve",
        "asset",
        "pending",
        "share",
        "copy",
        "print",
        "background",
        "fetchUrl",
        "draftLoad",
        "draftSave",
        "appearance",
        "confirm",
    ];
    if !ACTIONS.contains(&action.as_str()) {
        return Err("Unsupported document action".into());
    }
    let handle = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        handle
            .run_mobile_plugin::<Value>(&action, payload)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-documents")
        .invoke_handler(tauri::generate_handler![execute])
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.mdhero.documents", "DocumentsPlugin")?;
            app.manage(Documents(handle));
            Ok(())
        })
        .build()
}
