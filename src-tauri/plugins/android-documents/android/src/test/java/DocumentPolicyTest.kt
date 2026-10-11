package com.mdhero.documents
import org.junit.Test
import org.junit.Assert.assertEquals

class DocumentPolicyTest {
    @Test fun resolvesSiblingWithSpaces() { assertEquals("notes/image one.png", DocumentPolicy.resolvePath("notes/readme.md", "./image one.png")) }
    @Test fun resolvesParentInsideGrantedTree() { assertEquals("images/a.png", DocumentPolicy.resolvePath("notes/readme.md", "../images/a.png")) }
    @Test(expected = IllegalArgumentException::class) fun rejectsTreeEscape() { DocumentPolicy.resolvePath("notes/readme.md", "../../secrets.txt") }
    @Test(expected = IllegalArgumentException::class) fun rejectsAbsolutePath() { DocumentPolicy.resolvePath("readme.md", "/sdcard/a.md") }
    @Test(expected = IllegalArgumentException::class) fun rejectsContentUriInjection() { DocumentPolicy.resolvePath("readme.md", "content://provider/secrets") }
    @Test(expected = IllegalArgumentException::class) fun rejectsMixedSeparators() { DocumentPolicy.resolvePath("notes/readme.md", "..\\..\\secret.md") }
}
