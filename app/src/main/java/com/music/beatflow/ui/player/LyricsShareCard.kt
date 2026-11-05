package com.music.beatflow.ui.player

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.drawable.Drawable
import com.music.beatflow.data.lyrics.LyricWord
import com.music.beatflow.ui.replay.Fonts
import com.music.beatflow.ui.replay.drawArtwork
import com.music.beatflow.ui.replay.drawBackdrop
import com.music.beatflow.ui.replay.drawLogo
import com.music.beatflow.ui.replay.ellipsised
import com.music.beatflow.ui.replay.loadBitmap
import com.music.beatflow.ui.replay.loadedLogo
import com.music.beatflow.ui.replay.paletteOf
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The picked lines as one picture, drawn to a bitmap you can send.
 *
 * ## Why this is drawn rather than screenshotted
 *
 * The same reason the Replay is. A screenshot of the lyrics panel carries the
 * scrubber, the glow falloff, whichever lines happened to be on screen and the
 * status bar of that particular phone, so two people sharing the same verse
 * would send two different-looking pictures. A card laid out here is the verse,
 * the sleeve and this app's mark, and nothing else â€” and it is only as tall as
 * that verse needs, which holds it inside 1080Ã—1920 (9:16): the shape a story
 * or a chat head expects. Keeping it there is the player's job, by refusing
 * more words at the pick rather than by shrinking them here.
 *
 * ## Why it isn't Compose
 *
 * `Bitmap` + `android.graphics.Canvas`, exactly as
 * [com.music.beatflow.ui.replay.ReplayPoster] does it, and for the same
 * reasons written up there: Compose offscreen on minSdk 26 is a cascade of
 * hardware bitmaps and layers that fails differently per device, while a
 * software canvas draws identically from API 26 up. The backdrop, the logo, the
 * fonts and the sleeve are shared with the Replay by importing them rather than
 * by copying, so the two cards cannot drift apart.
 *
 * ## Fitting the type
 *
 * A passage can be one line or twenty, so both the size and the height are
 * chosen rather than fixed: the layout is retried down a fixed ladder of sizes
 * until the rows stop overflowing, and the card is then grown to exactly the
 * room those rows take. The bottom rung of that ladder is a floor rather than a
 * last resort â€” no card ever sets type smaller than it to squeeze a passage
 * in, so a passage too long for the frame lengthens the card instead of being
 * cut, or made small enough to hold a phone at arm's length to read.
 *
 * ## The video
 *
 * The layout work lives in [LyricsCardScene], which is also what the video
 * renderer draws with â€” one frame per step of the song, the same layout at
 * every one of them, so the clip and the picture cannot disagree about where
 * anything sits. A scene is built once and drawn many times; only the lyric
 * highlight moves between frames.
 */
internal suspend fun renderLyricsShareCard(
    context: Context,
    card: LyricsShareRequest,
    /** Pad out to the full 1080Ã—1920 frame, the passage centred in the room. */
    story: Boolean = false,
): Bitmap = withContext(Dispatchers.Default) {
    buildLyricsCardScene(context, card, story).render()
}

// â”€â”€ The scene â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * The card, laid out once and drawable at any moment of the song.
 *
 * Everything that does not change between two frames of a video â€” the fonts,
 * the sleeve, the palette, the fitted type, where every row's baseline sits â€”
 * is settled here, at construction. And more than settled: the furniture
 * (backdrop, the mark and the word, the sleeve and the credit) is *drawn* once
 * into the base, and every passage row is rasterised once into its own small
 * bitmap. A frame of video then costs one blit of the base plus one small blit
 * per row carrying the highlight's alpha â€” no gradients, no text shaping, no
 * vector inflation per frame, each of which would be most of what a frame
 * takes. The row bitmaps keep their text at the same sub-pixel offset it would
 * have been drawn at directly, so the raster is the one a direct draw makes.
 *
 * Drawn as the still it is pixel for pixel what the card has always been.
 * Drawn at a moment of the song, the line being sung stands full white and
 * the rest sit back, handing over to each other on a short crossfade â€” the
 * panel's own cursor rule (the last line whose stamp has passed), read off
 * the same stamps the pick carried.
 */
