package com.music.bitchord.ui.components

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.widget.Toast
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.res.ResourcesCompat
import coil3.SingletonImageLoader
import coil3.toBitmap
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import com.music.bitchord.R
import com.music.bitchord.data.code.BitChordCodec
import com.music.bitchord.data.model.Song
import com.music.bitchord.ui.replay.cacheForSharing
import com.music.bitchord.ui.replay.saveToGallery
import com.music.bitchord.ui.replay.sendIntent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
        val barWidth = (availableWidth / (count * 1.8f)).coerceIn(3.5.dp.toPx(), 8.dp.toPx())
        val gap = (availableWidth - count * barWidth) / (count - 1).coerceAtLeast(1)

        val centerY = size.height / 2f
        val minH = size.height * 0.18f
        val maxH = size.height * 0.96f

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
 * - Background: Album artwork blurred (like fullscreen player / lyrics), with frosted/translucent glass
 * - Top: Album cover on left, Song title & artist name on right
 * - Bottom: BitChord logo on left (below album cover), with the soundwave code
 *   bars expanding across to the right (below the artist name).
 */
@Composable
fun BitChordCodeCard(
    song: Song,
    levels: List<Int>,
    modifier: Modifier = Modifier,
) {
    val glassActive = LocalLiquidGlassEnabled.current && isGlassSupported()

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
        // Song artwork cover as blurred background (matching fullscreen player and lyrics)
        if (!song.thumbnailUrl.isNullOrBlank()) {
            AsyncImage(
                model = song.thumbnailUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .matchParentSize()
                    .blur(36.dp),
            )
        }

        // Translucent glass overlay passing color like the 3-dot menu in glass mode
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    if (glassActive) {
                        Color(0xFF161922).copy(alpha = 0.52f)
                    } else {
                        Color(0xFF0E1118).copy(alpha = 0.82f)
                    },
                ),
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
        ) {
            // Top Section: Album Cover on left, Title & Artist on right
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Album cover thumbnail
                AsyncImage(
                    model = song.thumbnailUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(76.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.22f), RoundedCornerShape(12.dp)),
                )

                Spacer(Modifier.width(14.dp))

                // Song Title and Artist (no "BitChord Code" badge)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = song.title,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-0.2).sp,
                        ),
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = song.artist,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.76f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(Modifier.height(18.dp))

            // Bottom Section: BitChord logo on left, code bar expanded to the right
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // BitChord logo (centered directly below the album cover)
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

                // Soundwave code bars expanded across to the right (taller & clearer)
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

/**
 * Modal sheet presenting the BitChord Code card with Share, Save, and Copy Link actions.
 */
