package com.music.beatflow

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.music.beatflow.data.model.Song
import com.music.beatflow.ui.player.LyricsShareLine
import com.music.beatflow.ui.player.LyricsShareRequest
import com.music.beatflow.ui.player.buildLyricsCardScene
import com.music.beatflow.ui.player.renderLyricsShareVideo
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Renders a clip from a synthetic pick straight to the app's external files,
 * next to the scene's own still — so the two can be pulled and compared: if
 * the still is clean and the clip is torn, the fault is in the encode path,
 * not in the layout.
 */
@RunWith(AndroidJUnit4::class)
class LyricsVideoRenderTest {

    @Test
    fun rendersAClipAndDumpsEvidence() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val song = Song(
            videoId = "diagnostic",
            title = "Thak Khola (Kabaddi 5 - After The Final Match)",
            artist = "Kali Prasad Baskota",
            thumbnailUrl = null,
        )
        val request = LyricsShareRequest(
            song = song,
            artworkUrl = null,
            lines = listOf(
                LyricsShareLine("झीलाको तिरेमा", null, startMs = 0, endMs = 8_000),
                LyricsShareLine("काड्ने भए ठिकै हो", null, startMs = 8_000, endMs = 14_000),
                LyricsShareLine("त्यो मायाको कुँै नगर", null, startMs = 14_000, endMs = 22_000),
            ),
        )

        val out = context.getExternalFilesDir(null)!!.resolve("video-debug")
        out.mkdirs()

        val still = buildLyricsCardScene(context, request, story = true).render()
        still.compress(Bitmap.CompressFormat.PNG, 100, out.resolve("still.png").outputStream())
        com.music.beatflow.ui.replay.saveToGallery(context, still, "diag-still", "diag")

        val startedAt = System.currentTimeMillis()
        val video = renderLyricsShareVideo(context, request)
        val elapsed = System.currentTimeMillis() - startedAt
        if (video != null) {
            com.music.beatflow.ui.replay.saveVideoToGalleryUri(
                context, video.file, "diag-clip", "diag",
            )
        }
        android.util.Log.d("LyricsVideoRenderTest", "render ms=$elapsed hasAudio=${video?.hasAudio}")

        // ── The sound, exercised on its own: a synthesized tone, cut to
        // 1s..5s, decoded, faded, re-encoded, muxed, and left where the pull
        // can reach it. The clip above answers for the picture; this answers
        // for everything audio.
        val rate = 44_100
        val pcm = ByteArray(rate * 6 * 2 * 2)
        val shorts = java.nio.ByteBuffer.wrap(pcm).order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        for (i in 0 until rate * 6) {
            val v = (Math.sin(2 * Math.PI * 440.0 * i / rate) * 12_000).toInt().toShort()
            shorts.put(i * 2, v)
            shorts.put(i * 2 + 1, v)
        }
        val wav = java.io.File(context.cacheDir, "tone.wav")
        java.io.DataOutputStream(java.io.FileOutputStream(wav).buffered()).use { out ->
            fun tag(s: String) = out.write(s.toByteArray())
            tag("RIFF"); out.writeIntLe(36 + pcm.size); tag("WAVE")
            tag("fmt "); out.writeIntLe(16); out.writeShortLe(1); out.writeShortLe(2)
            out.writeIntLe(rate); out.writeIntLe(rate * 2 * 2); out.writeShortLe(4); out.writeShortLe(16)
            tag("data"); out.writeIntLe(pcm.size); out.write(pcm)
        }
        val tone = com.music.beatflow.playback.smart.LocalAudioSource.open(
            context.contentResolver,
            android.net.Uri.fromFile(wav),
        )!!
        val track = com.music.beatflow.ui.player.encodeAudioSpan(
            tone,
            1_000_000L,
            5_000_000L,
            checkActive = {},
        )
        android.util.Log.d("LyricsVideoRenderTest", "audio samples=${track?.samples?.size}")
        if (track != null) {
            val muxed = java.io.File(context.cacheDir, "tone-aac.m4a")
            val muxer = android.media.MediaMuxer(
                muxed.path,
                android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4,
            )
            val audioTrack = muxer.addTrack(track.format)
            muxer.start()
            for (s in track.samples) {
                muxer.writeSampleData(audioTrack, java.nio.ByteBuffer.wrap(s.bytes), s.info)
            }
            muxer.stop()
            muxer.release()
            com.music.beatflow.ui.replay.saveVideoToGalleryUri(context, muxed, "diag-audio", "diag")
        }
        Unit
    }

    private fun java.io.DataOutputStream.writeIntLe(v: Int) {
        write(v and 0xFF); write((v shr 8) and 0xFF); write((v shr 16) and 0xFF); write((v shr 24) and 0xFF)
    }

    private fun java.io.DataOutputStream.writeShortLe(v: Int) {
        write(v and 0xFF); write((v shr 8) and 0xFF)
    }
}
