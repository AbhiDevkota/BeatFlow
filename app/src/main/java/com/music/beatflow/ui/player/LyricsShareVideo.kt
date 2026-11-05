package com.music.beatflow.ui.player

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaDataSource
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES20
import androidx.media3.common.util.UnstableApi
import com.music.beatflow.data.model.Song
import com.music.beatflow.playback.AudioCache
import com.music.beatflow.playback.smart.LocalAudioSource
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.coroutines.coroutineContext
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/**
 * The picked lines as one clip: the card, held on screen while the song plays
 * through the passage, the line being sung lit and the rest sitting back.
 *
 * ## Why MediaCodec
 *
 * The photo is a bitmap; a video is a stream of those bitmaps at a rate, plus
 * the sound, in a container a chat app will accept. Android's answer is
 * `MediaCodec` (an encoder fed frames) and `MediaMuxer` (the MP4 wrapper), and
 * there is nothing higher-level to reach for that isn't a whole rendering
 * engine. The frames come from [LyricsCardScene] — the same layout the still
 * card draws, so the clip is the picture moving — and the sound is the song
 * itself, decoded from wherever the app already has it and re-encoded to AAC,
 * trimmed to exactly the passage the lyrics span.
 *
 * ## Why EGL
 *
 * The encoder takes frames through a `Surface`, and a surface timestamps what
 * lands on it by the wall clock — which would pace the clip by how fast this
 * device happens to draw, drifting the words off the music. Drawing through
 * EGL instead lets each frame carry the timestamp it deserves
 * (`eglPresentationTimeANDROID`), so frame 200 always lands at 6.67s whatever
 * the renderer was doing. The scene draws into a software bitmap exactly as
 * the photo does, and the bitmap is uploaded as a texture — identical pixels,
 * at exact times.
 *
 * ## The audio
 *
 * Read through [MediaExtractor] off the same source the player uses — a local
 * file where the track is one, else the rendition already on disk in
 * [AudioCache], which is where streamed audio lands. It is the raw recording,
 * not the playing output: no equalizer, no crossfade, the same courtesy a
 * screenshot of the photo card is. Decoded to PCM, edged with a short fade so
 * the cut doesn't click, re-encoded AAC, and if any of that is impossible — a
 * source nothing cached, a codec the device won't give — the clip is still
 * made, silent, and the caller says so.
 */
internal data class LyricsVideo(
    val file: File,
    /** False when the song's audio was out of reach and the clip went out silent. */
    val hasAudio: Boolean,
)

/**
 * Renders [request] as a clip from the first picked line to the last.
 *
 * @param onProgress 0..1, called as often as there is news — the frame loop is
 * most of the work and reports through it.
 */