internal class LyricsCardScene(
    context: Context,
    private val request: LyricsShareRequest,
    story: Boolean,
    allowScroll: Boolean = false,
    /** Resolved sleeve, loaded once for every frame to share. */
    private val cover: Bitmap?,
    /** The mark, inflated once â€” see [loadedLogo]. */
    private val logo: Drawable?,
) {
    private val type: Fonts = Fonts(context)

    // â”€â”€ Sizing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // No room is reserved for the words to sit in: they get their own height,
    // and the card is built down from that number. A chorus comes out a strip
    // barely taller than its own text instead of a 9:16 sheet with a paragraph
    // floating in the middle of it, and the size comes down only as far as the
    // ladder goes â€” past that the frame gives rather than the type does.
    private val headTop = HEADER_BOTTOM + GAP_ABOVE_BODY
    private val frameRoom = MAX_CARD_H - FOOTER_THUMB - FOOTER_PAD - GAP_BELOW_BODY - headTop
    private val plan: Plan
    /** A story is always the whole frame, so the spare room is split above and
     * below the passage; otherwise the card is only as tall as its words. */
    private val spare: Float
    private val bodyTop: Float

    /** The card's drawn size â€” the video's frame is exactly this. */
    val width: Float = CARD_W.toFloat()
    val height: Float

    // The mark and the word, at the top right â€” the same pair the Replay
    // carries, so two of these cards still read as one family. Nothing else
    // goes above the passage: the picture is the verse, not a caption for it.
    private val brand = type.heading(46f, 0xE6FFFFFF.toInt()).apply {
        textAlign = Paint.Align.RIGHT
    }
    private val logoRight = CARD_W - CARD_MARGIN - brand.measureText(BRAND) - LOGO_GAP

    // â”€â”€ The passage, positioned once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Every row keeps the baseline it will be drawn at for the life of the
    // scene, and the group it belongs to â€” the picked line it came from â€” so
    // the video can dim and light whole lines rather than stray wraps.

    // â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Which song this is â€” which only the backdrop had been saying until now.
    private val thumbY: Float
    private val textX = CARD_MARGIN + FOOTER_THUMB + 34f
    private val room = CARD_W - CARD_MARGIN - textX
    private val titlePaint = type.body(50f, Color.WHITE, bold = true)
    private val artistPaint = type.body(42f, 0x99FFFFFF.toInt())
    private val footerTitle = ellipsised(request.song.title, titlePaint, room)
    private val footerArtist = ellipsised(request.song.artist, artistPaint, room)
    private val rawTitle = request.song.title

    // â”€â”€ Backdrop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The palette comes off the sleeve once; the gradients themselves are
    // drawn once with it, into the base below.
    private val backdropColors = paletteOf(cover)

    /** Where each sung line starts, in the clock [frameAlphas] is handed, and lit. */
    private val lineStarts: List<Long> = run {
        val span = spanOf(request.lines) ?: return@run emptyList()
        val starts = request.lines
            .filter { !it.isGap && it.startMs != null }
            .map { it.startMs!! - span.first }
        // The clip opens on its first line, so that one is lit before the
        // first frame rather than fading up through it.
        if (starts.isEmpty()) emptyList() else
            listOf(starts.first() - CROSSFADE_MS.toLong()) + starts.drop(1)
    }

    /**
     * Where each sung line hands over, on the clip's own clock: the start of
     * whatever follows it â€” a break's own start when the pick skipped a
     * stretch, or the next sung line's start when nothing was skipped â€” and
     * the end of the clip for the last line. A line dims from here, so a
     * break lights its dots instead of leaving the line above standing.
     */
    private val fallStarts: List<Long> = run {
        val span = spanOf(request.lines) ?: return@run emptyList()
        val endOfClip = span.second - span.first
        val sung = request.lines.filter { !it.isGap && it.startMs != null }
        val out = mutableListOf<Long>()
        var si = 0
        request.lines.forEachIndexed { idx, line ->
            if (line.isGap || line.startMs == null) return@forEachIndexed
            val next = request.lines.getOrNull(idx + 1)
            val fall = if (next?.isGap == true) {
                // The break's own start is the end of this line's singing.
                line.endMs?.let { it - span.first }
                    ?: (sung.getOrNull(si + 1)?.startMs?.let { it - span.first } ?: endOfClip)
            } else {
                sung.getOrNull(si + 1)?.startMs?.let { it - span.first } ?: endOfClip
            }
            out += fall
            si++
        }
        out
    }

    /**
     * The breaks, on the clip's own clock: a break's dots fill from the end of
     * the sung line before it to the start of the one after â€” the stretch the
     * pick skipped, which is exactly the silence the dots are there to time.
     * Keyed by the pick entry the gap row came from.
     */
    private val gapSpans: Map<Int, Pair<Long, Long>> = run {
        val span = spanOf(request.lines) ?: return@run emptyMap()
        val spans = mutableMapOf<Int, Pair<Long, Long>>()
        var lastEnd = -1L
        request.lines.forEachIndexed { index, line ->
            when {
                line.isGap -> {
                    val nextStart = request.lines
                        .drop(index + 1)
                        .firstOrNull { !it.isGap && it.startMs != null }
                        ?.startMs
                    if (lastEnd >= 0 && nextStart != null) {
                        spans[index] = (lastEnd - span.first) to (nextStart - span.first)
                    }
                }
                line.endMs != null -> lastEnd = line.endMs!!
            }
        }
        spans
    }

    init {
        plan = fittestPlan(type, request.lines, frameRoom, allowScroll)
        spare = if (story) (frameRoom - plan.content).coerceAtLeast(0f) else 0f
        bodyTop = headTop + spare / 2
        height = bodyTop + plan.content + spare / 2 + GAP_BELOW_BODY + FOOTER_THUMB + FOOTER_PAD
        thumbY = height - FOOTER_PAD - FOOTER_THUMB
    }

    // -- Scrolling --
    val scrollable: Boolean = allowScroll && plan.content > frameRoom
    private val passageTop: Float = headTop
    private val passageHeight: Float = frameRoom
    private val fullPassageHeight: Float = plan.content
    private var lastScrollOffset: Float = 0f

    fun scrollOffset(t: Long): Float {
        if (!scrollable) return 0f
        val active = activeGroup(t)
        val target = if (active < 0) 0f else {
            val rowIdx = plan.rows.indexOfFirst { it.group == active }
            val y = if (rowIdx >= 0) baselines.getOrElse(rowIdx) { bodyTop } else bodyTop
            (y - passageHeight / 2f).coerceIn(0f, fullPassageHeight - passageHeight)
        }
        lastScrollOffset += (target - lastScrollOffset) * 0.2f
        return (lastScrollOffset / 4f).toInt() * 4f
    }

    val passageTopPx: Float get() = passageTop
    val passageHeightPx: Float get() = passageHeight

    // â”€â”€ The rasters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The furniture once, whole; the words once each. This is the pass that
    // pays for shaping, gradients and the sleeve â€” every frame after it blits.
    private val base: Bitmap = run {
        Bitmap.createBitmap(CARD_W, height.roundToInt(), Bitmap.Config.ARGB_8888).apply {
            val furniture = Canvas(this)
            drawBackdrop(furniture, backdropColors, this@LyricsCardScene.height)
            furniture.drawText(BRAND, CARD_W - CARD_MARGIN, HEADER_BASELINE, brand)
            drawLogo(furniture, logo, logoRight, HEADER_BASELINE, brand)
            drawArtwork(furniture, cover, rawTitle, CARD_MARGIN, thumbY, FOOTER_THUMB, false)
            furniture.drawText(footerTitle, textX, thumbY + 74f, titlePaint)
            furniture.drawText(footerArtist, textX, thumbY + 132f, artistPaint)
        }
    }

    private val baselines: FloatArray = run {
        val out = FloatArray(plan.rows.size)
        var y = bodyTop
        for (i in out.indices) {
            val row = plan.rows[i]
            out[i] = y + row.gapBefore - row.paint.ascent() +
                if (row.isGap) row.paint.textSize * GAP_MARKER_OFFSET else 0f
            y += row.gapBefore + row.height
        }
        out
    }

    private val stillRows: List<RowImage> = plan.rows.mapIndexed { index, row -> rasterise(row, baselines[index]) }

    /** One passage row, rasterised once and parked where it belongs. */
    private class RowImage(
        val bitmap: Bitmap,
        val x: Float,
        val y: Float,
        val group: Int,
    )

    private fun rasterise(row: Row, baseline: Float): RowImage {
        val x = if (row.centered) CARD_W / 2f else CARD_MARGIN
        val bounds = Rect()
        row.paint.getTextBounds(row.text, 0, row.text.length, bounds)
        val left = x.toInt()
        val top = baseline.toInt()
        val bitmap = Bitmap.createBitmap(bounds.width() + 2, bounds.height() + 2, Bitmap.Config.ARGB_8888)
        // The fraction of a pixel the row sits at on the card goes into the
        // bitmap, so what gets blitted is what a direct draw would have made.
        Canvas(bitmap).drawText(
            row.text,
            1f - bounds.left + (x - left),
            1f - bounds.top + (baseline - top),
            row.paint,
        )
        return RowImage(
            bitmap,
            (left + bounds.left - 1).toFloat(),
            (top + bounds.top - 1).toFloat(),
            row.group,
        )
    }

    // â”€â”€ The clip's layers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The same rows the still blits, minus the "(...)" markers â€” a break is
    // not a symbol parked on screen here, it is the panel's three dots
    // filling across the silence â€” plus one dot layer per dot.

    /** One thing the clip's frame loop composites. */
    private class ClipLayer(
        val bitmap: Bitmap,
        val x: Float,
        val y: Float,
        /** The sung line this row belongs to â€” the highlight reads it. */
        val group: Int,
        /** A translation or romanisation rides its line's clock, uniformly. */
        val isSub: Boolean,
        /** Where this row's text sits in its line, for the word sweep. */
        val charStart: Int,
        val charEnd: Int,
        /** The break this dot belongs to, and which of its three it is. */
        val gap: Int = -1,
        val dot: Int = -1,
    )

    private val dotBitmap: Bitmap = run {
        val dotSize = (plan.size * DOT_TO_TYPE).roundToInt().coerceAtLeast(6)
        Bitmap.createBitmap(dotSize, dotSize, Bitmap.Config.ARGB_8888).apply {
            Canvas(this).drawCircle(
                dotSize / 2f,
                dotSize / 2f,
                dotSize / 2f - 0.5f,
                Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE },
            )
        }
    }

    /** Each break's span on the clip's clock, in the order its dots were laid. */
    private val gapSpanList: List<Pair<Long, Long>> = gapSpans.values.toList()

    private val clipLayers: List<ClipLayer> = run {
        val dotSize = (plan.size * DOT_TO_TYPE).roundToInt().coerceAtLeast(6)
        val stride = dotSize + (plan.size * DOT_GAP_TO_TYPE).roundToInt()
        val layers = mutableListOf<ClipLayer>()
        var gapOrdinal = -1
        plan.rows.forEachIndexed { index, row ->
            val image = stillRows[index]
            if (!row.isGap) {
                layers += ClipLayer(image.bitmap, image.x, image.y, row.group, row.isSub, row.charStart, row.charEnd)
            } else {
                val span = gapSpans[row.lineIndex]
                if (span == null) {
                    repeat(GAP_DOTS) { dot ->
                        layers += ClipLayer(
                            dotBitmap,
                            CARD_MARGIN + dot * stride.toFloat(),
                            baselines[index] - plan.size * 0.65f * 0.30f - dotSize / 2f,
                            group = -1,
                            isSub = false,
                            charStart = 0,
                            charEnd = 0,
                            gap = -1,
                            dot = dot,
                        )
                    }
                } else {
                    gapOrdinal++
                    val centerY = baselines[index] - plan.size * 0.65f * 0.30f
                    repeat(GAP_DOTS) { dot ->
                        layers += ClipLayer(
                            dotBitmap,
                            CARD_MARGIN + dot * stride.toFloat(),
                            centerY - dotSize / 2f,
                            group = -1,
                            isSub = false,
                            charStart = 0,
                            charEnd = 0,
                            gap = gapOrdinal,
                            dot = dot,
                        )
                    }
                }
            }
        }
        layers
    }

    /** The still, as one bitmap. */
    fun render(): Bitmap {
        val bitmap = Bitmap.createBitmap(CARD_W, height.roundToInt(), Bitmap.Config.ARGB_8888)
        draw(Canvas(bitmap))
        return bitmap
    }

    /** Draws the still â€” every row at its own colour's full strength. */
    fun draw(canvas: Canvas) {
        canvas.drawBitmap(base, 0f, 0f, null)
        for (image in stillRows) {
            canvas.drawBitmap(image.bitmap, image.x, image.y, null)
        }
    }

    /** One thing the GPU frame feed composites: a bitmap and where it sits. */
    internal class GpuLayer(val bitmap: Bitmap, val x: Float, val y: Float)

    /**
     * The clip's layers for the GPU: the furniture whole, then every sung row
     * and every break dot at its place. Uploaded once; the frame loop only
     * names how bright each stands, and the compositing itself never leaves
     * the GPU â€” no bitmap is drawn, copied or carried across per frame.
     */
    fun gpuLayers(): List<GpuLayer> = buildList {
        add(GpuLayer(base, 0f, 0f))
        for (layer in clipLayers) add(GpuLayer(layer.bitmap, layer.x, layer.y))
    }

    /** How many layers [gpuLayers] carries â€” the furniture plus the passage. */
    fun gpuLayerCount(): Int = clipLayers.size + 1

    /**
     * How bright every layer of the clip stands at [t], milliseconds in â€” one
     * entry per clip layer, in layer order, 0..255. Sung rows read the
     * highlight; a break's dots read its clock, each owning its third and
     * filling across it, the way the panel lights them. The frame loop
     * compares these frame to frame: while nothing has changed, no frame is
     * submitted at all â€” the timestamps carry the pacing.
     */
    fun frameAlphas(t: Long): IntArray = IntArray(clipLayers.size) { i ->
        val layer = clipLayers[i]
        if (layer.gap < 0) {
            (255f * weightFor(layer.group, t)).roundToInt().coerceIn(0, 255)
        } else {
            val (start, end) = gapSpanList[layer.gap]
            val span = (end - start).coerceAtLeast(1L)
            // Stepped rather than fluid: the clip is variable-frame-rate, and
            // each step is one more frame the break costs. A dot filling over
            // a few seconds needs no more than a couple of dozen.
            // The dots fill across the break and then stand down: once the
            // silence is over they go back to rest, instead of staying lit
            // for as long as the clip runs.
            val through = if (t >= end) 0f else
                (((t - start).toFloat() / span).coerceIn(0f, 1f) * GAP_STEPS)
                    .roundToInt() / GAP_STEPS.toFloat()
            val lit = (through * GAP_DOTS - layer.dot).coerceIn(0f, 1f)
            ((GAP_DOT_REST + (1f - GAP_DOT_REST) * lit) * 255f).roundToInt()
        }
    }

    /**
     * How bright, how far sung, and whether each layer is the one being sung
     * at [t], milliseconds into the clip â€” one entry per clip layer, in layer
     * order. Sung rows read the highlight and the word sweep; a break's dots
     * read its clock, each owning its third and filling across it, the way
     * the panel lights them. The frame loop compares these frame to frame:
     * while nothing has changed, no frame is submitted at all â€” the
     * timestamps carry the pacing.
     */
    fun frameState(t: Long): FrameState {
        val alphas = frameAlphas(t)
        val reveals = FloatArray(clipLayers.size)
        val actives = BooleanArray(clipLayers.size)
        val active = activeGroup(t)
        val sungLines = request.lines.filter { !it.isGap }
        val spanStart = spanOf(request.lines)?.first ?: 0L
        for (i in clipLayers.indices) {
            val layer = clipLayers[i]
            if (layer.gap >= 0) {
                reveals[i] = 1f
                actives[i] = false
            } else {
                val line = sungLines.getOrNull(layer.group)
                val songTime = t + spanStart
                val lineReveal = if (line == null || line.words.isEmpty()) {
                    if (songTime >= (line?.startMs ?: 0L)) 1f else 0f
                } else {
                    (line.revealedChars(songTime) / line.text.length.coerceAtLeast(1)).coerceIn(0f, 1f)
                }
                val rowReveal = if (layer.isSub) lineReveal else {
                    val span = (layer.charEnd - layer.charStart).coerceAtLeast(1)
                    ((line?.revealedChars(songTime) ?: 0f) - layer.charStart)
                        .coerceIn(0f, span.toFloat()) / span
                }
                reveals[i] = (rowReveal * TEXT_STEPS).roundToInt() / TEXT_STEPS.toFloat()
                actives[i] = layer.group == active
            }
        }
        return FrameState(alphas, reveals, actives, scrollOffset(t))
    }

    private fun activeGroup(t: Long): Int {
        var g = -1
        for (i in lineStarts.indices) if (lineStarts[i] <= t) g = i else break
        return g
    }

    /** The state of every layer of the clip at [t], for the frame loop to
     * compare and composite. */
    data class FrameState(val alphas: IntArray, val reveals: FloatArray, val actives: BooleanArray, val scrollOffset: Float = 0f) {
        fun sameAs(other: FrameState?): Boolean = other != null &&
            alphas.contentEquals(other.alphas) &&
            reveals.contentEquals(other.reveals) &&
            actives.contentEquals(other.actives) &&
            scrollOffset == other.scrollOffset
    }

    /**
     * How far line [group] is lit at [t]: it rises over [CROSSFADE_MS] from its
     * own start, and is pulled back down over the same window as the line after
     * it rises â€” the two crossfading, the way the panel hands one line to the
     * next. Between them it sits at [DIM_LIT].
     */
    private fun weightFor(group: Int, t: Long): Float {
        if (group >= lineStarts.size || lineStarts.isEmpty()) return 1f
        val rise = ((t - lineStarts[group]).toFloat() / CROSSFADE_MS).coerceIn(0f, 1f)
        val fall = fallStarts.getOrNull(group)?.let {
            ((t - it).toFloat() / CROSSFADE_MS).coerceIn(0f, 1f)
        } ?: 0f
        return DIM_LIT + (1f - DIM_LIT) * rise * (1f - fall)
    }
}

