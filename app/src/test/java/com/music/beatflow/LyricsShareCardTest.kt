package com.music.beatflow

import com.music.beatflow.data.lyrics.LyricLine
import com.music.beatflow.ui.player.SHARE_CARD_CHAR_BUDGET
import com.music.beatflow.ui.player.LAST_LINE_HOLD_MS
import com.music.beatflow.ui.player.fitsOnCard
import com.music.beatflow.ui.player.sungEndMs
import com.music.beatflow.ui.player.sungStartMs
import com.music.beatflow.ui.player.spanOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rule that keeps a share card from being handed a verse it could only set
 * in type too small to read — the card draws everything it is given, so the
 * pick is the one place a limit can sit.
 */
class LyricsShareCardTest {
    /** At the length a line of a song usually has. */
    private val shortLine = "Nie dzwoń do mnie teraz, nie przeszkadzaj mi"

    @Test fun fiveShortLinesStillFit() {
        var taken = 0
        repeat(5) {
            assertTrue("line ${it + 1} must be pickable", fitsOnCard(taken, shortLine))
            taken += shortLine.length
        }
    }

    @Test fun theSixthLineIsRefusedRatherThanShrinkingTheType() {
        val taken = shortLine.length * 5
        assertFalse(fitsOnCard(taken, shortLine))
    }

    @Test fun aLineOverTheBudgetOnItsOwnIsRefused() {
        assertFalse(fitsOnCard(0, "x".repeat(SHARE_CARD_CHAR_BUDGET + 1)))
    }

    @Test fun theBudgetIsInclusiveByOneCharacter() {
        assertTrue(fitsOnCard(SHARE_CARD_CHAR_BUDGET, ""))
        assertFalse(fitsOnCard(SHARE_CARD_CHAR_BUDGET, "x"))
    }

    @Test fun aLineThePanelHasNoWordsForCostsNothing() {
        assertTrue(fitsOnCard(SHARE_CARD_CHAR_BUDGET, null))
    }
}

/**
 * When a picked line is sung — the video's sync. The panel's cursor rule:
 * a line stays lit until the line after it begins, and the reader's own
 * offset rides along so the clip and the panel agree.
 */
class LyricsVideoTimingTest {
    private fun line(timeMs: Long, text: String = "line", sungUntilMs: Long? = null) =
        LyricLine(timeMs = timeMs, text = text, sungUntilMs = sungUntilMs)

    private val source = listOf(
        line(1_000),
        line(4_000),
        line(9_000, sungUntilMs = 12_000),
        line(20_000),
    )

    @Test fun aLineEndsWhereTheNextLineBegins() {
        assertEquals(9_000L, sungEndMs(source, 1, 0))
    }

    @Test fun aLineWithNoSuccessorHoldsForAWhile() {
        assertEquals(20_000L + LAST_LINE_HOLD_MS, sungEndMs(source, 3, 0))
    }

    @Test fun aStatedEndWinsOnlyWhenNothingFollows() {
        // A successor's stamp hands over even past a stated end; the stated
        // end is for the song's last line.
        assertEquals(20_000L, sungEndMs(source, 2, 0))
        assertEquals(4_000L, sungEndMs(listOf(line(1_000, sungUntilMs = 4_000)), 0, 0))
    }

    @Test fun theReadersOffsetShiftsBothEndsAlike() {
        assertEquals(4_500L, sungStartMs(source[1], 500))
        assertEquals(9_500L, sungEndMs(source, 1, 500))
    }

    @Test fun aNegativeOffsetCannotStartALineBeforeTheSong() {
        assertEquals(0L, sungStartMs(line(200), -1_000))
    }

    @Test fun aStampAfterTheNextLinesIsIgnoredForTheHandover() {
        // Degenerate data — a stated end past the next stamp — must not hold
        // the line lit over the one that follows it.
        val odd = listOf(line(0), line(1_000, sungUntilMs = 60_000))
        assertEquals(60_000L, sungEndMs(odd, 1, 0))
        assertEquals(1_000L, sungEndMs(listOf(line(0, sungUntilMs = 99_000), line(1_000)), 0, 0))
    }

    @Test fun theSpanIsTheFirstStartToTheLastEnd() {
        val pick = listOf(
            com.music.beatflow.ui.player.LyricsShareLine("a", null, startMs = 4_000, endMs = 9_000),
            com.music.beatflow.ui.player.LyricsShareLine("", null, isGap = true),
            com.music.beatflow.ui.player.LyricsShareLine("b", null, startMs = 9_000, endMs = 15_000),
        )
        assertEquals(4_000L to 15_000L, spanOf(pick))
    }

    @Test fun aPickWithoutTimingSpansNothing() {
        val pick = listOf(com.music.beatflow.ui.player.LyricsShareLine("a", null))
        assertNull(spanOf(pick))
    }
}
