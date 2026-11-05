package com.music.beatflow.ui.player

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.IosShare
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Photo
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.music.beatflow.R
import com.music.beatflow.ui.haptics.Haptic
import com.music.beatflow.ui.haptics.rememberHaptics
import com.music.beatflow.ui.replay.ShareAction
import com.music.beatflow.ui.replay.VIDEO_MIME
import com.music.beatflow.ui.replay.cacheForSharing
import com.music.beatflow.ui.replay.saveToGallery
import com.music.beatflow.ui.replay.saveVideoToGalleryUri
import com.music.beatflow.ui.replay.sendIntent
import com.music.beatflow.ui.replay.shareToStory
import dev.chrisbanes.haze.HazeState
import kotlinx.coroutines.launch

/**
 * The picked lines, drawn, with the things you can do with them.
 *
 * Built on [PlayerDrawer] rather than on a `ModalBottomSheet` for the same reason
 * as every other sheet in this package: it is inside the player, which is itself
 * already a modal sheet, and nesting the two leaves the inner one with nothing
 * to be modal over. It also means this drawer gets the player's own frosted
 * material, the drag-to-dismiss gesture and the scrim fade for free.
 *
 * The render happens on a background dispatcher and the preview is a plain
 * `Image` of the result — no second layout pass, no offscreen Compose, and the
 * identical pixels that the Save and Share buttons then write to disk.
 *
 * ## The video
 *
 * Photo is the card as it has always been. Video takes the same card through
 * the passage: from the first picked line to the last, the song's own sound
 * underneath, the line being sung lit while the rest sit back. The render is a
 * real encode — a few seconds, reported on the button — and is made once,
 * then saved or shared from the same file.
 */