/** Laid out once, drawn many times: the photo's frame and every frame of the video. */
internal suspend fun buildLyricsCardScene(
    context: Context,
    request: LyricsShareRequest,
    story: Boolean,
    allowScroll: Boolean = false,
): LyricsCardScene = withContext(Dispatchers.Default) {
    val cover = request.artworkUrl?.let { loadBitmap(context, it) }
    val logo = loadedLogo(context)
    LyricsCardScene(context, request, story, allowScroll, cover, logo)
}

// â”€â”€ Fitting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

private class Row(
    val text: String,
    val paint: Paint,
    val height: Float,
    val gapBefore: Float,
    /** Drawn centred rather than off the left edge â€” the gap marker. */
    val centered: Boolean = false,
    val isGap: Boolean = false,
    /** Which picked line this row belongs to, for the video's highlight. */
    val group: Int = -1,
    /** Which entry of the pick this row came from â€” a gap row points at its
     * own marker, which is how the clip finds the break's clock. */
    val lineIndex: Int = -1,
    /** Where this row's text sits in its line, so the word sweep can light
     * it from the left as the singer reaches each word. */
    val charStart: Int = 0,
    val charEnd: Int = 0,
    /** A translation or romanisation rides its line's clock, uniformly. */
    val isSub: Boolean = false,
)