internal suspend fun renderLyricsShareVideo(
    context: Context,
    request: LyricsShareRequest,
    onProgress: (Float) -> Unit = {},
): LyricsVideo? = withContext(Dispatchers.Default) {
    // The frame is the story card: the whole 9:16, the passage centred in it,
    // however short the pick — a video has one shape for its whole length.
    val scene = buildLyricsCardScene(context, request, story = true)
    val (startMs, endMs) = spanOf(request.lines) ?: return@withContext null
    val spanMs = (endMs - startMs).coerceAtMost(MAX_SPAN_MS).coerceAtLeast(MIN_SPAN_MS)
    val frameCount = (spanMs * FPS / 1000f).roundToInt().coerceAtLeast(1)

    val folder = File(context.cacheDir, VIDEO_SHARE_FOLDER).apply { mkdirs() }
    val out = File(folder, VIDEO_FILE_NAME)
    out.delete()

    val callerContext = coroutineContext
    val muxer = runCatching {
        MediaMuxer(out.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    }.getOrElse { return@withContext null }

    try {
        // ── The picture ─────────────────────────────────────────────────────
        val frameBitmap = Bitmap.createBitmap(
            scene.width.roundToInt(),
            scene.height.roundToInt(),
            Bitmap.Config.ARGB_8888,
        )
        val frameCanvas = Canvas(frameBitmap)
        val encoded = GlVideoEncoder(scene.width.roundToInt(), scene.height.roundToInt())

        val video = try {
            encoded.start()
            val samples = mutableListOf<Sample>()
            var format: MediaFormat? = null
            fun collect(sample: Sample?, codecFormat: MediaFormat?) {
                if (codecFormat != null) format = codecFormat
                if (sample != null) samples += sample
            }
            // While the highlight holds still — most of any clip — the frame
            // is the one before it: the rows' brightness is compared frame to
            // frame, and an unchanged frame is posted at its new timestamp
            // without a redraw or an upload. The encoder sees a frame a step
            // regardless; the work between them is what goes.
            // The clip is variable-frame-rate, and glad of it: the picture
            // only changes when the highlight hands one line to the next, so
            // only those moments are submitted — at full 30fps through each
            // crossfade, and a single frame across every hold between them.
            // The timestamps carry the pacing, the encoder sees a tenth of
            // the frames, and the last frame is always sent so the container
            // knows where the clip ends.
            var lastAlphas: IntArray? = null
            for (frame in 0 until frameCount) {
                callerContext.ensureActive()
                val alphas = scene.frameAlphas((frame * FRAME_MS).toLong())
                if (lastAlphas == null || !alphas.contentEquals(lastAlphas) ||
                    frame == frameCount - 1
                ) {
                    scene.draw(frameCanvas, alphas)
                    encoded.draw(frameBitmap, frame * MICROS_PER_FRAME)
                    lastAlphas = alphas
                }
                encoded.drain(::collect)
                onProgress((frame + 1).toFloat() / frameCount * 0.78f)
            }
            // The container reads the last sample's length as the gap that
            // preceded it — across a hold that is seconds, and the clip would
            // linger long after its sound had ended. One more frame a step
            // after the last keeps the tail one frame long, as it should be.
            scene.draw(frameCanvas, lastAlphas ?: scene.frameAlphas(0L))
            encoded.draw(frameBitmap, frameCount * MICROS_PER_FRAME)
            encoded.drain(::collect)
            encoded.finish(::collect)
            if (samples.isEmpty()) return@withContext null
            Track(format ?: encoded.outputFormat(), samples)
        } finally {
            encoded.release()
        }

        // ── The sound ───────────────────────────────────────────────────────
        onProgress(0.78f)
        val audio = openSongAudio(context, request.song)?.use { source ->
            encodeAudioSpan(
                source,
                startMs * 1000L,
                (startMs + spanMs) * 1000L,
                checkActive = { callerContext.ensureActive() },
            ) { onProgress(0.78f + it * 0.18f) }
        }
        onProgress(0.97f)

        // ── The container ───────────────────────────────────────────────────
        val videoTrack = muxer.addTrack(video.format)
        val audioTrack = audio?.let { muxer.addTrack(it.format) }
        muxer.start()
        for (sample in video.samples) {
            muxer.writeSampleData(videoTrack, ByteBuffer.wrap(sample.bytes), sample.info)
        }
        if (audioTrack != null) {
            for (sample in audio.samples) {
                muxer.writeSampleData(audioTrack, ByteBuffer.wrap(sample.bytes), sample.info)
            }
        }
        onProgress(1f)
        LyricsVideo(out, hasAudio = audioTrack != null)
    } catch (e: Exception) {
        if (e is CancellationException) {
            // Stood down mid-render — the half-written clip is not a clip.
            out.delete()
            throw e
        }
        out.delete()
        null
    } finally {
        runCatching { muxer.release() }
    }
}

/** One encoded sample, ready for the muxer. */
internal class Sample(val bytes: ByteArray, val info: MediaCodec.BufferInfo)

/** A track's settled output format and everything encoded into it. */
internal class Track(val format: MediaFormat, val samples: List<Sample>)

// ── The frame feed ─────────────────────────────────────────────────────────

/**
 * The encoder's input surface, fronted by EGL so every frame can carry the
 * timestamp it deserves — see [renderLyricsShareVideo] for why a canvas on the
 * surface would pace the clip by the wall clock.
 */
private class GlVideoEncoder(private val width: Int, private val height: Int) {
    private var encoder: MediaCodec? = null
    private var inputSurface: android.view.Surface? = null
    private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE
    private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
    private var program = 0
    private var texture = 0
    private var quad: FloatBuffer? = null
    /** The frame's pixels, walked over once per upload — see [upload]. */
    private var pixels: ByteBuffer? = null
    private var texturedOnce = false
    private val bufferInfo = MediaCodec.BufferInfo()

    fun start() {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_FRAME_RATE, FPS)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_S)
        }
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val surface = codec.createInputSurface()
        codec.start()
        encoder = codec
        inputSurface = surface
        initEgl(surface)
    }

    private fun initEgl(surface: android.view.Surface) {
        display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        if (display == EGL14.EGL_NO_DISPLAY) fail("no EGL display")
        val version = IntArray(2)
        if (!EGL14.eglInitialize(display, version, 0, version, 1)) fail("eglInitialize")
        val attribs = intArrayOf(
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL_RECORDABLE_ANDROID, 1,
            EGL14.EGL_NONE,
        )
        val configs = arrayOfNulls<EGLConfig>(1)
        val counts = IntArray(1)
        if (!EGL14.eglChooseConfig(display, attribs, 0, configs, 0, configs.size, counts, 0) || counts[0] == 0) {
            fail("eglChooseConfig")
        }
        eglContext = EGL14.eglCreateContext(
            display,
            configs[0],
            EGL14.EGL_NO_CONTEXT,
            intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE),
            0,
        )
        if (eglContext == EGL14.EGL_NO_CONTEXT) fail("eglCreateContext")
        eglSurface = EGL14.eglCreateWindowSurface(display, configs[0], surface, intArrayOf(EGL14.EGL_NONE), 0)
        if (eglSurface == EGL14.EGL_NO_SURFACE) fail("eglCreateWindowSurface")
        if (!EGL14.eglMakeCurrent(display, eglSurface, eglSurface, eglContext)) fail("eglMakeCurrent")

        program = buildProgram()
        texture = buildTexture()
        quad = ByteBuffer.allocateDirect(QUAD.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
            put(QUAD)
            position(0)
        }
        pixels = ByteBuffer.allocateDirect(width * height * 4).order(ByteOrder.nativeOrder())
    }

    /** Draws [bitmap] as the next frame, stamped [presentationUs] microseconds in. */
    fun draw(bitmap: Bitmap, presentationUs: Long) {
        upload(bitmap)
        present(presentationUs)
    }

    /**
     * Posts another frame whose pixels the texture already holds — the same
     * picture at a new timestamp. The buffer is still drawn in full: what a
     * window surface hands back after a swap has no defined content, only the
     * texture is guaranteed to still be there.
     */
    fun present(presentationUs: Long) {
        drawQuad()
        EGLExt.eglPresentationTimeANDROID(display, eglSurface, presentationUs * 1000L)
        if (!EGL14.eglSwapBuffers(display, eglSurface)) fail("eglSwapBuffers")
    }

    /** Copies [bitmap] into the texture the quad is drawn with. */
    private fun upload(bitmap: Bitmap) {
        // GLUtils has texImage2D but no public sub-image call, so the pixels go
        // over through a buffer: copied straight out of the bitmap and handed
        // to GLES — the first draw allocates the texture, the rest update it.
        val buffer = pixels!!
        buffer.clear()
        bitmap.copyPixelsToBuffer(buffer)
        buffer.position(0)
        if (texturedOnce) {
            GLES20.glTexSubImage2D(
                GLES20.GL_TEXTURE_2D, 0, 0, 0, width, height,
                GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buffer,
            )
        } else {
            GLES20.glTexImage2D(
                GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, width, height, 0,
                GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buffer,
            )
            texturedOnce = true
        }
    }

    private fun drawQuad() {
        GLES20.glViewport(0, 0, width, height)
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        GLES20.glUseProgram(program)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
        val corners = quad ?: return
        val positionHandle = GLES20.glGetAttribLocation(program, "aPosition")
        val texHandle = GLES20.glGetAttribLocation(program, "aTexCoord")
        GLES20.glEnableVertexAttribArray(positionHandle)
        // The buffer interleaves position and texture coordinate — two floats
        // each, four to a corner — so the stride is one whole corner. A stride
        // of zero walks the positions straight through the coordinates: vertex
        // one's position becomes vertex zero's texture coordinate, and the quad
        // tears into the wedge that was rendering all along.
        GLES20.glVertexAttribPointer(positionHandle, 2, GLES20.GL_FLOAT, false, 16, corners)
        GLES20.glEnableVertexAttribArray(texHandle)
        GLES20.glVertexAttribPointer(
            texHandle, 2, GLES20.GL_FLOAT, false, 16,
            corners.duplicate().apply { position(2) },
        )
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(positionHandle)
        GLES20.glDisableVertexAttribArray(texHandle)
    }

    /**
     * Takes everything ready now; true when anything came out. [onSample]
     * gets null-plus-format on a format change, a sample when one is
     * complete, and nothing at EOS.
     */
    fun drain(onSample: (Sample?, MediaFormat?) -> Unit): Boolean {
        val codec = encoder ?: return false
        var got = false
        while (true) {
            val index = codec.dequeueOutputBuffer(bufferInfo, DRAIN_TIMEOUT_US)
            when {
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    onSample(null, codec.outputFormat)
                    got = true
                }

                index >= 0 -> {
                    val out = codec.getOutputBuffer(index)
                    if (out != null && bufferInfo.size > 0 &&
                        bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
                    ) {
                        // The config record rides the format; the muxer wants
                        // only real frames.
                        val bytes = ByteArray(bufferInfo.size)
                        out.position(bufferInfo.offset)
                        out.get(bytes)
                        onSample(
                            Sample(bytes, MediaCodec.BufferInfo().apply {
                                set(0, bytes.size, bufferInfo.presentationTimeUs, bufferInfo.flags)
                            }),
                            null,
                        )
                        got = true
                    }
                    codec.releaseOutputBuffer(index, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return true
                }

                else -> return got // nothing ready yet
            }
        }
    }

    /**
     * Ends the stream: the last frame is still travelling the surface pipeline
     * when this is called, so the queue is drained until it has landed before
     * the end-of-stream is signalled — signalling early would cut the clip's
     * final frame off, and with it the clip's own duration.
     */
    fun finish(onSample: (Sample?, MediaFormat?) -> Unit) {
        var idle = 0
        while (idle < 10) {
            idle = if (drain(onSample)) 0 else idle + 1
            if (idle > 0) Thread.sleep(5)
        }
        encoder?.signalEndOfInputStream()
        drain(onSample)
    }

    fun outputFormat(): MediaFormat = encoder?.outputFormat ?: fail("no output format")

    fun release() {
        runCatching { encoder?.stop() }
        runCatching { encoder?.release() }
        encoder = null
        runCatching { inputSurface?.release() }
        inputSurface = null
        if (display != EGL14.EGL_NO_DISPLAY) {
            runCatching {
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            }
            if (eglSurface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, eglSurface)
            if (eglContext != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, eglContext)
            EGL14.eglTerminate(display)
        }
        display = EGL14.EGL_NO_DISPLAY
        eglSurface = EGL14.EGL_NO_SURFACE
        eglContext = EGL14.EGL_NO_CONTEXT
    }

    private fun buildProgram(): Int {
        val vertex = """
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
                vTexCoord = aTexCoord;
            }
        """.trimIndent()
        val fragment = """
            precision mediump float;
            uniform sampler2D uTexture;
            varying vec2 vTexCoord;
            void main() {
                gl_FragColor = texture2D(uTexture, vTexCoord);
            }
        """.trimIndent()

        fun shader(type: Int, src: String): Int {
            val handle = GLES20.glCreateShader(type)
            GLES20.glShaderSource(handle, src)
            GLES20.glCompileShader(handle)
            return handle
        }
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, shader(GLES20.GL_VERTEX_SHADER, vertex))
        GLES20.glAttachShader(program, shader(GLES20.GL_FRAGMENT_SHADER, fragment))
        GLES20.glLinkProgram(program)
        return program
    }

    private fun buildTexture(): Int {
        val handles = IntArray(1)
        GLES20.glGenTextures(1, handles, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, handles[0])
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        return handles[0]
    }

    private fun fail(what: String): Nothing = throw IllegalStateException("Video encoder: $what failed")

    companion object {
        /**
         * Corners as a triangle strip — position first, texture coordinate
         * packed right after, per corner. The v coordinate runs the other way
         * round to the frame buffer because a bitmap's first row is its top
         * while GL's v=0 is the bottom: the frame's bottom-left shows the
         * bitmap's bottom-left.
         */
        private val QUAD = floatArrayOf(
            // x, y, u, v
            -1f, -1f, 0f, 1f,
            1f, -1f, 1f, 1f,
            -1f, 1f, 0f, 0f,
            1f, 1f, 1f, 0f,
        )

        private const val EGL_RECORDABLE_ANDROID = 0x3142
        private const val DRAIN_TIMEOUT_US = 10_000L
    }
}

