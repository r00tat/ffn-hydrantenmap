package at.ffnd.einsatzkarte

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerUrlValidationTest {

    @Test
    fun acceptsValidHttpAndHttpsUrls() {
        assertTrue(ServerUrlValidation.isValidHttpUrl("https://einsatz.ffnd.at"))
        assertTrue(ServerUrlValidation.isValidHttpUrl("http://192-168-1-226.nip.io:3000"))
        assertTrue(ServerUrlValidation.isValidHttpUrl("  https://einsatz.ffnd.at/path  "))
    }

    @Test
    fun rejectsNullEmptyAndBlank() {
        assertFalse(ServerUrlValidation.isValidHttpUrl(null))
        assertFalse(ServerUrlValidation.isValidHttpUrl(""))
        assertFalse(ServerUrlValidation.isValidHttpUrl("   "))
    }

    @Test
    fun rejectsUrlsWithoutScheme() {
        // These are exactly the inputs that made Capacitor's `new URL(...)` throw
        // and left appUrl null -> startup crash.
        assertFalse(ServerUrlValidation.isValidHttpUrl("einsatz.ffnd.at"))
        assertFalse(ServerUrlValidation.isValidHttpUrl("www.example.com/foo"))
    }

    @Test
    fun rejectsNonHttpSchemesAndMalformedUrls() {
        assertFalse(ServerUrlValidation.isValidHttpUrl("ftp://einsatz.ffnd.at"))
        assertFalse(ServerUrlValidation.isValidHttpUrl("javascript:alert(1)"))
        assertFalse(ServerUrlValidation.isValidHttpUrl("https://"))
        assertFalse(ServerUrlValidation.isValidHttpUrl("not a url"))
    }
}