/** The rows at one size, with everything needed to place them. */
private class Plan(val rows: List<Row>, val ascent: Float, val size: Float) {
    /** Distance from the top of the first line to the bottom of the last. */
    val content: Float
        get() = ascent + rows.fold(0f) { total, row -> total + row.gapBefore + row.height }
}

/**
 * The largest size on [FIT_LADDER] whose rows still fit in [room], or the
 * bottom rung when none of them do.
 *
 * The bottom rung is a floor rather than a last resort: under it the type stops
 * being worth sharing, so the frame grows to hold the words instead of the
 * words shrinking to hold the frame. That the player budgets characters at the
 * pick is what keeps this branch from ever being reached in practice.
 */
private fun fittestPlan(
    type: Fonts,
    lines: List<LyricsShareLine>,
    room: Float,
    allowScroll: Boolean = false,
): Plan {
    val ladder = if (allowScroll) SCROLL_LADDER else FIT_LADDER
    for (size in ladder) {
        val plan = planAt(type, lines, size)
        if (plan.content <= room) return plan
    }
    return planAt(type, lines, ladder.last())
}

/**
 * The rows at one [size], set in the face the lyrics panel draws with.
 *
 * SF Pro Display Heavy with the panel's tight tracking and its line advance,
 * carried over as the same ratios the panel's 34sp headline uses â€” so the card
 * reads as a still of that panel rather than as a different app quoting it.
 * Compose's tracking is absolute and `Paint`'s is a fraction of the size, hence
 * the divisions: -0.7 over 34 for the words, -0.7 over 20 for the smaller line
 * the panel hangs underneath them.
 */
