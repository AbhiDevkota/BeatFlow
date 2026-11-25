package com.music.bitchord

import com.music.bitchord.data.code.BitChordBarDetector
import com.music.bitchord.data.code.BitChordCodec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

class BitChordBarDetectorTest {

    @Test
    fun testEncodeDecodeTrack() {
        val videoId = "dQw4w9WgXcQ"
        val levels = BitChordCodec.encode(BitChordCodec.MediaType.TRACK, videoId)
        assertEquals(0, levels.first())
        assertEquals(7, levels.last())

        val decoded = BitChordCodec.decode(levels)
        assertEquals(BitChordCodec.MediaType.TRACK, decoded.type)
        assertEquals("song", decoded.type.key)
        assertEquals("bitchord:song:$videoId", decoded.canonicalUri)
        assertEquals(videoId, decoded.id)
    }

    @Test
    fun testEncodeDecodeAlbumAndArtist() {
        val albumId = "MPREb_abc123"
        val albumLevels = BitChordCodec.encode(BitChordCodec.MediaType.ALBUM, albumId)
        val decodedAlbum = BitChordCodec.decode(albumLevels)
        assertEquals(albumId, decodedAlbum.id)

        val artistId = "UC_x5XG1OV2P"
        val artistLevels = BitChordCodec.encode(BitChordCodec.MediaType.ARTIST, artistId)
        val decodedArtist = BitChordCodec.decode(artistLevels)
        assertEquals(artistId, decodedArtist.id)
    }

    @Test
    fun testDetectorOnSyntheticBarcode() {
        val videoId = "dQw4w9WgXcQ"
        val levels = BitChordCodec.encode(BitChordCodec.MediaType.TRACK, videoId)
        val image = renderSyntheticBarcode(levels, 800, 400)

        val detected = BitChordBarDetector.detect(image, 800, 400)
        assertNotNull("Detector should detect synthetic barcode", detected)
        assertEquals(BitChordCodec.MediaType.TRACK, detected?.type)
        assertEquals(videoId, detected?.id)
    }

    @Test
    fun testDetectorOnGradientBackgroundAndBlur() {
        val videoId = "9bZkp7q19f0"
        val levels = BitChordCodec.encode(BitChordCodec.MediaType.TRACK, videoId)
        val w = 720
        val h = 1000
        // Strong gradient background: dark on left (30), bright on right (165)
        val image = renderSyntheticBarcode(
            levels = levels,
            width = w,
            height = h,
            barW = 8,
            gap = 9,
            minH = 14,
            maxH = 72,
            bgFn = { x, _ -> (30 + (x.toFloat() / w) * 135f).roundToInt() },
            barVal = 248,
        )
        val blurred = boxBlur3x3(image, w, h)

        val detected = BitChordBarDetector.detect(blurred, w, h)
        assertNotNull("Detector should detect blurry barcode over uneven artwork gradient", detected)
        assertEquals(videoId, detected?.id)
    }

    @Test
    fun testDetectorOnTiltedAndSmallBarcode() {
        val videoId = "kJQP7kiw5Fk"
        val levels = BitChordCodec.encode(BitChordCodec.MediaType.TRACK, videoId)
        val w = 720
        val h = 1000
        val angleRad = 8.0 * PI / 180.0
        val cosA = cos(angleRad)
        val sinA = sin(angleRad)

        val image = ByteArray(w * h) { 35 }
        val barW = 7
        val gap = 8
        val totalWidth = levels.size * barW + (levels.size - 1) * gap
        val startX = -totalWidth / 2.0
        val minH = 12
        val maxH = 62
        val cx = w / 2.0
        val cy = h / 2.0

        for (i in levels.indices) {
            val lvl = levels[i]
            val bh = minH + ((lvl / 7.0) * (maxH - minH))
            val localCenterX = startX + i * (barW + gap) + barW / 2.0
            for (dy in (-bh / 2).roundToInt()..(bh / 2).roundToInt()) {
                for (dx in -(barW / 2)..(barW / 2)) {
                    val lx = localCenterX + dx
                    val ly = dy.toDouble()
                    val rx = (cx + lx * cosA - ly * sinA).roundToInt()
                    val ry = (cy + lx * sinA + ly * cosA).roundToInt()
                    if (rx in 0 until w && ry in 0 until h) {
                        image[ry * w + rx] = 235.toByte()
                    }
                }
            }
        }

        val detected = BitChordBarDetector.detect(image, w, h)
        assertNotNull("Detector should detect tilted small barcode", detected)
        assertEquals(videoId, detected?.id)
    }

    @Test
    fun testDetectorOnUpsideDownBarcode() {
        val videoId = "fJ9rUzIMcZQ"
        val levels = BitChordCodec.encode(BitChordCodec.MediaType.TRACK, videoId).reversed()
        val image = renderSyntheticBarcode(levels, 800, 400)

        val detected = BitChordBarDetector.detect(image, 800, 400)
        assertNotNull("Detector should decode upside-down barcode", detected)
        assertEquals(videoId, detected?.id)
    }

    @Test
    fun testDetectorRejectsRandomNoise() {
        val rng = Random(42)
        val w = 720
        val h = 720
        val noise = ByteArray(w * h) { rng.nextInt(256).toByte() }
        val detected = BitChordBarDetector.detect(noise, w, h)
        assertNull("Random noise must never falsely decode", detected)
    }

    private fun renderSyntheticBarcode(
        levels: List<Int>,
        width: Int,
        height: Int,
        barW: Int = 10,
        gap: Int = 12,
        minH: Int = 20,
        maxH: Int = 120,
        bgFn: (Int, Int) -> Int = { _, _ -> 20 },
        barVal: Int = 240,
    ): ByteArray {
        val image = ByteArray(width * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                image[y * width + x] = bgFn(x, y).coerceIn(0, 255).toByte()
            }
        }

        val totalWidth = levels.size * barW + (levels.size - 1) * gap
        val startX = (width - totalWidth) / 2
        val centerY = height / 2

        for (i in levels.indices) {
            val lvl = levels[i]
            val bh = minH + ((lvl / 7f) * (maxH - minH)).toInt()
            val bx = startX + i * (barW + gap)
            val topY = centerY - bh / 2
            val bottomY = centerY + bh / 2

            for (y in topY..bottomY) {
                for (x in bx until (bx + barW)) {
                    image[y * width + x] = barVal.toByte()
                }
            }
        }
        return image
    }

    private fun boxBlur3x3(src: ByteArray, w: Int, h: Int): ByteArray {
        val dst = src.copyOf()
        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                var sum = 0
                for (dy in -1..1) {
                    for (dx in -1..1) {
                        sum += src[(y + dy) * w + (x + dx)].toInt() and 0xFF
                    }
                }
                dst[y * w + x] = (sum / 9).toByte()
            }
        }
        return dst
    }
}
