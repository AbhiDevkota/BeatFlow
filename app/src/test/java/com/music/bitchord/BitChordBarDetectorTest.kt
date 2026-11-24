package com.music.bitchord

import com.music.bitchord.data.code.BitChordBarDetector
import com.music.bitchord.data.code.BitChordCodec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class BitChordBarDetectorTest {

    @Test
    fun testEncodeDecodeTrack() {
        val videoId = "dQw4w9WgXcQ"
        val levels = BitChordCodec.encode(BitChordCodec.MediaType.TRACK, videoId)
        assertEquals(0, levels.first())
        assertEquals(7, levels.last())

        val decoded = BitChordCodec.decode(levels)
        assertEquals(BitChordCodec.MediaType.TRACK, decoded.type)
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

        // Create a synthetic YUV luminance image with dark background and bright bars
        val width = 800
        val height = 400
        val image = ByteArray(width * height) { 20 } // dark background

        val barW = 10
        val gap = 12
        val totalWidth = levels.size * barW + (levels.size - 1) * gap
        val startX = (width - totalWidth) / 2
        val centerY = height / 2
        val minH = 20
        val maxH = 120

        for (i in levels.indices) {
            val lvl = levels[i]
            val bh = minH + ((lvl / 7f) * (maxH - minH)).toInt()
            val bx = startX + i * (barW + gap)
            val topY = centerY - bh / 2
            val bottomY = centerY + bh / 2

            for (y in topY..bottomY) {
                for (x in bx until (bx + barW)) {
                    image[y * width + x] = 240.toByte() // bright bar
                }
            }
        }

        val detected = BitChordBarDetector.detect(image, width, height)
        assertNotNull("Detector should detect synthetic barcode", detected)
        assertEquals(BitChordCodec.MediaType.TRACK, detected?.type)
        assertEquals(videoId, detected?.id)
    }
}