private fun planAt(type: Fonts, lines: List<LyricsShareLine>, size: Float): Plan {
    val primary = type.heading(size, Color.WHITE).apply { letterSpacing = TRACKING }
    val subSize = (size * SUB_RATIO).coerceAtLeast(SUB_FLOOR)
    val secondary = type.heading(subSize, SUB_COLOR).apply { letterSpacing = SUB_TRACKING }

    val rows = mutableListOf<Row>()
    var group = -1
    lines.forEachIndexed { index, line ->
        if (line.isGap) {
            // The skipped lines, as "(...)" â€” the conventional editorial mark
            // for an omission, on the still. The clip replaces it with the
            // panel's own three dots filling across the break; this row stays
            // in the layout so the passage's height does not change between
            // the two.
            val marker = type.body(size * 0.65f, 0x66FFFFFF)
            val markerHeight = marker.descent() - marker.ascent()
            rows += Row("(...)", marker, markerHeight, 0f, isGap = true, lineIndex = index)
            return@forEachIndexed
        }
        group++
        var firstOfLine = true
        fun add(text: String, paint: Paint, height: Float, charStart: Int, isSub: Boolean) {
            // One verse line is one paragraph: its first row carries the space
            // above it and its wraps sit tight underneath, so a phrase reads as
            // a block rather than as a list of separate sentences.
            val gap = when {
                rows.isEmpty() -> 0f
                firstOfLine && index > 0 -> size * 0.55f
                else -> 0f
            }
            rows += Row(text, paint, height, gap, group = group, lineIndex = index,
                charStart = charStart, charEnd = charStart + text.length, isSub = isSub)
            firstOfLine = false
        }
        val wrapped = wrap(line.text, primary, CARD_CONTENT_W)
        wrapped.forEach { w -> add(w.text, primary, size * LEAD, w.charStart, false) }
        val sub = line.subText
        if (!sub.isNullOrBlank() && sub != line.text) {
            wrap(sub, secondary, CARD_CONTENT_W).forEach { w ->
                add(w.text, secondary, subSize * SUB_LEAD, 0, true)
            }
        }
    }
    return Plan(rows, -primary.ascent(), size)
}

