package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Typed equivalent of Python `_VSFR_FORMATS` strings.
 *
 * Each variant decodes a 32-bit raw value (little-endian on the wire,
 * already converted to a Kotlin `Int`) into a typed value.
 *
 * Bit-layout reminder for the `Nx<Y>` skip-prefixed Python formats: with a
 * little-endian u32, `struct.unpack('<3xB', struct.pack('<I', v))` reads bytes
 * `b0 b1 b2 b3` and skips the first three, returning `b3` — which is the
 * **high byte** of the Int, i.e. `(u32 ushr 24) and 0xFF`. Analogously,
 * `<2xH>` reads the top 16 bits, `(u32 ushr 16) and 0xFFFF`.
 */
sealed class VsfrFormat {
    abstract fun decode(u32: Int): Any

    /** Python `<I>`: unsigned 32-bit. Returned as raw Int; caller handles unsigned interpretation. */
    object U32 : VsfrFormat() {
        override fun decode(u32: Int): Int = u32
    }

    /** Python `<i>`: signed 32-bit. */
    object I32 : VsfrFormat() {
        override fun decode(u32: Int): Int = u32
    }

    /** Python `<f>`: IEEE-754 binary32. */
    object F32 : VsfrFormat() {
        override fun decode(u32: Int): Float = Float.fromBits(u32)
    }

    /** Python `<3x?>`: skip 3 bytes, read u8 as bool. Top byte of LE u32. */
    object ThreeXBool : VsfrFormat() {
        override fun decode(u32: Int): Boolean = ((u32 ushr 24) and 0xFF) != 0
    }

    /** Python `<3xB>`: skip 3 bytes, read u8. Top byte of LE u32. */
    object ThreeXByte : VsfrFormat() {
        override fun decode(u32: Int): Int = (u32 ushr 24) and 0xFF
    }

    /** Python `<2xh>`: skip 2 bytes, read i16. Top 2 bytes of LE u32, sign-extended. */
    object TwoXShort : VsfrFormat() {
        override fun decode(u32: Int): Int {
            val raw = (u32 ushr 16) and 0xFFFF
            return (raw shl 16) shr 16 // sign-extend 16-bit value into 32-bit Int
        }
    }

    /** Python `<2xH>`: skip 2 bytes, read u16. Top 2 bytes of LE u32, unsigned. */
    object TwoXUShort : VsfrFormat() {
        override fun decode(u32: Int): Int = (u32 ushr 16) and 0xFFFF
    }
}
