package com.music.bitchord.data.code

/**
 * Compact BitChord visual soundwave code codec.
 *
 * Payload format:
 *   2 bits: media type (00: track, 01: album, 10: artist, 11: playlist)
 *   6 bits: ID length (1..63)
 *   6 bits per Base64URL ID character
 *   8 bits: CRC-8 (polynomial x^8 + x^2 + x + 1)
 *
 * Converted to 3-bit bar levels (0..7).
 * Calibration bars added at ends: 0 at start, 7 at end.
 */
object BitChordCodec {
    const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    enum class MediaType(val key: String, val code: Int) {
        TRACK("song", 0),
        ALBUM("album", 1),
        ARTIST("artist", 2),
        PLAYLIST("playlist", 3);

        companion object {
            fun fromKey(key: String): MediaType? = entries.firstOrNull {
                it.key.equals(key, ignoreCase = true) ||
                    (it == TRACK && (key.equals("song", ignoreCase = true) || key.equals("track", ignoreCase = true)))
            }
            fun fromCode(code: Int): MediaType? = entries.firstOrNull { it.code == code }
        }
    }

    data class Payload(val type: MediaType, val id: String) {
        val canonicalUri: String get() = "bitchord:${type.key}:$id"
    }

    /**
     * Calculates CRC-8 remainder (polynomial x^8 + x^2 + x + 1, 0x07) for a bit string.
     */
    fun crc8Bits(bits: String): String {
        val work = IntArray(bits.length + 8)
        for (i in bits.indices) {
            work[i] = bits[i] - '0'
        }
        val polynomial = intArrayOf(1, 0, 0, 0, 0, 0, 1, 1, 1)
        for (i in bits.indices) {
            if (work[i] != 0) {
                for (j in polynomial.indices) {
                    work[i + j] = work[i + j] xor polynomial[j]
                }
            }
        }
        val sb = StringBuilder(8)
        for (i in bits.length until work.size) {
            sb.append(work[i])
        }
        return sb.toString()
    }

    /**
     * Converts a bit string to 3-bit levels (0..7).
     */
    fun bitsToLevels(bits: String): List<Int> {
        val remainder = bits.length % 3
        val padded = if (remainder != 0) bits + "0".repeat(3 - remainder) else bits
        val levels = ArrayList<Int>(padded.length / 3)
        for (i in 0 until padded.length step 3) {
            levels.add(padded.substring(i, i + 3).toInt(2))
        }
        return levels
    }

    /**
     * Encodes a media type and ID into a list of bar levels (0..7) with calibration bars.
     */
    fun encode(type: MediaType, id: String): List<Int> {
        val cleanId = id.trim()
        require(cleanId.isNotEmpty() && cleanId.length <= 63) { "ID must be between 1 and 63 characters" }
        require(cleanId.all { it in ALPHABET }) { "ID contains invalid characters" }

        val typeBits = type.code.toString(2).padStart(2, '0')
        val lenBits = cleanId.length.toString(2).padStart(6, '0')

        val idBits = StringBuilder()
        for (char in cleanId) {
            val idx = ALPHABET.indexOf(char)
            idBits.append(idx.toString(2).padStart(6, '0'))
        }

        val header = typeBits + lenBits + idBits.toString()
        val crc = crc8Bits(header)
        val packet = header + crc

        val dataLevels = bitsToLevels(packet)
        return ArrayList<Int>(dataLevels.size + 2).apply {
            add(0) // Calibration start
            addAll(dataLevels)
            add(7) // Calibration end
        }
    }

    /**
     * Convenience method to encode a formatted URI like "track:dQw4w9WgXcQ" or "bitchord:track:..."
     */
    fun encodeText(text: String): List<Int> {
        var clean = text.trim()
        if (clean.startsWith("bitchord:", ignoreCase = true)) {
            clean = clean.substring("bitchord:".length)
        }
        val parts = clean.split(":", limit = 2)
        require(parts.size == 2) { "Format must be type:ID (e.g. track:ID, album:ID, artist:ID)" }
        val type = MediaType.fromKey(parts[0]) ?: throw IllegalArgumentException("Unknown media type: ${parts[0]}")
        return encode(type, parts[1])
    }

