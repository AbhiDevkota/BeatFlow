package com.music.bitchord.ui.components

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.IosShare
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.res.ResourcesCompat
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.music.bitchord.R
import com.music.bitchord.data.YtMusicRepository
import com.music.bitchord.data.code.BitChordCodec
import com.music.bitchord.data.model.SearchFilter
import com.music.bitchord.data.model.SearchResult
import com.music.bitchord.data.model.Song
import com.music.bitchord.ui.haptics.Haptic
import com.music.bitchord.ui.haptics.rememberHaptics
import com.music.bitchord.ui.player.PlayerDrawer
import com.music.bitchord.ui.replay.ShareAction
import com.music.bitchord.ui.replay.cacheForSharing
import com.music.bitchord.ui.replay.saveToGallery
import com.music.bitchord.ui.replay.sendIntent
import dev.chrisbanes.haze.HazeState
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val MIN_BAR_HEIGHT_FRACTION = 0.20f
private const val MAX_BAR_HEIGHT_FRACTION = 0.96f

/**
 * Target item (song track or artist album) rendered as a BitChord visual soundwave code card.
 */
data class BitChordCodeTarget(
    val type: BitChordCodec.MediaType,
    val id: String,
    val title: String,
    val subtitle: String,
    val thumbnailUrl: String?,
    val shareUrl: String,
    val filePrefix: String,
    val fallbackThumbnailUrl: String? = null,
) {
    companion object {
        fun forSong(song: Song) = BitChordCodeTarget(
            type = BitChordCodec.MediaType.TRACK,
            id = song.videoId,
            title = song.title,
            subtitle = song.artist,
            thumbnailUrl = song.thumbnailUrl,
            shareUrl = "https://music.youtube.com/watch?v=${song.videoId}",
            filePrefix = "bitchord-code",
        )

        fun forAlbum(
            browseId: String,
            title: String,
            subtitle: String,
            thumbnailUrl: String?,
        ) = BitChordCodeTarget(
            type = BitChordCodec.MediaType.ALBUM,
            id = browseId,
            title = title,
            subtitle = subtitle,
            thumbnailUrl = thumbnailUrl,
            shareUrl = "https://music.youtube.com/browse/$browseId",
            filePrefix = "bitchord-album-code",
        )
    }
}

private const val CODE_UNAVAILABLE_MESSAGE =
    "Cannot create a BitChord Code right now. Connect to the internet or make sure this track is available on YouTube Music."

private fun isValidCodecId(id: String): Boolean =
    id.isNotEmpty() && id.length <= 63 && id.all { it in BitChordCodec.ALPHABET }

private fun hasInternetConnection(context: Context): Boolean {
    val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return false
    val capabilities = runCatching {
        connectivity.getNetworkCapabilities(connectivity.activeNetwork)
    }.getOrNull() ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

/**
 * Draws the BitChord visual soundwave code bars in Compose.
 */
@Composable
fun BitChordCodeBar(
    levels: List<Int>,
    modifier: Modifier = Modifier,
    barColor: Color = Color.White,
) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        if (levels.isEmpty()) return@Canvas
        val count = levels.size
        val availableWidth = size.width
        val barWidth = (availableWidth / (count * 1.8f)).coerceIn(1.8.dp.toPx(), 8.dp.toPx())
        val gap = (availableWidth - count * barWidth) / (count - 1).coerceAtLeast(1)

        val centerY = size.height / 2f
        val minH = size.height * MIN_BAR_HEIGHT_FRACTION
        val maxH = size.height * MAX_BAR_HEIGHT_FRACTION

        for (i in levels.indices) {
            val level = levels[i].coerceIn(0, 7)
            val barH = minH + (level / 7f) * (maxH - minH)
            val x = i * (barWidth + gap)
            val y = centerY - barH / 2f

            drawRoundRect(
                color = barColor,
                topLeft = Offset(x, y),
                size = Size(barWidth, barH),
                cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f),
            )
        }
    }
}