// ── The sound ──────────────────────────────────────────────────────────────

/**
 * The song's recording, from wherever this app already has it: the file for a
 * track that lives on the device, else the rendition the disk cache holds —
 * which is what a streamed track's playback was reading anyway.
 *
 * Null when neither exists, which is how a clip ends up silent.
 */
@UnstableApi
internal fun openSongAudio(context: Context, song: Song): MediaDataSource? {
    song.localUri?.let { local ->
        val uri = Uri.parse(local)
        if (LocalAudioSource.isLocal(uri)) {
            return LocalAudioSource.open(context.contentResolver, uri)
        }
    }
    // The cache is keyed by recording, not by the expiring stream URL — see
    // AudioCache. The fullest rendition on disk is the one to read.
    val watch = Uri.parse("beatflow://watch?v=${song.videoId}")
    val pick = AudioCache.renditionsOf(watch).maxByOrNull { it.cachedPrefix } ?: return null
    return AudioCache.renditionDataSource(watch, pick)
}

private inline fun <T> MediaDataSource.use(block: (MediaDataSource) -> T): T {
    try {
        return block(this)
    } finally {
        runCatching { close() }
    }
}

/**
 * The container's span [startUs, endUs), decoded and re-encoded to AAC.
 * Two codecs in a row: the decoder turns the source's compressed audio into
 * PCM, the encoder turns that into the AAC an MP4 wants. The PTS are rebased
 * to zero at the cut, and the edges carry a short fade so the clip doesn't
 * open or close on a click.
 *
 * @param onProgress 0..1 through the span, called as chunks come out of the
 * decoder — the sound is most of what the last stretch of a render takes, and
 * without this the button would sit at the video's last number for seconds.
 */