@Composable
internal fun AndroidLyricsShareSheet(
    hazeState: HazeState,
    request: LyricsShareRequest,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()

    var video by remember(request) { mutableStateOf(false) }

    var image by remember(request) { mutableStateOf<Bitmap?>(null) }
    var failed by remember(request) { mutableStateOf(false) }
    var saved by remember(request) { mutableStateOf(false) }
    /** The clip, once rendered — Save and Share hand off the same file. */
    var clip by remember(request) { mutableStateOf<LyricsVideo?>(null) }
    /** The clip's row in the gallery, once written — Share reuses it. */
    var galleryUri by remember(request) { mutableStateOf<Uri?>(null) }
    var rendering by remember(request) { mutableStateOf(false) }
    /** A Save or Share hand-off is in flight — brief, but it disables both. */
    var working by remember(request) { mutableStateOf(false) }
    var progress by remember(request) { mutableIntStateOf(0) }

    // A pick without timing makes no clip to promise, so the choice isn't
    // offered: the panel would open a mode whose whole answer is an error.
    val videoPossible = remember(request) { spanOf(request.lines) != null }

    LaunchedEffect(request, video) {
        image = null
        failed = false
        saved = false
        image = runCatching { renderLyricsShareCard(context, request) }
            .onFailure { failed = true }
            .getOrNull()
    }

    // Pressing Video starts the render at once — the encode is the slow part,
    // and it can be running while the reader is still deciding between Save
    // and Share. Tapping Video again stands it down, back to the photo; the
    // half-written file is the renderer's own to sweep on the way out.
    LaunchedEffect(request, video) {
        if (!video || clip != null || rendering) return@LaunchedEffect
        rendering = true
        progress = 0
        galleryUri = null
        saved = false
        try {
            val made = runCatching {
                renderLyricsShareVideo(context, request) { progress = (it * 100).toInt() }
            }.getOrNull()
            clip = made
            // A render stood down says nothing — the reader cancelled it, it
            // did not fail. Only one that ran to an answer and came back empty
            // reports itself.
            if (made == null && video) failed = true
        } finally {
            rendering = false
        }
    }

    // Leaving the mode drops everything the clip was carrying: the reference
    // to its file, the gallery row it was saved under, the progress it showed.
    LaunchedEffect(request, video) {
        if (!video) {
            clip = null
            galleryUri = null
            progress = 0
        }
    }

    val photoLabel = stringResource(R.string.lyrics_share_photo)
    val videoLabel = stringResource(R.string.lyrics_share_video)
    val saveLabel = stringResource(R.string.save)
    val savedLabel = stringResource(R.string.saved_bang)
    val progressLabel = stringResource(R.string.lyrics_share_video_progress, progress)

    PlayerDrawer(
        hazeState = hazeState,
        title = stringResource(R.string.lyrics_share_title),
        onDismiss = onDismiss,
        modifier = modifier,
        titleGap = 2.dp,
    ) {
        // Everything the drawer holds is budgeted against its own height: the
        // description and the mode choice are measured, the buttons below are
        // measured, and the picture takes exactly what is left — so the Save
        // and Share this sheet exists for are never pushed past the fold.
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val density = LocalDensity.current
            val gapPx = with(density) { 12.dp.toPx() }
            var abovePx by remember { mutableIntStateOf(0) }
            var belowPx by remember { mutableIntStateOf(0) }
            // Read here, where the scope is direct — inside the column below,
            // the constraints would be an implicit receiver away.
            val drawerWidthPx = constraints.maxWidth
            val drawerHeightPx = constraints.maxHeight

            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onSizeChanged { abovePx = it.height },
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = stringResource(
                            if (video) R.string.lyrics_share_video_description else R.string.lyrics_share_description,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.7f),
                        textAlign = TextAlign.Start,
                        modifier = Modifier.fillMaxWidth().padding(start = 4.dp),
                    )

                    if (videoPossible) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            ModeAction(
                                label = photoLabel,
                                icon = Icons.Rounded.Photo,
                                selected = !video,
                                modifier = Modifier.weight(1f),
                                onClick = {
                                    haptics.play(Haptic.Tap)
                                    video = false
                                },
                            )
                            ModeAction(
                                label = videoLabel,
                                icon = Icons.Rounded.Movie,
                                selected = video,
                                modifier = Modifier.weight(1f),
                                onClick = {
                                    haptics.play(Haptic.Tap)
                                    // Tapped while it renders: the render is stood
                                    // down, back to the photo. Tapped again after
                                    // that: a fresh one starts.
                                    video = !(video && rendering)
                                },
                            )
                        }
                    }
                }

                val bitmap = image
                // The card is only as tall as its lines, so the frame follows
                // it: a strip comes out wide, a full verse narrow. What the
                // picture may take is what the drawer has left after the words
                // and the buttons — it shrinks before anything else would, and
                // the buttons stay on the sheet without a scroll.
                val ratio = bitmap?.let { it.width.toFloat() / it.height } ?: (9f / 16f)
                val maxWidthPx = drawerWidthPx.toFloat()
                val idealWidth = (0.72f * ratio).coerceIn(0.36f, 0.92f) * maxWidthPx
                val idealHeight = idealWidth / ratio
                val budgetPx = (drawerHeightPx - abovePx - belowPx - gapPx * 2)
                    .coerceAtLeast(with(density) { 120.dp.toPx() })
                    .toFloat()
                val previewHeight = minOf(idealHeight, budgetPx, maxWidthPx / ratio)
                val previewWidth = previewHeight * ratio
                val preview = Modifier
                    .width(with(density) { previewWidth.toDp() })
                    .height(with(density) { previewHeight.toDp() })
                    .clip(RoundedCornerShape(18.dp))
                if (bitmap == null) {
                    Box(
                        modifier = preview
                            .background(Color.White.copy(alpha = 0.06f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(26.dp),
                            strokeWidth = 2.5.dp,
                            color = Color.White.copy(alpha = 0.75f),
                        )
                    }
                } else {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = stringResource(R.string.your_lyrics_card),
                        modifier = preview,
                    )
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onSizeChanged { belowPx = it.height },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // The one-tap story: Instagram opens on the media itself
                    // rather than on a chooser, for the picture and the clip
                    // alike — the clip travels as its gallery row, the picture
                    // as the cache copy the share already writes.
                    ShareAction(
                        label = stringResource(R.string.lyrics_share_add_to_story),
                        icon = Icons.Rounded.AutoStories,
                        accent = false,
                        enabled = image != null && !rendering && !working,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            haptics.play(Haptic.Tap)
                            if (video) {
                                val made = clip ?: return@ShareAction
                                scope.launch {
                                    working = true
                                    try {
                                        if (!made.hasAudio) {
                                            PlayerPlatform.host.showMessage(
                                                context.getString(R.string.lyrics_share_video_silent),
                                            )
                                        }
                                        val uri = galleryUri ?: saveVideoToGalleryUri(
                                            context,
                                            made.file,
                                            request.song.title,
                                            CLIP_FILE_PREFIX,
                                        )
                                        galleryUri = uri
                                        if (uri == null) {
                                            failed = true
                                        } else {
                                            shareToStory(
                                                context,
                                                uri,
                                                VIDEO_MIME,
                                                context.getString(R.string.share_your_lyrics),
                                            )
                                        }
                                    } finally {
                                        working = false
                                    }
                                }
                            } else {
                                val drawn = image ?: return@ShareAction
                                scope.launch {
                                    val uri = cacheForSharing(context, drawn, LYRICS_FILE_NAME)
                                    if (uri == null) {
                                        failed = true
                                        saved = false
                                    } else {
                                        shareToStory(
                                            context,
                                            uri,
                                            chooserTitle = context.getString(R.string.share_your_lyrics),
                                        )
                                    }
                                }
                            }
                        },
                    )

                    if (failed) {
                        Text(
                            text = stringResource(
                                if (video) R.string.couldnt_render_video else R.string.couldnt_draw_picture,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        ShareAction(
                            // While the clip encodes this button *is* the progress:
                            // the percent, in place of Save, and nothing spinning
                            // beside it.
                            label = when {
                                rendering -> progressLabel
                                saved -> savedLabel
                                else -> saveLabel
                            },
                            icon = Icons.Rounded.Download,
                            accent = false,
                            enabled = image != null && !rendering && !working,
                            modifier = Modifier.weight(1f),
                            // Once the clip is in the gallery the button says so
                            // itself — a check and "Saved!" — so the line under
                            // the card does not have to.
                            saved = saved,
                            busy = rendering,
                            onClick = {
                                haptics.play(Haptic.Tap)
                                if (video) {
                                    val made = clip ?: return@ShareAction
                                    scope.launch {
                                        working = true
                                        try {
                                            if (!made.hasAudio) {
                                                PlayerPlatform.host.showMessage(
                                                    context.getString(R.string.lyrics_share_video_silent),
                                                )
                                            }
                                            val uri = galleryUri ?: saveVideoToGalleryUri(
                                                context,
                                                made.file,
                                                request.song.title,
                                                CLIP_FILE_PREFIX,
                                            )
                                            galleryUri = uri
                                            saved = uri != null
                                            if (uri == null) failed = true
                                        } finally {
                                            working = false
                                        }
                                    }
                                } else {
                                    val drawn = image ?: return@ShareAction
                                    scope.launch {
                                        saved = saveToGallery(
                                            context,
                                            drawn,
                                            request.song.title,
                                            LYRICS_FILE_PREFIX,
                                        )
                                    }
                                }
                            },
                        )
                        ShareAction(
                            label = stringResource(R.string.share),
                            icon = Icons.Rounded.IosShare,
                            accent = true,
                            enabled = image != null && !rendering && !working,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                haptics.play(Haptic.Tap)
                                if (video) {
                                    val made = clip ?: return@ShareAction
                                    scope.launch {
                                        working = true
                                        try {
                                            if (!made.hasAudio) {
                                                PlayerPlatform.host.showMessage(
                                                    context.getString(R.string.lyrics_share_video_silent),
                                                )
                                            }
                                            // The share hands on the gallery row rather
                                            // than the cache file: the popup previews
                                            // content it can pull a thumbnail for, and
                                            // that is a MediaStore row, not a cache file.
                                            val uri = galleryUri ?: saveVideoToGalleryUri(
                                                context,
                                                made.file,
                                                request.song.title,
                                                CLIP_FILE_PREFIX,
                                            )
                                            galleryUri = uri
                                            if (uri == null) {
                                                failed = true
                                            } else {
                                                context.startActivity(
                                                    Intent.createChooser(
                                                        sendIntent(uri, VIDEO_MIME),
                                                        context.getString(R.string.share_your_lyrics),
                                                    ),
                                                )
                                            }
                                        } finally {
                                            working = false
                                        }
                                    }
                                } else {
                                    val drawn = image ?: return@ShareAction
                                    scope.launch {
                                        val uri = cacheForSharing(context, drawn, LYRICS_FILE_NAME)
                                        if (uri == null) {
                                            failed = true
                                            saved = false
                                        } else {
                                            context.startActivity(
                                                Intent.createChooser(
                                                    sendIntent(uri),
                                                    context.getString(R.string.share_your_lyrics),
                                                ),
                                            )
                                        }
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

/**
 * One half of the Photo / Video choice: what Save and Share will make.
 *
 * Shaped like the bar's [com.music.beatflow.ui.player.LyricsPickBar] buttons
 * rather than the Replay's, because it sits in the player's own drawer over
 * white-alphas controls — the same palette the pick bar and the transport are
 * drawn in. The selected half is the solid one.
 */
@Composable
private fun RowScope.ModeAction(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = if (selected) 1f else 0.10f))
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (selected) Color(0xFF121212) else Color.White.copy(alpha = 0.85f),
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(9.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.W700,
            color = if (selected) Color(0xFF121212) else Color.White.copy(alpha = 0.85f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Names, deliberately not the Replay's.
 *
 * The cache names so a replay share and a lyrics share cannot overwrite each
 * other while the receiving app is still reading the first, and the gallery
 * prefix so a saved card in the pictures folder says which feature produced it.
 */
private const val LYRICS_FILE_NAME = "lyrics.png"
private const val LYRICS_FILE_PREFIX = "bitchord-lyrics"
/** Clips get the product's own name on them; the photo keeps the feature's. */
private const val CLIP_FILE_PREFIX = "beatflow"
