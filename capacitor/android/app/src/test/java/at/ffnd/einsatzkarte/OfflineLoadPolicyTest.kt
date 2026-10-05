package at.ffnd.einsatzkarte

import android.webkit.WebViewClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineLoadPolicyTest {

    @Test
    fun treatsNetworkErrorsAsOffline() {
        for (code in listOf(
            WebViewClient.ERROR_HOST_LOOKUP, // ERR_INTERNET_DISCONNECTED, ERR_NAME_NOT_RESOLVED
            WebViewClient.ERROR_CONNECT,
            WebViewClient.ERROR_TIMEOUT,
            WebViewClient.ERROR_IO,
            WebViewClient.ERROR_PROXY_AUTHENTICATION,
        )) {
            assertTrue("code $code", OfflineLoadPolicy.isConnectivityError(code, true))
            assertTrue("code $code", OfflineLoadPolicy.isConnectivityError(code, false))
        }
    }

    @Test
    fun treatsUnknownErrorAsOfflineOnlyWithoutValidatedNetwork() {
        // ERR_FAILED, ERR_NETWORK_CHANGED, ERR_EMPTY_RESPONSE landen alle bei
        // ERROR_UNKNOWN. Ohne Netz ist das ein Funkloch, mit Netz ein echter
        // Fehler, für den der Dialog samt „URL ändern" gedacht ist.
        assertTrue(OfflineLoadPolicy.isConnectivityError(WebViewClient.ERROR_UNKNOWN, false))
        assertFalse(OfflineLoadPolicy.isConnectivityError(WebViewClient.ERROR_UNKNOWN, true))
    }

    @Test
    fun keepsConfigurationErrorsForTheDialog() {
        for (code in listOf(
            WebViewClient.ERROR_BAD_URL,
            WebViewClient.ERROR_UNSUPPORTED_SCHEME,
            WebViewClient.ERROR_FAILED_SSL_HANDSHAKE,
            WebViewClient.ERROR_REDIRECT_LOOP,
        )) {
            assertFalse("code $code", OfflineLoadPolicy.isConnectivityError(code, false))
        }
    }

    @Test
    fun recognisesAPageServedByTheServiceWorker() {
        // Der Fall vom Kaltstart: WebView meldet den Fehler der Netzanfrage,
        // die Seite selbst kam aber aus dem Cache des Service Workers.
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.PAGE_LOADED,
            OfflineLoadPolicy.classifyProbe("\"app\"", 100, 0),
        )
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.PAGE_LOADED,
            OfflineLoadPolicy.classifyProbe("\"app\"", 40, 0),
        )
    }

    @Test
    fun recognisesTheOverlay() {
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.OVERLAY,
            OfflineLoadPolicy.classifyProbe("\"overlay\"", 100, 0),
        )
    }

    @Test
    fun waitsWhileTheNavigationIsStillRunning() {
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.LOADING,
            OfflineLoadPolicy.classifyProbe("\"other:about:blank\"", 10, 0),
        )
    }

    @Test
    fun givesUpWaitingAfterTheLastProbe() {
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.ERROR_PAGE,
            OfflineLoadPolicy.classifyProbe(
                "\"other:about:blank\"",
                10,
                OfflineLoadPolicy.MAX_PROBES,
            ),
        )
    }

    @Test
    fun treatsTheChromiumErrorPageAsError() {
        // Auf der Fehlerseite läuft unter Umständen gar kein Skript; dann
        // liefert evaluateJavascript "null".
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.ERROR_PAGE,
            OfflineLoadPolicy.classifyProbe("null", 100, 0),
        )
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.ERROR_PAGE,
            OfflineLoadPolicy.classifyProbe(null, 100, 0),
        )
        assertEquals(
            OfflineLoadPolicy.ProbeOutcome.ERROR_PAGE,
            OfflineLoadPolicy.classifyProbe("\"other:chrome-error://chromewebdata/\"", 100, 0),
        )
    }

    @Test
    fun neverAutoReloadsALoadedAppPage() {
        // #515: Ein Neuladen beim Netzwechsel warf den Zustand der Karte weg.
        assertFalse(OfflineLoadPolicy.mayAutoReload("\"app\""))
        assertTrue(OfflineLoadPolicy.mayAutoReload("\"overlay\""))
        assertTrue(OfflineLoadPolicy.mayAutoReload("\"other:chrome-error://chromewebdata/\""))
        assertTrue(OfflineLoadPolicy.mayAutoReload("null"))
    }

    @Test
    fun recognisesTheServiceWorkerFallbackHeader() {
        assertTrue(
            OfflineLoadPolicy.isOfflineFallbackResponse(
                mapOf("x-einsatzkarte-offline-fallback" to "1"),
            ),
        )
        assertTrue(
            OfflineLoadPolicy.isOfflineFallbackResponse(
                mapOf("X-Einsatzkarte-Offline-Fallback" to "1"),
            ),
        )
        assertFalse(OfflineLoadPolicy.isOfflineFallbackResponse(mapOf("Content-Type" to "text/html")))
        assertFalse(OfflineLoadPolicy.isOfflineFallbackResponse(null))
    }

    @Test
    fun overlayNavigatesToTheFailedUrlAndCarriesItsMarker() {
        val html = OfflineLoadPolicy.overlayHtml(
            "Keine Verbindung",
            "Einsatzkarte wartet auf Netzwerk…",
            "Jetzt erneut versuchen",
            "https://einsatz.ffnd.at/einsatz/abc",
        )
        assertTrue(html.contains("window.${OfflineLoadPolicy.OVERLAY_MARKER}=true"))
        assertTrue(html.contains("location.replace(\"https://einsatz.ffnd.at/einsatz/abc\")"))
        assertFalse("kein Reload der Overlay-Seite selbst", html.contains("location.reload()"))
    }

    @Test
    fun overlayEscapesUrlAndTexts() {
        val html = OfflineLoadPolicy.overlayHtml(
            "<b>",
            "a & b",
            "\"x\"",
            "https://einsatz.ffnd.at/?q=\"</script><script>alert(1)</script>",
        )
        assertFalse(html.contains("</script><script>alert(1)"))
        assertFalse(html.contains("<b>"))
        assertTrue(html.contains("&lt;b&gt;"))
        assertTrue(html.contains("a &amp; b"))
        assertTrue(html.contains("&quot;x&quot;"))
    }
}