internal fun encodeAudioSpan(
    source: MediaDataSource,
    startUs: Long,
    endUs: Long,
    checkActive: () -> Unit,
    onProgress: (Float) -> Unit = {},
): Track? {
    val extractor = MediaExtractor()
    try {
        extractor.setDataSource(source)
        var trackIndex = -1
        var trackFormat: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val f = extractor.getTrackFormat(i)
            val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
                trackIndex = i
                trackFormat = f
                break
            }
        }
        if (trackIndex < 0) return null
        val srcFormat = trackFormat!!
        val srcMime = srcFormat.getString(MediaFormat.KEY_MIME)!!
        val sampleRate = srcFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val channels = srcFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceIn(1, 2)
        extractor.selectTrack(trackIndex)
        extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

        val decoder = MediaCodec.createDecoderByType(srcMime)
        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        var sinkRate = sampleRate
        var sinkChannels = channels
        try {
            decoder.configure(srcFormat, null, null, 0)
            decoder.start()

            fun aacFormat(rate: Int, ch: Int): MediaFormat =
                MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, ch).apply {
                    setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                    setInteger(MediaFormat.KEY_BIT_RATE, AAC_BIT_RATE)
                    setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 65_536)
                }

            // A rate the encoder won't take — a 96kHz FLAC, say — falls back to
            // the one every encoder takes, resampled on the way through.
            var resample = false
            try {
                encoder.configure(aacFormat(sinkRate, sinkChannels), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            } catch (e: Exception) {
                sinkRate = FALLBACK_RATE
                sinkChannels = 2
                resample = true
                encoder.configure(aacFormat(sinkRate, sinkChannels), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            }
            encoder.start()

            val samples = mutableListOf<Sample>()
            var outFormat: MediaFormat? = null
            var decoderDone = false
            var encoderDone = false
            var stale = 0 // pump rounds that came back empty after the decoder finished
            var held: ByteArray? = null // PCM waiting for the encoder to take it
            var heldPts = 0L
            val info = MediaCodec.BufferInfo()
            val spanUs = endUs - startUs
            // One chunk of PCM at a time keeps the backpressure honest: the
            // decoder is only drained when the encoder has taken the last
            // chunk, so nothing is ever dropped on a full queue.
            fun takeIntoEncoder(): Boolean {
                val chunk = held ?: return false
                val index = encoder.dequeueInputBuffer(0L)
                if (index < 0) return false
                val input = encoder.getInputBuffer(index)!!
                input.clear()
                val data = if (resample) {
                    resampleLinear(chunk, sampleRate, channels, sinkRate, sinkChannels)
                } else {
                    chunk
                }
                input.put(data)
                encoder.queueInputBuffer(index, 0, data.size, heldPts, 0)
                held = null
                return true
            }

            while (!encoderDone) {
                checkActive()
                var worked = false

                // Feed the decoder from the container.
                if (!decoderDone) {
                    val inIndex = decoder.dequeueInputBuffer(0L)
                    if (inIndex >= 0) {
                        val input = decoder.getInputBuffer(inIndex)!!
                        val at = extractor.sampleTime
                        val size = if (at in 0 until endUs) extractor.readSampleData(input, 0) else -1
                        if (at < 0 || at >= endUs || size < 0) {
                            decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            decoderDone = true
                        } else {
                            decoder.queueInputBuffer(inIndex, 0, size, at, 0)
                            extractor.advance()
                        }
                        worked = true
                    }
                }

                // Drain the decoder into `held` — one chunk, only when the
                // last one has been taken.
                if (held == null && !decoderDone) {
                    val outIndex = decoder.dequeueOutputBuffer(info, 0L)
                    if (outIndex >= 0) {
                        worked = true
                        val pcm = decoder.getOutputBuffer(outIndex)!!
                        // The clip's own clock: source PTS, counted from the
                        // cut. The seek landed on a sync point at or before
                        // it, so the first PCM may begin a little before zero.
                        var pts = info.presentationTimeUs - startUs
                        var offset = info.offset
                        var size = info.size
                        val bytesPerUs = sampleRate * channels * 2 / 1_000_000.0
                        // Trim anything the sync point put before the cut.
                        if (pts < 0) {
                            val cut = (-pts * bytesPerUs).toInt() / (channels * 2) * (channels * 2)
                            offset += cut
                            size -= cut
                            pts = 0
                        }
                        // And anything past the far end.
                        val roomBytes = ((spanUs - pts) * bytesPerUs).toInt()
                        if (roomBytes < size) size = roomBytes / (channels * 2) * (channels * 2)
                        if (pts >= 0 && size > 0) {
                            val chunk = ByteArray(size)
                            pcm.position(offset)
                            pcm.get(chunk)
                            fade(chunk, pts, sampleRate, channels, spanUs)
                            held = chunk
                            heldPts = pts
                            onProgress((pts.toFloat() / spanUs).coerceIn(0f, 1f))
                        }
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) decoderDone = true
                        decoder.releaseOutputBuffer(outIndex, false)
                    } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED ||
                        outIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED
                    ) {
                        worked = true
                    }
                }

                // Hand the held chunk to the encoder, then drain it.
                if (takeIntoEncoder()) worked = true
                while (!encoderDone) {
                    val e = encoder.dequeueOutputBuffer(info, 0L)
                    when {
                        e == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                            outFormat = encoder.outputFormat
                            worked = true
                        }
                        e >= 0 -> {
                            val out = encoder.getOutputBuffer(e)!!
                            if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                                val bytes = ByteArray(info.size)
                                out.position(info.offset)
                                out.get(bytes)
                                samples += Sample(bytes, MediaCodec.BufferInfo().apply {
                                    set(0, bytes.size, info.presentationTimeUs, info.flags)
                                })
                            }
                            encoder.releaseOutputBuffer(e, false)
                            worked = true
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                                encoderDone = true
                                break
                            }
                        }
                        else -> break
                    }
                }
                // Nothing anywhere and the encoder still hasn't said EOS: it
                // should have, once the decoder was done. A stall is counted,
                // not waited out forever — the clip keeps whatever was encoded.
                if (!worked) {
                    if (decoderDone && !encoderDone) {
                        if (++stale > STALE_ROUNDS) break
                    } else {
                        // Let the codecs breathe instead of spinning a hot
                        // zero-timeout loop.
                        Thread.sleep(2)
                    }
                } else {
                    stale = 0
                }
            }
            val settled = outFormat ?: encoder.outputFormat
            return if (samples.isEmpty()) null else Track(settled, samples)
        } finally {
            runCatching { decoder.stop() }
            runCatching { decoder.release() }
            runCatching { encoder.stop() }
            runCatching { encoder.release() }
        }
    } catch (e: Exception) {
        return null
    } finally {
        runCatching { extractor.release() }
    }
}

