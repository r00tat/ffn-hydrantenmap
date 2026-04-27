package at.ffnd.einsatzkarte.radiacode

/**
 * Typed replacement for the Python module's mix of `assert` failures and
 * generic `raise Exception`/`ValueError` calls.
 *
 * Exception categories mirror the Python sites 1:1:
 *  - [IncompatibleFirmware]      ← Python: `RadiaCode.__init__` firmware check
 *  - [HeaderMismatch]            ← Python: `assert req_header == resp_header`
 *  - [BadRetcode]                ← Python: `assert retcode == 1`
 *  - [SizeMismatch]              ← Python: `assert r.size() == flen`, `assert r.size() == 0`
 *  - [InvalidValidityFlags]      ← Python: `batch_read_vsfrs` validity-flags check
 *  - [UnsupportedSpectrumFormatVersion] ← Python: `decode_RC_VS_SPECTRUM` assert
 *  - [InvalidArgument]           ← Python: `ValueError` / `assert lang in {...}`
 */
sealed class RadiaCodeException(message: String) : RuntimeException(message) {
    class IncompatibleFirmware(version: String) :
        RadiaCodeException("Incompatible firmware $version, >=4.8 required. Upgrade device firmware or pass ignoreFirmwareCompatibilityCheck=true.")
    class HeaderMismatch(reqHex: String, respHex: String) :
        RadiaCodeException("req=$reqHex resp=$respHex")
    class BadRetcode(context: String, retcode: Long) :
        RadiaCodeException("$context: got retcode $retcode")
    class SizeMismatch(context: String, got: Int, expected: Int) :
        RadiaCodeException("$context: got size $got, expected $expected")
    class InvalidValidityFlags(got: Int, expected: Int) :
        RadiaCodeException("Unexpected validity flags, bad vsfr_id? ${got.toString(2)} != ${expected.toString(2)}")
    class UnsupportedSpectrumFormatVersion(v: Int) :
        RadiaCodeException("unsupported format_version=$v")
    class InvalidArgument(message: String) :
        RadiaCodeException(message)
}
