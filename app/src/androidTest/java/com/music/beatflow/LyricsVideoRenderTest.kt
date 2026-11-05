package com.music.beatflow

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.music.beatflow.data.model.Song
import com.music.beatflow.data.lyrics.LyricWord
import com.music.beatflow.ui.player.LyricsShareLine
import com.music.beatflow.ui.player.LyricsShareRequest
import com.music.beatflow.ui.player.buildLyricsCardScene
import com.music.beatflow.ui.player.renderLyricsShareVideo
import com.music.beatflow.ui.replay.saveToGallery
import com.music.beatflow.ui.replay.saveVideoToGalleryUri
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

    /** Makes a line from its words, with each word timed across the span. */
    private fun line(text: String, start: Long, end: Long) = LyricsShareLine(
        text, null, startMs = start, endMs = end,
        words = text.split(" ").let { words ->
            val span = (end - start).toFloat() / words.size.coerceAtLeast(1)
            words.mapIndexed { i, w ->
                LyricWord((start + span * i).toLong(), (start + span * (i + 1)).toLong(), w)
            }
        },
    )

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
                line("Line one of the verse", 0, 8_000),
                LyricsShareLine("", null, isGap = true),
                line("Line two of the verse", 11_000, 14_000),
                line("Line three of the verse", 14_000, 22_000),
                line("Line four of the verse", 22_000, 30_000),
                line("Line five of the verse", 30_000, 38_000),
                line("Line six of the verse", 38_000, 46_000),
                line("Line seven of the verse", 46_000, 54_000),
                line("Line eight of the verse", 54_000, 62_000),
            ),
        )

        val still = buildLyricsCardScene(context, request, allowScroll = true).render()
        saveToGallery(context, still, "diag-still", "diag")

        val startedAt = System.currentTimeMillis()
        val video = renderLyricsShareVideo(context, request)
        val elapsed = System.currentTimeMillis() - startedAt
        if (video != null) {
            saveVideoToGalleryUri(context, video.file, "diag-clip", "diag")
        }
        android.util.Log.d("LyricsVideoRenderTest", "render ms=$elapsed hasAudio=${video?.hasAudio}")
        Unit
    }
}