/** [src] PCM16 at one rate and width, walked to another. */
private fun resampleLinear(src: ByteArray, srcRate: Int, srcCh: Int, dstRate: Int, dstCh: Int): ByteArray {
    val shortView = ByteBuffer.wrap(src).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    val srcFrames = shortView.remaining() / srcCh
    if (srcFrames == 0) return ByteArray(0)
    val dstFrames = (srcFrames.toLong() * dstRate / srcRate).toInt().coerceAtLeast(1)
    val out = ByteBuffer.allocate(dstFrames * dstCh * 2).order(ByteOrder.LITTLE_ENDIAN)
    val ratio = srcRate.toDouble() / dstRate
    for (frame in 0 until dstFrames) {
        val at = frame * ratio
        val i = at.toInt().coerceAtMost(srcFrames - 1)
        val frac = (at - i).toFloat()
        for (ch in 0 until dstCh) {
            val srcChannel = ch.coerceAtMost(srcCh - 1)
            val a = shortView.get(i * srcCh + srcChannel)
            val b = if (i + 1 < srcFrames) shortView.get((i + 1) * srcCh + srcChannel) else a
            out.putShort((a + (b - a) * frac).toInt().toShort())
        }
    }
    return out.array()
}

/**
 * A short fade on the clip's first and last [FADE_MS], over the raw samples —
 * the cut lands mid-song, and a boundary that starts at full swing clicks.
 */