// â”€â”€ Text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

private data class WrappedLine(val text: String, val charStart: Int)

/**
 * Greedy wrap at [width], breaking wherever the line has to.
 *
 * Not a plain word-wrap: Japanese, Chinese and Korean lyrics carry no spaces at
 * all, and a wrapper that only split on spaces would hand the whole verse to
 * `drawText` and let it run off the card. `breakText` finds the character that
 * fits, and only then is the break walked back to a space â€” so scripts that keep
 * their words apart lose nothing, and scripts that don't still get several lines.
 *
 * Each piece carries where it began in the source, so the word sweep knows which
 * characters it owns.
 */
private fun wrap(text: String, paint: Paint, width: Float): List<WrappedLine> {
    val leading = text.length - text.trimStart().length
    val source = text.trim()
    if (source.isEmpty()) return listOf(WrappedLine("", leading))

    val out = mutableListOf<WrappedLine>()
    var rest = source
    var consumed = 0
    while (rest.isNotEmpty()) {
        val fit = paint.breakText(rest, true, width, null)
        if (fit <= 0) {
            out += WrappedLine(rest, leading + consumed)
            break
        }
        // Walk back to the last space inside the fit, but only when something
        // still has to follow it â€” otherwise the fit is the whole string and
        // cutting at the space would drop the final word.
        val space = rest.lastIndexOf(' ', fit - 1)
        val take = if (space > 0 && fit < rest.length) space else fit
        if (take <= 0) {
            out += WrappedLine(rest, leading + consumed)
            break
        }
        val wrapped = rest.substring(0, take).trimEnd()
        out += WrappedLine(wrapped, leading + consumed)
        val remainder = rest.substring(take)
        val trimmed = remainder.trimStart()
        consumed += take + (remainder.length - trimmed.length)
        rest = trimmed
    }
    return out.filter { it.text.isNotEmpty() }.ifEmpty { listOf(WrappedLine("", leading)) }
}