    /**
     * Decodes a list of bar levels back into a Payload.
     */
    fun decode(levels: List<Int>): Payload {
        require(levels.size >= 5) { "Not enough bars" }
        require(levels.first() == 0 && levels.last() == 7) { "Calibration bars are missing or invalid" }

        val dataLevels = levels.subList(1, levels.size - 1)
        val bits = StringBuilder(dataLevels.size * 3)
        for (lvl in dataLevels) {
            bits.append(lvl.toString(2).padStart(3, '0'))
        }

        require(bits.length >= 16) { "Incomplete code bits" }

        val typeCode = bits.substring(0, 2).toInt(2)
        val type = MediaType.fromCode(typeCode) ?: throw IllegalArgumentException("Invalid media type code: $typeCode")
        val idLength = bits.substring(2, 8).toInt(2)
        require(idLength in 1..63) { "Invalid ID length: $idLength" }

        val packetBits = 2 + 6 + idLength * 6 + 8
        val requiredBars = (packetBits + 2) / 3
        require(dataLevels.size == requiredBars) { "Wrong code length: expected ${requiredBars + 2} total bars but got ${levels.size}" }

        val packet = bits.substring(0, packetBits)
        val content = packet.substring(0, packetBits - 8)
        val checksum = packet.substring(packetBits - 8)

        if (crc8Bits(content) != checksum) {
            throw IllegalArgumentException("CRC Checksum mismatch")
        }

        val idBits = content.substring(8)
        val idBuilder = StringBuilder(idLength)
        for (i in 0 until idLength * 6 step 6) {
            val charIdx = idBits.substring(i, i + 6).toInt(2)
            idBuilder.append(ALPHABET[charIdx])
        }

        return Payload(type, idBuilder.toString())
    }

    /**
     * Fallback decoder for 1-bit type headers (artist=0, album=1) from legacy test code.
     */
    fun decodeLegacy1Bit(levels: List<Int>): Payload {
        require(levels.size >= 5) { "Not enough bars" }
        require(levels.first() == 0 && levels.last() == 7) { "Calibration bars missing" }

        val dataLevels = levels.subList(1, levels.size - 1)
        val bits = StringBuilder(dataLevels.size * 3)
        for (lvl in dataLevels) {
            bits.append(lvl.toString(2).padStart(3, '0'))
        }

        val typeBit = bits.substring(0, 1).toInt(2)
        val type = if (typeBit == 0) MediaType.ARTIST else MediaType.ALBUM
        val idLength = bits.substring(1, 7).toInt(2)
        val packetBits = 1 + 6 + idLength * 6 + 8
        val requiredBars = (packetBits + 2) / 3
        require(dataLevels.size == requiredBars) { "Wrong legacy code length" }

        val packet = bits.substring(0, packetBits)
        val content = packet.substring(0, packetBits - 8)
        val checksum = packet.substring(packetBits - 8)
        if (crc8Bits(content) != checksum) {
            throw IllegalArgumentException("Legacy checksum mismatch")
        }

        val idBits = content.substring(7)
        val idBuilder = StringBuilder(idLength)
        for (i in 0 until idLength * 6 step 6) {
            val charIdx = idBits.substring(i, i + 6).toInt(2)
            idBuilder.append(ALPHABET[charIdx])
        }

        return Payload(type, idBuilder.toString())
    }

    /**
     * Attempts decoding modern 2-bit format first, falling back to 1-bit legacy format.
     */
    fun decodeFlexible(levels: List<Int>): Payload {
        return try {
            decode(levels)
        } catch (_: Exception) {
            decodeLegacy1Bit(levels)
        }
    }
}