/**
 * The BitChord Code Card displaying:
 * - Background: Artwork blurred (like lyrics video share), with scrim
 * - Top: Cover art on left, Title & subtitle/artist on right
 * - Bottom: BitChord logo on left (below cover art), with the soundwave code
 *   bars expanding across to the right (below the title column).
 */
@Composable
fun BitChordCodeCard(
    target: BitChordCodeTarget,
    levels: List<Int>,
    modifier: Modifier = Modifier,
    isLoadingCode: Boolean = false,
) {
    val glassActive = LocalLiquidGlassEnabled.current && isGlassSupported()
    var useFallbackArt by remember(target.thumbnailUrl, target.fallbackThumbnailUrl) {
        mutableStateOf(target.thumbnailUrl.isNullOrBlank())
    }
    val artModel = if (useFallbackArt) target.fallbackThumbnailUrl else target.thumbnailUrl

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .border(
                1.dp,
                Color.White.copy(alpha = if (glassActive) 0.26f else 0.16f),
                RoundedCornerShape(24.dp),
            ),
    ) {
        // Artwork cover as blurred background (matching lyrics video share: 10.dp blur & 0.4f scrim)
        if (!artModel.isNullOrBlank()) {
            AsyncImage(
                model = artModel,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                onError = {
                    if (!useFallbackArt && !target.fallbackThumbnailUrl.isNullOrBlank()) {
                        useFallbackArt = true
                    }
                },
                modifier = Modifier
                    .matchParentSize()
                    .blur(10.dp),
            )
        }

        // Translucent glass overlay passing color like the 3-dot menu in glass mode,
        // with the exact 40% black scrim from the lyrics video share (CLIP_SCRIM = 0.4f)
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    if (glassActive) {
                        Color.Black.copy(alpha = 0.35f)
                    } else {
                        Color.Black.copy(alpha = 0.40f)
                    },
                ),
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
        ) {
            // Top Section: Cover art on left, Title & Subtitle on right
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Cover thumbnail
                AsyncImage(
                    model = artModel,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    onError = {
                        if (!useFallbackArt && !target.fallbackThumbnailUrl.isNullOrBlank()) {
                            useFallbackArt = true
                        }
                    },
                    modifier = Modifier
                        .size(76.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.22f), RoundedCornerShape(12.dp)),
                )

                Spacer(Modifier.width(14.dp))

                // Title and Subtitle (no "BitChord Code" badge)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = target.title,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-0.2).sp,
                        ),
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (target.subtitle.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = target.subtitle,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.76f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            // Bottom Section: BitChord logo on left, code bar expanded to the right
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // BitChord logo (centered directly below the cover art)
                Box(
                    modifier = Modifier.width(76.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_logo),
                        contentDescription = "BitChord",
                        tint = Color.White,
                        modifier = Modifier.size(width = 38.dp, height = 24.dp),
                    )
                }

                Spacer(Modifier.width(14.dp))

                // Soundwave code bars expanded across to the right
                if (isLoadingCode) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.dp,
                            color = Color.White.copy(alpha = 0.75f),
                        )
                    }
                } else {
                    BitChordCodeBar(
                        levels = levels,
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        barColor = Color.White,
                    )
                }
            }
        }
    }
}

private val DrawerPlainFill = Color.White.copy(alpha = 0.10f)
private const val DRAWER_SCREEN_SHARE = 0.85f

/**
 * Bottom drawer presenting the BitChord Code card in the same frosted bottom-sheet
 * style as the Lyrics Share sheet, with Save, Share, and Copy Link actions.
 */