// â”€â”€ Card geometry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

private const val CARD_W = 1080

/**
 * 9:16 â€” a ceiling on the height, not the height itself. The card is grown to
 * its passage and only ever comes out this tall when the passage demands it.
 */
private const val MAX_CARD_H = 1920f

private const val CARD_MARGIN = 72f
private const val CARD_CONTENT_W = CARD_W - CARD_MARGIN * 2

private const val LOGO_GAP = 20f
private const val BRAND = "BeatFlow"

/** Baseline of the mark at the top right, and just under it where the gap starts. */
private const val HEADER_BASELINE = 132f
private const val HEADER_BOTTOM = 170f

/** Air kept between the fixed furniture and the passage, both ends alike. */
private const val GAP_ABOVE_BODY = 20f
private const val GAP_BELOW_BODY = 20f

/** The sleeve square in the footer, and the air kept under it. */
private const val FOOTER_THUMB = 160f
private const val FOOTER_PAD = 96f

/** Smallest the translation line is allowed to get before it stops being legible. */
private const val SUB_FLOOR = 24f

/** Small visual correction so the omission marker sits below the line above. */
private const val GAP_MARKER_OFFSET = 0.18f

/**
 * The sizes tried, largest first.
 *
 * A ladder rather than a search: a dozen candidates is nothing to lay out, and
 * stepping by a visible amount keeps two cards with adjacent line counts from
 * coming out nearly the same size and reading as a mistake.
 *
 * The last rung doubles as the floor â€” see [fittestPlan] for why the frame is
 * what gives way under it rather than the type.
 */
