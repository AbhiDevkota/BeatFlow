package com.music.beatflow

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.music.beatflow.data.model.Song
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
                LyricsShareLine("Line one of the verse", null, startMs = 0, endMs = 8_000,
                    words = listOf(com.music.beatflow.data.lyrics.LyricWord(0, 3_000, "Line"),
                        com.music.beatflow.data.lyrics.LyricWord(3_000, 8_000, "one of the verse"))),
                LyricsShareLine("", null, isGap = true),
                LyricsShareLine("Line two of the verse", null, startMs = 11_000, endMs = 14_000,
                    words = listOf(com.music.beatflow.data.lyrics.LyricWord(11_000, 12_000, "Line"),
                        com.music.beatflow.data.lyrics.LyricWord(12_000, 12_500, "two"),
                        com.music.beatflow.data.lyrics.LyricWord(12_500, 13_300, "of the"),
                        com.music.beatflow.data.lyrics.LyricWord(13_300, 14_000, "verse"))),
                LyricsShareLine("Line three of the verse", null, startMs = 14_000, endMs = 22_000,
                    words = listOf(com.music.beatflow.data.lyrics.LyricWord(14_000, 15_000, "Line"),
                        com.music.beatflow.data.lyrics.LyricWord(15_000, 17_000, "three"),
                        com.music.beatflow.data.lyrics.LyricWord(17_000, 18_500, "of the"),
                        com.music.beatflow.data.lyrics.LyricWord(18_500, 22_000, "verse"))),
            ),
        )

        val still = buildLyricsCardScene(context, request, story = true).render()
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
