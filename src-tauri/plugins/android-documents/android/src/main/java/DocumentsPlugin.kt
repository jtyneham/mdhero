package com.mdhero.documents

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

@InvokeArg
class DocumentArgs {
    var uri: String = ""
    var name: String = "Untitled.md"
    var content: String = ""
    var expected: String? = null
    var html: String? = null
    var relative: String = ""
    var url: String = ""
    var dark: Boolean = false
    var confirmLabel: String = "Continue"
}
data class Location(val tree: Uri, val path: String)

@TauriPlugin
class DocumentsPlugin(private val activity: Activity) : Plugin(activity) {
    private val resolver = activity.contentResolver
    private val prefs = activity.getSharedPreferences("mdhero-documents", Context.MODE_PRIVATE)
    private val worker = Executors.newSingleThreadExecutor()
    private val locations = mutableMapOf<String, Location>()
    private val pendingUris = mutableListOf<String>()
    private lateinit var view: WebView
    private val textExtensions = setOf("md", "markdown", "mdown", "mkd", "mdx", "txt", "text")
    private val imageTypes = mapOf("png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "gif" to "image/gif", "webp" to "image/webp", "bmp" to "image/bmp", "avif" to "image/avif", "svg" to "image/svg+xml")

    override fun load(webView: WebView) {
        view = webView
        view.settings.textZoom = (activity.resources.configuration.fontScale * 100).toInt().coerceIn(80, 200)
        WebView.setWebContentsDebuggingEnabled(activity.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0)
        (activity as AppCompatActivity).onBackPressedDispatcher.addCallback(activity, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { view.evaluateJavascript("window.dispatchEvent(new Event('mdhero-back'))", null) }
        })
        // Tauri 2.11 generates a process observer but does not register it.
        // Observe this activity directly, including quick switches and pickers.
        activity.lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onResume(owner: LifecycleOwner) { this@DocumentsPlugin.onResume() }
            override fun onPause(owner: LifecycleOwner) { this@DocumentsPlugin.onPause() }
        })
        receiveIntent(activity.intent)
    }
    override fun onNewIntent(intent: Intent) { receiveIntent(intent) }
    override fun onPause() {
        if (::view.isInitialized) view.evaluateJavascript("window.dispatchEvent(new Event('mdhero-pause'))", null)
    }
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        if (::view.isInitialized) {
            view.settings.textZoom = (newConfig.fontScale * 100).toInt().coerceIn(80, 200)
            updateInsets()
        }
    }
    override fun onResume() {
        if (::view.isInitialized) view.post { updateInsets(); view.evaluateJavascript("window.dispatchEvent(new Event('mdhero-resume'))", null) }
    }
    private fun updateInsets() {
        view.post {
            val insets = view.rootWindowInsets ?: return@post
            val bottom = androidx.core.view.WindowInsetsCompat.toWindowInsetsCompat(insets, view)
                .getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()).bottom / activity.resources.displayMetrics.density
            view.evaluateJavascript("document.documentElement.style.setProperty('--android-bottom', '${bottom}px')", null)
        }
    }
    private fun receiveIntent(intent: Intent) {
        val uris = when (intent.action) {
            Intent.ACTION_VIEW -> listOfNotNull(intent.data)
            Intent.ACTION_SEND -> listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
            Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
            else -> emptyList()
        }.filter { it.scheme == "content" }
        if (uris.isEmpty()) return
        for (uri in uris) {
            remember(uri, intent.flags)
            synchronized(pendingUris) { if (!pendingUris.contains(uri.toString())) pendingUris.add(uri.toString()) }
        }
        if (::view.isInitialized) view.post { view.evaluateJavascript("window.dispatchEvent(new Event('mdhero-open'))", null) }
        // Do not mutate Activity.intent: Android/framework lifecycle code can
        // reuse it when returning to a task. This queue consumes deliveries.
    }
    private fun remember(uri: Uri, flags: Int) {
        require(uri.scheme == "content") { "Only user-selected content URIs are supported" }
        val access = flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (access != 0) try { resolver.takePersistableUriPermission(uri, access) } catch (_: SecurityException) {}
        val known = prefs.getStringSet("documents", emptySet())!!.toMutableSet()
        known.add(uri.toString())
        prefs.edit().putStringSet("documents", known).apply()
    }
    private fun authorized(value: String): Uri {
        val uri = Uri.parse(value)
        require(uri.scheme == "content" && prefs.getStringSet("documents", emptySet())!!.contains(value)) { "Select this document or its folder first" }
        return uri
    }
    private fun name(uri: Uri): String {
        try {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                val column = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (column >= 0 && it.moveToFirst() && !it.isNull(column)) {
                    val value = it.getString(column)
                    if (!value.isNullOrBlank()) return value
                }
            }
        } catch (_: RuntimeException) {
            // Open With providers may omit metadata or reject projections.
            // The actual stream operation below still enforces OS access.
        }
        return uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "Untitled.md"
    }
    private fun textUri(value: String): Uri {
        val uri = authorized(value)
        val displayName = name(uri)
        val extension = displayName.substringAfterLast('.', "").lowercase()
        val mime = try { resolver.getType(uri)?.substringBefore(';')?.lowercase() } catch (_: RuntimeException) { null }
        require(extension in textExtensions || (extension.isEmpty() && mime in setOf("text/markdown", "text/x-markdown", "text/plain", "application/markdown"))) { "Choose a Markdown or text document" }
        return uri
    }
    private fun java.io.InputStream.readLimited(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val chunk = ByteArray(8192)
        while (true) {
            val size = read(chunk)
            if (size < 0) break
            require(output.size() + size <= limit) { "Document exceeds the supported size" }
            output.write(chunk, 0, size)
        }
        return output.toByteArray()
    }
    private fun bytes(uri: Uri, limit: Int): ByteArray = resolver.openInputStream(uri)?.use { it.readLimited(limit) }
        ?: throw IllegalStateException("Cannot read document. Select it again to renew access.")
    private fun decode(data: ByteArray): String = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data)).toString()
    private fun readText(uri: Uri): String = decode(bytes(uri, 64 * 1024 * 1024))
    private fun info(uri: Uri): JSObject {
        var writable = activity.checkUriPermission(uri, android.os.Process.myPid(), android.os.Process.myUid(), Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == PackageManager.PERMISSION_GRANTED
        // COLUMN_FLAGS belongs to DocumentsProvider, not every content URI.
        // FileProvider commonly returns a zero-column cursor for this query.
        if (DocumentsContract.isDocumentUri(activity, uri)) try {
            resolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_FLAGS), null, null, null)?.use {
                val column = it.getColumnIndex(DocumentsContract.Document.COLUMN_FLAGS)
                if (column >= 0 && it.moveToFirst() && !it.isNull(column))
                    writable = writable && it.getInt(column) and DocumentsContract.Document.FLAG_SUPPORTS_WRITE != 0
            }
        } catch (_: RuntimeException) {
            // Optional capabilities cannot make an otherwise readable file fail.
        }
        return JSObject().apply {
            put("uri", uri.toString()); put("name", name(uri)); put("writable", writable)
            put("persistent", resolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission })
        }
    }
    private fun work(invoke: Invoke, block: () -> JSObject) {
        worker.execute { try { invoke.resolve(block()) } catch (e: Exception) { invoke.reject(e.message ?: "Document operation failed") } }
    }
    @Command fun pick(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
        intent.type = "*/*"
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        startActivityForResult(invoke, intent, "picked")
    }
    @Command fun create(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
        intent.type = "text/markdown"
        intent.putExtra(Intent.EXTRA_TITLE, if (args.name.substringAfterLast('.', "").lowercase() in textExtensions) args.name else "${args.name}.md")
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        startActivityForResult(invoke, intent, "picked")
    }
    @ActivityCallback fun picked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) { invoke.resolve(JSObject().apply { put("uris", JSArray()) }); return }
        val data = result.data ?: return invoke.reject("No document returned")
        val uris = mutableListOf<Uri>()
        data.clipData?.let { for (i in 0 until it.itemCount) uris.add(it.getItemAt(i).uri) } ?: data.data?.let { uris.add(it) }
        try {
            uris.forEach { remember(it, data.flags) }
            invoke.resolve(JSObject().apply { put("uris", JSArray.from(uris.map { it.toString() }.toTypedArray())) })
        } catch (e: Exception) { invoke.reject(e.message ?: "Cannot access document") }
    }
    @Command fun pickTree(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        startActivityForResult(invoke, intent, "treePicked")
    }
    @ActivityCallback fun treePicked(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) { invoke.resolve(JSObject()); return }
        try {
            remember(uri, result.data!!.flags)
            val trees = prefs.getStringSet("trees", emptySet())!!.toMutableSet().apply { add(uri.toString()) }
            prefs.edit().putStringSet("trees", trees).apply()
            val root = DocumentsContract.buildDocumentUriUsingTree(uri, DocumentsContract.getTreeDocumentId(uri))
            invoke.resolve(JSObject().apply { put("uri", uri.toString()); put("name", name(root)) })
        } catch (e: Exception) { invoke.reject(e.message ?: "Cannot access folder") }
    }
    @Command fun read(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) { val uri = textUri(args.uri); info(uri).apply { put("content", readText(uri)) } }
    }
    @Command fun stat(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) {
            val uri = textUri(args.uri)
            // Metadata can be absent even for readable files. Check the actual
            // stream so fallback names cannot disguise missing/revoked access.
            resolver.openInputStream(uri)?.use { } ?: throw IllegalStateException("Document is unavailable. Select it again to renew access.")
            info(uri)
        }
    }
    @Command fun write(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) {
            val uri = textUri(args.uri)
            if (args.expected != null && readText(uri) != args.expected) throw IllegalStateException("CONFLICT: Document changed outside MDHero. Reload or confirm overwrite.")
            resolver.openOutputStream(uri, "wt")?.use { it.write(args.content.toByteArray(Charsets.UTF_8)) }
                ?: throw IllegalStateException("Document is read-only. Use Save As to choose a writable destination.")
            info(uri)
        }
    }
    private fun enumerate(tree: Uri): JSArray {
        require(prefs.getStringSet("trees", emptySet())!!.contains(tree.toString())) { "Select this folder first" }
        val ret = JSArray()
        var visited = 0
        fun walk(id: String, parent: String, depth: Int) {
            require(depth <= 32 && visited <= 10000) { "Folder is too large; pin a smaller folder" }
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id)
            resolver.query(children, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_LAST_MODIFIED), null, null, null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    visited++
                    require(visited <= 10000) { "Folder is too large; pin a smaller folder" }
                    val childId = cursor.getString(0)
                    val childName = cursor.getString(1)
                    val relative = if (parent.isEmpty()) childName else "$parent/$childName"
                    if (cursor.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR) walk(childId, relative, depth + 1)
                    else {
                        val uri = DocumentsContract.buildDocumentUriUsingTree(tree, childId)
                        locations[uri.toString()] = Location(tree, relative)
                        if (childName.substringAfterLast('.', "").lowercase() in textExtensions) {
                            remember(uri, 0)
                            ret.put(JSObject().apply { put("name", childName); put("path", uri.toString()); put("rel_path", relative); put("modified", cursor.getLong(3)) })
                        }
                    }
                }
            }
        }
        locations.entries.removeAll { it.value.tree == tree }
        walk(DocumentsContract.getTreeDocumentId(tree), "", 0)
        return ret
    }
    @Command fun listTree(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) { JSObject().apply { put("files", enumerate(Uri.parse(args.uri))) } }
    }
    private fun resolveRelative(document: Uri, relative: String): Uri {
        require(!relative.startsWith('/') && !relative.contains(':') && !relative.contains('\\')) { "Only relative document links are allowed" }
        var location = locations[document.toString()]
        if (location == null) for (value in prefs.getStringSet("trees", emptySet())!!) {
            val tree = Uri.parse(value)
            if (tree.authority != document.authority) continue
            try { enumerate(tree) } catch (_: Exception) { continue }
            location = locations.entries.firstOrNull {
                try { Uri.parse(it.key).authority == document.authority && DocumentsContract.getDocumentId(Uri.parse(it.key)) == DocumentsContract.getDocumentId(document) } catch (_: Exception) { false }
            }?.value
            if (location != null) break
        }
        val source = location ?: throw IllegalStateException("Pin the document's folder to grant access to relative links and images")
        val targetPath = DocumentPolicy.resolvePath(source.path, relative)
        enumerate(source.tree)
        val target = locations.entries.firstOrNull { it.value.tree == source.tree && it.value.path == targetPath }
            ?: throw IllegalStateException("Linked file is unavailable")
        return Uri.parse(target.key)
    }
    @Command fun resolve(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) {
            val uri = resolveRelative(textUri(args.uri), Uri.decode(args.relative))
            val ext = name(uri).substringAfterLast('.', "").lowercase()
            require(ext in textExtensions || ext in imageTypes || ext == "pdf") { "This linked file type is not supported" }
            remember(uri, 0)
            JSObject().apply { put("uri", uri.toString()); put("name", name(uri)); put("text", ext in textExtensions) }
        }
    }
    @Command fun asset(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) {
            val uri = resolveRelative(textUri(args.uri), Uri.decode(args.relative))
            val mime = imageTypes[name(uri).substringAfterLast('.', "").lowercase()] ?: throw IllegalStateException("Only document images may be displayed")
            JSObject().apply { put("data", "data:$mime;base64," + Base64.encodeToString(bytes(uri, 16 * 1024 * 1024), Base64.NO_WRAP)) }
        }
    }
    @Command fun pending(invoke: Invoke) {
        val uris = synchronized(pendingUris) { pendingUris.toList().also { pendingUris.clear() } }
        invoke.resolve(JSObject().apply { put("uris", JSArray.from(uris.toTypedArray())) })
    }
    @Command fun copy(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        activity.runOnUiThread {
            val clip = if (args.html != null) ClipData.newHtmlText("MDHero", args.content, args.html) else ClipData.newPlainText("MDHero", args.content)
            (activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(clip)
            invoke.resolve(JSObject())
        }
    }
    @Command fun share(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) {
            val share = Intent(Intent.ACTION_SEND)
            val uri: Uri
            if (args.uri.isNotEmpty()) {
                uri = authorized(args.uri)
                val ext = name(uri).substringAfterLast('.', "").lowercase()
                require(ext in textExtensions || ext in imageTypes || ext == "pdf") { "Unsupported shared document" }
                share.type = if (ext in textExtensions) "text/markdown" else imageTypes[ext] ?: "application/pdf"
            } else {
                val directory = File(activity.cacheDir, "shared").apply { mkdirs() }
                val safeName = args.name.substringAfterLast('/').substringAfterLast('\\').let { if (it.endsWith(".md")) it else "$it.md" }
                val file = File(directory, safeName)
                file.writeText(args.content)
                uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
                share.type = "text/markdown"
            }
            share.putExtra(Intent.EXTRA_STREAM, uri)
            share.clipData = ClipData.newRawUri("MDHero", uri)
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            activity.runOnUiThread { activity.startActivity(Intent.createChooser(share, "Share document")) }
            JSObject()
        }
    }
    @Command fun print(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        activity.runOnUiThread {
            try {
                val manager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
                manager.print(args.name, view.createPrintDocumentAdapter(args.name), PrintAttributes.Builder().build())
                invoke.resolve(JSObject())
            } catch (e: Exception) { invoke.reject(e.message ?: "Printing failed") }
        }
    }
    @Command fun background(invoke: Invoke) {
        activity.runOnUiThread { activity.moveTaskToBack(true); invoke.resolve(JSObject()) }
    }
    @Command fun appearance(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        activity.runOnUiThread {
            val controller = androidx.core.view.WindowInsetsControllerCompat(activity.window, view)
            controller.isAppearanceLightStatusBars = !args.dark
            controller.isAppearanceLightNavigationBars = !args.dark
            updateInsets()
            invoke.resolve(JSObject())
        }
    }
    @Command fun confirm(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        activity.runOnUiThread {
            fun finish(confirmed: Boolean) { invoke.resolve(JSObject().apply { put("confirmed", confirmed) }) }
            androidx.appcompat.app.AlertDialog.Builder(activity)
                .setTitle(args.name).setMessage(args.content)
                .setPositiveButton("Keep Editing") { _, _ -> finish(false) }
                .setNegativeButton(args.confirmLabel) { _, _ -> finish(true) }
                .setOnCancelListener { finish(false) }
                .show()
        }
    }
    @Command fun draftLoad(invoke: Invoke) {
        work(invoke) {
            val file = File(activity.filesDir, "draft-session.json")
            val content = if (file.exists()) android.util.AtomicFile(file).openRead().use { decode(it.readLimited(16 * 1024 * 1024)) } else null
            JSObject().apply { put("content", content) }
        }
    }
    @Command fun draftSave(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) {
            require(args.content.toByteArray(Charsets.UTF_8).size <= 16 * 1024 * 1024) { "Draft backup is full. Save your changes before leaving MDHero." }
            val file = File(activity.filesDir, "draft-session.json")
            val atomic = android.util.AtomicFile(file)
            val stream = atomic.startWrite()
            try { stream.write(args.content.toByteArray(Charsets.UTF_8)); atomic.finishWrite(stream) }
            catch (e: Exception) { atomic.failWrite(stream); throw e }
            JSObject()
        }
    }
    @Command fun fetchUrl(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        work(invoke) {
            var url = java.net.URL(args.url)
            var content: String? = null
            for (redirect in 0..5) {
                require(url.protocol == "https" && url.userInfo == null) { "Only public HTTPS URLs are supported" }
                require(java.net.InetAddress.getAllByName(url.host).all { !it.isAnyLocalAddress && !it.isLoopbackAddress && !it.isLinkLocalAddress && !it.isSiteLocalAddress && !it.isMulticastAddress }) { "Private network URLs are not supported" }
                val connection = url.openConnection() as HttpsURLConnection
                connection.connectTimeout = 15000; connection.readTimeout = 15000; connection.instanceFollowRedirects = false
                try {
                    if (connection.responseCode in 300..399) { url = java.net.URL(url, connection.getHeaderField("Location")); continue }
                    require(connection.responseCode in 200..299) { "Failed to fetch (${connection.responseCode})" }
                    content = connection.inputStream.use { decode(it.readLimited(16 * 1024 * 1024)) }
                    break
                } finally { connection.disconnect() }
            }
            JSObject().apply { put("content", content ?: throw IllegalStateException("Too many URL redirects")) }
        }
    }
}
