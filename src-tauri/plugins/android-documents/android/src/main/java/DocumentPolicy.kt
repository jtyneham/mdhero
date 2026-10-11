package com.mdhero.documents

object DocumentPolicy {
    fun resolvePath(sourcePath: String, relative: String): String {
        require(!relative.startsWith('/') && !relative.contains(':') && !relative.contains('\\')) { "Only relative document links are allowed" }
        val parts = sourcePath.split('/').dropLast(1).toMutableList()
        for (part in relative.split('/')) when (part) {
            "", "." -> {}
            ".." -> { require(parts.isNotEmpty()) { "Link is outside the selected folder" }; parts.removeAt(parts.lastIndex) }
            else -> parts.add(part)
        }
        return parts.joinToString("/")
    }
}