private val FIT_LADDER = floatArrayOf(96f, 88f, 80f, 72f, 64f, 56f, 50f, 44f, 38f, 32f)

/** The sizes tried when the passage is allowed to scroll past the frame. */
private val SCROLL_LADDER = floatArrayOf(96f, 88f, 80f, 72f, 64f, 56f)

// â”€â”€ The panel's type, as ratios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every number here is one the lyrics panel uses, divided by the size it uses
// it at so it holds at whatever size the ladder lands on.

/** Tracking of the panel's headline: -0.7sp against its 34sp. */
private const val TRACKING = -0.7f / 34f

/** The same -0.7sp, against the 20sp it sets the line underneath in. */
private const val SUB_TRACKING = -0.7f / 20f

/** Line advance: 41sp over 34sp for the words, 25sp over 20sp for the sub. */
private const val LEAD = 41f / 34f
private const val SUB_LEAD = 25f / 20f

/** The sub-line against the words above it, and the white it is drawn in. */
private const val SUB_RATIO = 20f / 34f
private val SUB_COLOR = 0xD9FFFFFF.toInt()

// â”€â”€ The video's highlight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** The handover from one line to the next, and how far the unlit lines sit back. */
private const val CROSSFADE_MS = 320f
private const val DIM_LIT = 0.35f

/** How finely a sung line's word sweep is stepped. The clip is
 * variable-frame-rate, and each step is one more frame the line costs â€”
 * a couple of dozen across a line reads as fluid for a sweep this size. */
private const val TEXT_STEPS = 48

// â”€â”€ The break's dots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ The break's dots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The panel lights three dots across an instrumental break â€” each owning its
// third, resting dim, filling bright as its share of the silence runs. The
// clip carries the same mark, sized against the type it sits under.

/** A dot's diameter, and the air between dots, against the lyric's own size. */
private const val DOT_TO_TYPE = 0.38f
private const val DOT_GAP_TO_TYPE = 0.16f

/** How many dots a break fills, and how bright a dot rests before its turn. */
private const val GAP_DOTS = 3
private const val GAP_DOT_REST = 0.25f

/**
 * How finely a break's fill is stepped. The clip is variable-frame-rate â€” a
 * frame is only submitted when something on it moves â€” and each step here is
 * one more frame a break costs. Two dozen across three dots reads as fluid
 * for marks this small and caps a long interlude's bill.
 */
private const val GAP_STEPS = 24