@Composable
fun BitChordCodeShareSheet(
    hazeState: HazeState,
    target: BitChordCodeTarget,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    val haptics = rememberHaptics()
    val glassActive = LocalLiquidGlassEnabled.current && isGlassSupported()

    val isOnline = remember(target) { hasInternetConnection(context) }
    val isDirectCodecId = remember(target.id) { isValidCodecId(target.id) }
    var activeTarget by remember(target) { mutableStateOf(target) }
    var resolvingCode by remember(target) { mutableStateOf(isOnline && !isDirectCodecId) }
    var errorMessage by remember(target) {
        mutableStateOf(if (!isOnline) CODE_UNAVAILABLE_MESSAGE else null)
    }

    // Online local tracks (content:// or file:// URIs) resolve their YouTube Music videoId by
    // title + artist so the shared card links to a playable track; otherwise show the unavailable error.
    LaunchedEffect(target, isOnline, isDirectCodecId) {
        if (!isOnline) {
            errorMessage = CODE_UNAVAILABLE_MESSAGE
            resolvingCode = false
            return@LaunchedEffect
        }
        if (isDirectCodecId) return@LaunchedEffect

        val hasArtist = target.subtitle.isNotBlank() &&
            !target.subtitle.equals("Unknown Artist", ignoreCase = true)
        val queries = buildList {
            if (hasArtist) add("${target.title} ${target.subtitle}".trim())
            if (target.title.isNotBlank()) add(target.title.trim())
        }.distinct()

        val matched = withContext(Dispatchers.IO) {
            var resolved: Song? = null
            for (query in queries) {
                resolved = runCatching {
                    YtMusicRepository.search(query, SearchFilter.SONGS).getOrNull()
                        ?.filterIsInstance<SearchResult.Track>()
                        ?.firstOrNull { isValidCodecId(it.song.videoId) }
                        ?.song
                }.getOrNull()
                if (resolved != null) break
            }
            resolved
        }

        if (matched != null) {
            activeTarget = target.copy(
                id = matched.videoId,
                shareUrl = "https://music.youtube.com/watch?v=${matched.videoId}",
                fallbackThumbnailUrl = matched.thumbnailUrl,
            )
            errorMessage = null
        } else {
            errorMessage = CODE_UNAVAILABLE_MESSAGE
        }
        resolvingCode = false
    }

    val levels = remember(activeTarget.type, activeTarget.id, errorMessage) {
        if (errorMessage != null || !isValidCodecId(activeTarget.id)) {
            emptyList()
        } else {
            runCatching {
                BitChordCodec.encode(activeTarget.type, activeTarget.id)
            }.getOrDefault(emptyList())
        }
    }

    val canExport = errorMessage == null && !resolvingCode && levels.isNotEmpty()
    var isSharing by remember(target) { mutableStateOf(false) }
    var isSaving by remember(target) { mutableStateOf(false) }
    var saved by remember(target) { mutableStateOf(false) }
    var copied by remember(target) { mutableStateOf(false) }

    LaunchedEffect(copied) {
        if (copied) {
            kotlinx.coroutines.delay(2000L)
            copied = false
        }
    }

    BackHandler(onBack = onDismiss)

    PlayerDrawer(
        hazeState = hazeState,
        title = "BitChord Code",
        onDismiss = onDismiss,
        modifier = modifier,
        titleGap = 6.dp,
        maxHeight = (LocalConfiguration.current.screenHeightDp * DRAWER_SCREEN_SHARE).dp,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (errorMessage != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(24.dp))
                        .background(DrawerPlainFill)
                        .border(
                            width = 1.dp,
                            color = Color.White.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(24.dp),
                        )
                        .padding(horizontal = 24.dp, vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.ErrorOutline,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.85f),
                        modifier = Modifier.size(34.dp),
                    )
                    Text(
                        text = "BitChord Code Unavailable",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = Color.White,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = errorMessage.orEmpty(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.72f),
                        textAlign = TextAlign.Center,
                    )
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(DrawerPlainFill)
                        .clickable {
                            haptics.play(Haptic.Tap)
                            onDismiss()
                        }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Close",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = Color.White,
                    )
                }
            } else {
                Text(
                    text = if (activeTarget.type == BitChordCodec.MediaType.ALBUM) {
                        "Scan this code in BitChord to open the album"
                    } else {
                        "Scan this code in BitChord to play the song"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.7f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 4.dp),
                )

                BitChordCodeCard(
                    target = activeTarget,
                    levels = levels,
                    isLoadingCode = resolvingCode && levels.isEmpty(),
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ShareAction(
                        label = stringResource(R.string.save),
                        icon = Icons.Rounded.Download,
                        accent = false,
                        enabled = canExport && !isSaving && !isSharing,
                        plainFill = DrawerPlainFill,
                        saved = saved,
                        savedLabel = stringResource(R.string.saved_bang),
                        busy = isSaving,
                        busyLabel = stringResource(R.string.lyrics_share_saving),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptics.play(Haptic.Tap)
                            saved = false
                            isSaving = true
                            scope.launch {
                                val bitmap = renderBitChordCodeBitmap(context, activeTarget, levels, glassActive)
                                val ok = saveToGallery(context, bitmap, activeTarget.title, activeTarget.filePrefix)
                                isSaving = false
                                if (ok) {
                                    saved = true
                                } else {
                                    Toast.makeText(context, "Failed to save", Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                    )

                    ShareAction(
                        label = stringResource(R.string.share),
                        icon = Icons.Rounded.IosShare,
                        accent = true,
                        enabled = canExport && !isSharing && !isSaving,
                        busy = isSharing,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptics.play(Haptic.Tap)
                            isSharing = true
                            scope.launch {
                                val bitmap = renderBitChordCodeBitmap(context, activeTarget, levels, glassActive)
                                val uri = cacheForSharing(context, bitmap, "${activeTarget.filePrefix}.png")
                                isSharing = false
                                if (uri != null) {
                                    val intent = sendIntent(uri)
                                    context.startActivity(Intent.createChooser(intent, "BitChord Code"))
                                } else {
                                    Toast.makeText(context, "Could not create share image", Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                    )

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(14.dp))
                            .background(DrawerPlainFill.copy(alpha = if (canExport) DrawerPlainFill.alpha else 0.04f))
                            .clickable(enabled = canExport) {
                                clipboard.setText(AnnotatedString(activeTarget.shareUrl))
                                copied = true
                                haptics.play(Haptic.Tap)
                            }
                            .padding(horizontal = 16.dp, vertical = 15.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = if (copied) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                            contentDescription = "Copy Link",
                            tint = Color.White.copy(alpha = if (canExport) 1f else 0.4f),
                            modifier = Modifier.size(21.dp),
                        )
                    }
                }
            }
        }
    }
}

/**
 * Renders a high-resolution BitChord Code card bitmap matching [BitChordCodeCard] pixel-for-pixel:
 * - Reference card width: 320.dp scaled 3.75x to 1200px
 * - True CenterCrop artwork with 3-pass Gaussian blur (equivalent to 10.dp) + 35%/40% scrim
 * - SF Pro Display typography with 2-line title wrapping and vertical centering
 * - Exact cover, corner radius, logo, and soundwave bar proportions
 */
suspend fun renderBitChordCodeBitmap(
    context: Context,
    target: BitChordCodeTarget,
    levels: List<Int>,
    glassActive: Boolean = false,
): Bitmap = withContext(Dispatchers.IO) {
    val width = 1200
    val scale = width / 320f // 3.75px per dp

    val pad = 18f * scale
    val artSize = 76f * scale
    val artRadius = 12f * scale
    val gapX = 14f * scale
    val gapY = 18f * scale
    val cardRadius = 24f * scale
    val codeBarH = 44f * scale
    val borderStroke = 1f * scale

    // Typography matching Material3 titleMedium (16sp bold) & bodyMedium (14sp) in SF Pro
    val semiboldFace = runCatching {
        ResourcesCompat.getFont(context, R.font.sf_pro_display_semibold)
    }.getOrNull() ?: Typeface.DEFAULT_BOLD
    val regularFace = runCatching {
        ResourcesCompat.getFont(context, R.font.sf_pro_display_regular)
    }.getOrNull() ?: Typeface.DEFAULT

    val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textSize = 16f * scale
        typeface = semiboldFace
        letterSpacing = -0.012f
    }

    val artistPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xC2FFFFFF.toInt() // 0.76f white
        textSize = 14f * scale
        typeface = regularFace
    }

    val textLeft = pad + artSize + gapX
    val textMaxW = (width - pad - textLeft).roundToInt().coerceAtLeast(100)

    val titleLayout = StaticLayout.Builder
        .obtain(target.title, 0, target.title.length, titlePaint, textMaxW)
        .setAlignment(Layout.Alignment.ALIGN_NORMAL)
        .setLineSpacing(0f, 1.12f)
        .setIncludePad(false)
        .setMaxLines(2)
        .setEllipsize(TextUtils.TruncateAt.END)
        .build()

    val hasSubtitle = target.subtitle.isNotBlank()
    val artistLayout = if (hasSubtitle) {
        StaticLayout.Builder
            .obtain(target.subtitle, 0, target.subtitle.length, artistPaint, textMaxW)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(false)
            .setMaxLines(1)
            .setEllipsize(TextUtils.TruncateAt.END)
            .build()
    } else {
        null
    }

    val artistGap = if (hasSubtitle) 4f * scale else 0f
    val textBlockH = titleLayout.height + artistGap + (artistLayout?.height ?: 0)
    val topRowH = max(artSize, textBlockH)
    val height = (pad + topRowH + gapY + codeBarH + pad).roundToInt()

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val cardRect = RectF(0f, 0f, width.toFloat(), height.toFloat())
    val clipPath = android.graphics.Path().apply {
        addRoundRect(cardRect, cardRadius, cardRadius, android.graphics.Path.Direction.CW)
    }
    canvas.save()
    canvas.clipPath(clipPath)

    // Load artwork bitmap via Coil (trying primary URL, then fallback remote artwork)
    var artBitmap: Bitmap? = null
    for (url in listOfNotNull(target.thumbnailUrl, target.fallbackThumbnailUrl)) {
        if (url.isBlank()) continue
        try {
            val request = ImageRequest.Builder(context)
                .data(url)
                .allowHardware(false)
                .build()
            val result = SingletonImageLoader.get(context).execute(request)
            if (result is SuccessResult) {
                artBitmap = result.image.toBitmap()
                break
            }
        } catch (_: Exception) {}
    }

    // 1. Background: CenterCrop artwork with smooth Gaussian blur (10.dp equivalent) + scrim
    if (artBitmap != null && !artBitmap.isRecycled) {
        val bgScaleDown = 4
        val bw = (width / bgScaleDown).coerceAtLeast(64)
        val bh = (height / bgScaleDown).coerceAtLeast(32)
        val smallCropped = centerCropBitmap(artBitmap, bw, bh)
        boxBlur3Pass(smallCropped, radius = (10f * scale / bgScaleDown).roundToInt().coerceIn(5, 16))
        val blurPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        canvas.drawBitmap(smallCropped, null, cardRect, blurPaint)
        smallCropped.recycle()

        val scrimAlpha = if (glassActive) 0x59000000 else 0x66000000
        val scrimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = scrimAlpha }
        canvas.drawRect(cardRect, scrimPaint)
    } else {
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF12151E.toInt() }
        canvas.drawRect(cardRect, bgPaint)
    }

    // 2. Outer card border (inset by half stroke so it is not clipped by clipPath)
    val borderInset = borderStroke / 2f
    val borderRect = RectF(borderInset, borderInset, width - borderInset, height - borderInset)
    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = borderStroke
        color = if (glassActive) 0x42FFFFFF else 0x29FFFFFF // 0.26f or 0.16f white
    }
    canvas.drawRoundRect(borderRect, cardRadius - borderInset, cardRadius - borderInset, borderPaint)

    // 3. Top Row: Center-cropped cover thumbnail & vertically centered Title/Subtitle
    val artTop = pad + (topRowH - artSize) / 2f
    val artRect = RectF(pad, artTop, pad + artSize, artTop + artSize)
    if (artBitmap != null && !artBitmap.isRecycled) {
        val artPath = android.graphics.Path().apply {
            addRoundRect(artRect, artRadius, artRadius, android.graphics.Path.Direction.CW)
        }
        val srcRect = centerCropSrcRect(artBitmap.width, artBitmap.height, artRect.width(), artRect.height())
        canvas.save()
        canvas.clipPath(artPath)
        canvas.drawBitmap(artBitmap, srcRect, artRect, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        canvas.restore()
    } else {
        val placeholderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF242834.toInt() }
        canvas.drawRoundRect(artRect, artRadius, artRadius, placeholderPaint)
    }
    val artBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = borderStroke
        color = 0x38FFFFFF // ~0.22f white
    }
    canvas.drawRoundRect(artRect, artRadius, artRadius, artBorder)

    // Draw vertically centered Title & Subtitle
    val textTop = pad + (topRowH - textBlockH) / 2f
    canvas.save()
    canvas.translate(textLeft, textTop)
    titleLayout.draw(canvas)
    if (artistLayout != null) {
        canvas.translate(0f, titleLayout.height + artistGap)
        artistLayout.draw(canvas)
    }
    canvas.restore()

    // 4. Bottom Row: BitChord logo (38x24 dp scaled) & soundwave code bars (44 dp scaled)
    val bottomRowTop = pad + topRowH + gapY
    val bottomCenterY = bottomRowTop + codeBarH / 2f

    val logoDrawable = ResourcesCompat.getDrawable(context.resources, R.drawable.ic_logo, null)
    val logoW = 38f * scale
    val logoH = 24f * scale
    val logoLeft = pad + (artSize - logoW) / 2f

    if (logoDrawable != null) {
        logoDrawable.setTint(0xFFFFFFFF.toInt())
        logoDrawable.setBounds(
            logoLeft.roundToInt(),
            (bottomCenterY - logoH / 2f).roundToInt(),
            (logoLeft + logoW).roundToInt(),
            (bottomCenterY + logoH / 2f).roundToInt(),
        )
        logoDrawable.draw(canvas)
    }

    // Draw Code Bars matching BitChordCodeBar proportions
    val codeLeft = textLeft
    val codeRight = width - pad
    val codeWidth = codeRight - codeLeft
    val count = levels.size

    if (count > 0) {
        val barWidth = (codeWidth / (count * 1.8f)).coerceIn(1.8f * scale, 8f * scale)
        val gap = (codeWidth - count * barWidth) / (count - 1).coerceAtLeast(1)
        val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt() }

        val minH = codeBarH * MIN_BAR_HEIGHT_FRACTION
        val maxH = codeBarH * MAX_BAR_HEIGHT_FRACTION

        for (i in levels.indices) {
            val level = levels[i].coerceIn(0, 7)
            val barH = minH + (level / 7f) * (maxH - minH)
            val bx = codeLeft + i * (barWidth + gap)
            val by = bottomCenterY - barH / 2f
            canvas.drawRoundRect(
                RectF(bx, by, bx + barWidth, by + barH),
                barWidth / 2f,
                barWidth / 2f,
                barPaint,
            )
        }
    }

    canvas.restore()
    bitmap
}