private fun fade(chunk: ByteArray, ptsUs: Long, sampleRate: Int, channels: Int, spanUs: Long) {
    val shortView = ByteBuffer.wrap(chunk).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    val fadeFrames = (FADE_MS * sampleRate / 1000).toLong().coerceAtLeast(1)
    val totalFrames = spanUs * sampleRate / 1_000_000
    val frames = shortView.remaining() / channels
    for (frame in 0 until frames) {
        val global = ptsUs * sampleRate / 1_000_000 + frame
        val into = global.coerceAtMost(fadeFrames)
        val left = (totalFrames - global).coerceAtMost(fadeFrames)
        val factor = minOf(into, left, fadeFrames).toFloat() / fadeFrames
        if (factor >= 1f) continue
        for (ch in 0 until channels) {
            val at = frame * channels + ch
            shortView.put(at, (shortView.get(at) * factor).toInt().toShort())
        }
    }
}

// ── Constants ──────────────────────────────────────────────────────────────

private const val FPS = 30
private const val FRAME_MS = 1000f / FPS
private const val MICROS_PER_FRAME = 1_000_000L / FPS

/** Text on gradients wants the headroom; a clip this short stays light on disk. */
private const val BIT_RATE = 10_000_000
private const val I_FRAME_INTERVAL_S = 2

private const val AAC_BIT_RATE = 128_000

/** The rate every AAC encoder takes, when the source's own won't do. */
private const val FALLBACK_RATE = 48_000

/** The clip is a passage, not a mixtape; the pick budget keeps this far away. */
private const val MAX_SPAN_MS = 60_000L
private const val MIN_SPAN_MS = 1_000L

private const val DRAIN_TIMEOUT_US = 10_000L

/** How many empty drain rounds a codec gets before it is called wedged. */
private const val STALE_ROUNDS = 1_000

/** How long the sound takes to come up, and to go away, at each end. */
private const val FADE_MS = 120

/** Where the clip waits to be saved or handed off — the FileProvider's folder. */
internal const val VIDEO_SHARE_FOLDER = "shared"
internal const val VIDEO_FILE_NAME = "lyrics-video.mp4"