@Composable
fun BitChordCodeShareSheet(
    song: Song,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current

    val levels = remember(song.videoId) {
        runCatching {
            BitChordCodec.encode(BitChordCodec.MediaType.TRACK, song.videoId)
        }.getOrElse {
            // Fallback default levels if videoId is malformed
            listOf(0, 2, 4, 1, 5, 3, 6, 2, 4, 7)
        }
    }

    var isSharing by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }

    LaunchedEffect(copied) {
        if (copied) {
            kotlinx.coroutines.delay(2000L)
            copied = false
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.65f))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center,
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .clip(RoundedCornerShape(28.dp))
                    .clickable(enabled = false) {}
                    .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(28.dp)),
                color = Color(0xFF0F1219),
                shape = RoundedCornerShape(28.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp)
                        .navigationBarsPadding(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "BitChord Code",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                        )

                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.1f))
                                .clickable(onClick = onDismiss),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Rounded.Close,
                                contentDescription = "Close",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }

                    Spacer(Modifier.height(18.dp))

                    // The BitChord Code Card
                    BitChordCodeCard(
                        song = song,
                        levels = levels,
                    )

                    Spacer(Modifier.height(24.dp))

                    // Action buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        // Share Image Button
                        Button(
                            onClick = {
                                if (isSharing) return@Button
                                isSharing = true
                                scope.launch {
                                    val bitmap = renderBitChordCodeBitmap(context, song, levels)
                                    val uri = cacheForSharing(context, bitmap, "bitchord-code-${song.videoId}.png")
                                    isSharing = false
                                    if (uri != null) {
                                        val intent = sendIntent(uri)
                                        context.startActivity(Intent.createChooser(intent, "Share BitChord Code"))
                                    } else {
                                        Toast.makeText(context, "Could not create share image", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp),
                        ) {
                            if (isSharing) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                )
                            } else {
                                Icon(Icons.Rounded.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Share", fontWeight = FontWeight.SemiBold)
                            }
                        }

                        // Save to Gallery Button
                        OutlinedButton(
                            onClick = {
                                if (isSaving) return@OutlinedButton
                                isSaving = true
                                scope.launch {
                                    val bitmap = renderBitChordCodeBitmap(context, song, levels)
                                    val saved = saveToGallery(context, bitmap, song.title, "bitchord-code")
                                    isSaving = false
                                    Toast.makeText(
                                        context,
                                        if (saved) "Saved to Pictures" else "Failed to save",
                                        Toast.LENGTH_SHORT,
                                    ).show()
                                }
                            },
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.height(48.dp),
                        ) {
                            if (isSaving) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Rounded.Download, contentDescription = "Save", modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Save")
                            }
                        }

                        // Copy Link Button
                        OutlinedButton(
                            onClick = {
                                val url = "https://music.youtube.com/watch?v=${song.videoId}"
                                clipboard.setText(AnnotatedString(url))
                                copied = true
                                haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                            },
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.height(48.dp),
                        ) {
                            Icon(
                                if (copied) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                                contentDescription = "Copy Link",
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Renders a crisp high-resolution BitChord Code card bitmap for sharing and saving.
 */
suspend fun renderBitChordCodeBitmap(
    context: Context,
    song: Song,
    levels: List<Int>,
): Bitmap = withContext(Dispatchers.IO) {
    val width = 1200
    val height = 560
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val cardRect = RectF(0f, 0f, width.toFloat(), height.toFloat())
    val clipPath = android.graphics.Path().apply {
        addRoundRect(cardRect, 48f, 48f, android.graphics.Path.Direction.CW)
    }
    canvas.save()
    canvas.clipPath(clipPath)

    // Load artwork bitmap via Coil
    val artSize = 220f
    val artLeft = 60f
    val artTop = 60f
    var artBitmap: Bitmap? = null
    if (!song.thumbnailUrl.isNullOrBlank()) {
        try {
            val request = ImageRequest.Builder(context)
                .data(song.thumbnailUrl)
                .allowHardware(false)
                .build()
            val result = SingletonImageLoader.get(context).execute(request)
            if (result is SuccessResult) {
                artBitmap = result.image.toBitmap()
            }
        } catch (_: Exception) {}
    }

    // 1. Background: Album artwork stretched to cover the entire card (like fullscreen / lyrics)
    if (artBitmap != null) {
        val srcRect = android.graphics.Rect(0, 0, artBitmap.width, artBitmap.height)
        canvas.drawBitmap(artBitmap, srcRect, cardRect, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        // Scrim over background: dark translucent tint so text and soundwave bars stand out
        val scrimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xB80E121B.toInt()
        }
        canvas.drawRect(cardRect, scrimPaint)
    } else {
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF12151E.toInt()
        }
        canvas.drawRect(cardRect, bgPaint)
    }

    // 2. Border
    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = 0x38FFFFFF
    }
    canvas.drawRoundRect(cardRect, 48f, 48f, borderPaint)

    // 3. Draw artwork thumbnail on top-left
    val artRect = RectF(artLeft, artTop, artLeft + artSize, artTop + artSize)
    if (artBitmap != null) {
        val artPath = android.graphics.Path().apply {
            addRoundRect(artRect, 28f, 28f, android.graphics.Path.Direction.CW)
        }
        canvas.save()
        canvas.clipPath(artPath)
        canvas.drawBitmap(artBitmap, null, artRect, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        canvas.restore()
    } else {
        val placeholderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF242834.toInt() }
        canvas.drawRoundRect(artRect, 28f, 28f, placeholderPaint)
    }
    // Art thumbnail border
    val artBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f
        color = 0x44FFFFFF
    }
    canvas.drawRoundRect(artRect, 28f, 28f, artBorder)

    // 4. Text details (Title and Artist only, NO "BITCHORD CODE" label)
    val textLeft = artLeft + artSize + 40f
    val textMaxW = width - textLeft - 60f

    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textSize = 52f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    val artistPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xCCFFFFFF.toInt()
        textSize = 38f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
    }

    // Draw Title (truncated if too long)
    val titleText = android.text.TextUtils.ellipsize(
        song.title,
        android.text.TextPaint(titlePaint),
        textMaxW,
        android.text.TextUtils.TruncateAt.END,
    ).toString()
    canvas.drawText(titleText, textLeft, artTop + 85f, titlePaint)

    // Draw Artist
    val artistText = android.text.TextUtils.ellipsize(
        song.artist,
        android.text.TextPaint(artistPaint),
        textMaxW,
        android.text.TextUtils.TruncateAt.END,
    ).toString()
    canvas.drawText(artistText, textLeft, artTop + 155f, artistPaint)

    // 5. Bottom Section: Logo + Soundwave Code Bars
    val bottomY = height - 120f
    val logoDrawable = ResourcesCompat.getDrawable(context.resources, R.drawable.ic_logo, null)
    val logoH = 54f
    val logoW = if (logoDrawable != null && logoDrawable.intrinsicHeight > 0) {
        logoH * logoDrawable.intrinsicWidth / logoDrawable.intrinsicHeight
    } else {
        80f
    }
    val logoLeft = artLeft + (artSize - logoW) / 2f

    if (logoDrawable != null) {
        logoDrawable.setTint(0xFFFFFFFF.toInt())
        logoDrawable.setBounds(
            logoLeft.toInt(),
            (bottomY - logoH / 2f).toInt(),
            (logoLeft + logoW).toInt(),
            (bottomY + logoH / 2f).toInt(),
        )
        logoDrawable.draw(canvas)
    }

    // Draw Code Bars aligned directly with the text column
    val codeLeft = textLeft
    val codeRight = width - 60f
    val codeWidth = codeRight - codeLeft
    val count = levels.size

    if (count > 0) {
        val barWidth = (codeWidth / (count * 1.8f)).coerceIn(10f, 22f)
        val gap = (codeWidth - count * barWidth) / (count - 1).coerceAtLeast(1)
        val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt() }

        val minH = 26f
        val maxH = 135f

        for (i in levels.indices) {
            val level = levels[i].coerceIn(0, 7)
            val barH = minH + (level / 7f) * (maxH - minH)
            val bx = codeLeft + i * (barWidth + gap)
            val by = bottomY - barH / 2f
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