/**
 * Computes the source [Rect] for CenterCrop scaling of an image into a target aspect ratio.
 */
private fun centerCropSrcRect(srcW: Int, srcH: Int, dstW: Float, dstH: Float): Rect {
    val srcRatio = srcW.toFloat() / max(1, srcH)
    val dstRatio = dstW / max(1f, dstH)
    return if (srcRatio > dstRatio) {
        val cropW = (srcH * dstRatio).roundToInt().coerceIn(1, srcW)
        val left = (srcW - cropW) / 2
        Rect(left, 0, left + cropW, srcH)
    } else {
        val cropH = (srcW / dstRatio).roundToInt().coerceIn(1, srcH)
        val top = (srcH - cropH) / 2
        Rect(0, top, srcW, top + cropH)
    }
}

/**
 * Creates a center-cropped mutable ARGB_8888 bitmap of exact dimensions [targetW] x [targetH].
 */
private fun centerCropBitmap(src: Bitmap, targetW: Int, targetH: Int): Bitmap {
    val out = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    val srcRect = centerCropSrcRect(src.width, src.height, targetW.toFloat(), targetH.toFloat())
    val dstRect = Rect(0, 0, targetW, targetH)
    c.drawBitmap(src, srcRect, dstRect, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    return out
}

/**
 * Fast 3-pass separable box blur on a small mutable bitmap, closely approximating a true Gaussian blur
 * with edge clamping (matching Compose Modifier.blur behavior).
 */
private fun boxBlur3Pass(bitmap: Bitmap, radius: Int) {
    if (radius < 1) return
    val w = bitmap.width
    val h = bitmap.height
    val pixels = IntArray(w * h)
    val temp = IntArray(w * h)
    bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

    repeat(3) {
        boxBlurHorizontal(pixels, temp, w, h, radius)
        boxBlurVertical(temp, pixels, w, h, radius)
    }
    bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
}

private fun boxBlurHorizontal(src: IntArray, dst: IntArray, w: Int, h: Int, r: Int) {
    val div = r * 2 + 1
    for (y in 0 until h) {
        val row = y * w
        var rSum = 0
        var gSum = 0
        var bSum = 0
        for (i in -r..r) {
            val p = src[row + i.coerceIn(0, w - 1)]
            rSum += (p ushr 16) and 0xFF
            gSum += (p ushr 8) and 0xFF
            bSum += p and 0xFF
        }
        for (x in 0 until w) {
            dst[row + x] = (0xFF shl 24) or ((rSum / div) shl 16) or ((gSum / div) shl 8) or (bSum / div)
            val addX = min(w - 1, x + r + 1)
            val remX = max(0, x - r)
            val addP = src[row + addX]
            val remP = src[row + remX]
            rSum += ((addP ushr 16) and 0xFF) - ((remP ushr 16) and 0xFF)
            gSum += ((addP ushr 8) and 0xFF) - ((remP ushr 8) and 0xFF)
            bSum += (addP and 0xFF) - (remP and 0xFF)
        }
    }
}

private fun boxBlurVertical(src: IntArray, dst: IntArray, w: Int, h: Int, r: Int) {
    val div = r * 2 + 1
    for (x in 0 until w) {
        var rSum = 0
        var gSum = 0
        var bSum = 0
        for (i in -r..r) {
            val p = src[i.coerceIn(0, h - 1) * w + x]
            rSum += (p ushr 16) and 0xFF
            gSum += (p ushr 8) and 0xFF
            bSum += p and 0xFF
        }
        for (y in 0 until h) {
            dst[y * w + x] = (0xFF shl 24) or ((rSum / div) shl 16) or ((gSum / div) shl 8) or (bSum / div)
            val addY = min(h - 1, y + r + 1)
            val remY = max(0, y - r)
            val addP = src[addY * w + x]
            val remP = src[remY * w + x]
            rSum += ((addP ushr 16) and 0xFF) - ((remP ushr 16) and 0xFF)
            gSum += ((addP ushr 8) and 0xFF) - ((remP ushr 8) and 0xFF)
            bSum += (addP and 0xFF) - (remP and 0xFF)
        }
    }
}
