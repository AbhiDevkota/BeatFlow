package com.music.beatflow.ui.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableLongState
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.runtime.withFrameNanos
import com.music.beatflow.ui.rememberIsForeground
import kotlin.math.abs

/**
 * What a frame clock reads of the playhead: where it was, and when that was
 * true, so a clock can carry it forward between readings — see [LyricClock]
 * for why steering by dated readings, rather than being set by them, is the
 * difference between a sweep that glides and one that stutters or stalls.
 */
internal interface PlayheadReading {
    /** The latest reading of the playhead. */
    val positionMs: Long

    /** When [positionMs] was read off the player, on the [System.nanoTime] clock. */
    val sampledAtNanos: Long

    /** Changes whenever the playhead is meant to jump on purpose. */
    val discontinuity: Long
}

private fun nanosToMs(nanos: Long): Double = nanos / 1_000_000.0

/**
 * The playhead, ticking every frame.
 *
 * The player reports where it is about twice a second: fine for a scrubber,
 * which steps in visible half-second jumps for it, and far too coarse for a
 * lyric highlight that has to keep up with a singer. Both run one of these
 * over the same readings and draw from its answers.
 *
 * Returned as state rather than a plain value on purpose: read inside a draw
 * lambda, only the draw phase re-runs each frame. Read in composition, a line
 * or a bar recomposes sixty times a second to change by less than a pixel.
 *
 * While stopped each reading is simply the truth — held of the snapshot, so a
 * reading recomposes nothing — because between frames of a stopped player the
 * only thing the song is doing is accepting seeks. While running every start
 * is a fresh run from the latest reading, so neither a pause nor a spell in
 * the background is mistaken for one very long frame.
 *
 * One loop for the whole run, reading the playhead itself. Keyed on the
 * reading instead, every reading restarted it, and each restart spent a frame
 * waiting for its first frame time — a hitch twice a second.
 */
@Composable
internal fun rememberPositionClock(
    trackKey: Any,
    playhead: PlayheadReading,
    isPlaying: Boolean,
): MutableLongState {
    val clock = remember(trackKey) {
        mutableLongStateOf(Snapshot.withoutReadObservation { playhead.positionMs })
    }
    val engine = remember(trackKey) { LyricClock(clock.longValue) }

    // Not moving: each reading is the truth, including a seek made while paused.
    // Followed off the snapshot rather than read here, so a reading recomposes
    // nothing.
    if (!isPlaying) {
        LaunchedEffect(engine, playhead) {
            snapshotFlow { playhead.positionMs }.collect { positionMs ->
                engine.hold(positionMs, nanosToMs(System.nanoTime()))
                clock.longValue = positionMs
            }
        }
    }

    // Gated on the app being on screen. The loop asks for a frame, writes a
    // value that invalidates a drawing, and is handed the next frame for it —
    // which is a request to render continuously for as long as it runs. That is
    // the right trade for something visibly moving and the wrong one for a
    // phone in a pocket, and the composition alone cannot tell the two apart.
    val foreground = rememberIsForeground()
    LaunchedEffect(engine, playhead, isPlaying, foreground) {
        if (!isPlaying || !foreground) return@LaunchedEffect
        engine.restart()
        while (true) {
            withFrameNanos { frameNanos ->
                // Readings are stamped on the System.nanoTime clock. The frame
                // time is that clock too wherever it is a vsync stamp, and is
                // preferred for being evenly spaced; anywhere it is not, the
                // two are seconds apart and the real clock is used instead.
                val system = System.nanoTime()
                val now = if (abs(system - frameNanos) < SAME_CLOCK_NANOS) frameNanos else system
                val sampledAt = playhead.sampledAtNanos
                clock.longValue = engine.frame(
                    nowMs = nanosToMs(now),
                    reportedMs = playhead.positionMs,
                    sampledAtMs = if (sampledAt > 0L) nanosToMs(sampledAt) else Double.NaN,
                    discontinuity = playhead.discontinuity,
                )
            }
        }
    }
    return clock
}

/** A frame time this close to [System.nanoTime] is on the same clock. */
private const val SAME_CLOCK_NANOS = 250_000_000L
