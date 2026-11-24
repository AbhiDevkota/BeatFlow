package com.music.bitchord.ui.components

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.FlashOff
import androidx.compose.material.icons.rounded.FlashOn
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.music.bitchord.R
import kotlin.math.cos
import kotlin.math.sin

/**
 * A floating dot particle inspired by Google Photos / Google Lens visual search.
 */
private data class ScanDot(
    val relX: Float,
    val relY: Float,
    val radiusDp: Float,
    val color: Color,
    val freqX: Float,
    val freqY: Float,
    val phaseX: Float,
    val phaseY: Float,
    val ampX: Float,
    val ampY: Float,
    val pulseFreq: Float,
    val pulsePhase: Float,
    val baseAlpha: Float,
)

/**
 * QR / barcode scanner modal view with a camera preview, a rectangular viewfinder,
 * Google Photos-style floating dots animation, flashlight toggle, and permission handling.
 */
@Composable
fun QrScannerSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    onCodeScanned: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA,
            ) == PackageManager.PERMISSION_GRANTED,
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    var camera by remember { mutableStateOf<Camera?>(null) }
    var isTorchOn by remember { mutableStateOf(false) }
    var scannedCode by remember { mutableStateOf<String?>(null) }
    var copiedFeedback by remember { mutableStateOf(false) }

    LaunchedEffect(isTorchOn, camera) {
        camera?.cameraControl?.enableTorch(isTorchOn)
    }

    LaunchedEffect(copiedFeedback) {
        if (copiedFeedback) {
            kotlinx.coroutines.delay(2000L)
            copiedFeedback = false
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        if (hasCameraPermission) {
            // Camera preview
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx).apply {
                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    val executor = ContextCompat.getMainExecutor(ctx)
                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }
                        val imageAnalysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                            .also { analysis ->
                                analysis.setAnalyzer(
                                    executor,
                                    QrCodeAnalyzer { text ->
                                        if (scannedCode == null) {
                                            scannedCode = text
                                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                            onCodeScanned(text)
                                        }
                                    },
                                )
                            }

                        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                        try {
                            cameraProvider.unbindAll()
                            camera = cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                cameraSelector,
                                preview,
                                imageAnalysis,
                            )
                        } catch (e: Exception) {
                            Log.e("QrScanner", "Failed to bind camera use cases", e)
                        }
                    }, executor)
                    previewView
                },
                modifier = Modifier.fillMaxSize(),
            )

            // Viewfinder with rectangular cutout & floating dots animation
            QrScannerViewfinder(
                modifier = Modifier.fillMaxSize(),
                isScanning = scannedCode == null,
            )
        } else {
            // Permission request fallback card
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Rounded.CameraAlt,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(40.dp),
                    )
                }
                Spacer(Modifier.height(24.dp))
                Text(
                    text = "Camera Access Needed",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "BitChord requires camera access to scan QR codes and share codes.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(28.dp))
                Button(
                    onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                    shape = RoundedCornerShape(24.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                    modifier = Modifier.height(48.dp),
                ) {
                    Text("Grant Permission", fontWeight = FontWeight.SemiBold)
                }
            }
        }

        // Top controls: Close button, title, torch toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // Close / back button in a frosted circular surface
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.45f))
                    .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
                    .clickable(onClick = onDismiss),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Rounded.Close,
                    contentDescription = stringResource(R.string.close),
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
            }

            // Title badge
            Text(
                text = stringResource(R.string.listen_together_scan_qr),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
            )

            // Flashlight toggle button
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(
                        if (isTorchOn) Color(0xFFFFD54F).copy(alpha = 0.35f)
                        else Color.Black.copy(alpha = 0.45f),
                    )
                    .border(
                        1.dp,
                        if (isTorchOn) Color(0xFFFFD54F).copy(alpha = 0.8f) else Color.White.copy(alpha = 0.2f),
                        CircleShape,
                    )
                    .clickable(enabled = hasCameraPermission) { isTorchOn = !isTorchOn },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (isTorchOn) Icons.Rounded.FlashOn else Icons.Rounded.FlashOff,
                    contentDescription = "Flashlight",
                    tint = if (isTorchOn) Color(0xFFFFD54F) else Color.White,
                    modifier = Modifier.size(22.dp),
                )
            }
        }

        // Bottom section: hint or result sheet
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = 24.dp),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = scannedCode == null && hasCameraPermission,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                // Frosted guidance pill
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color.Black.copy(alpha = 0.5f))
                        .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(20.dp))
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                ) {
                    Text(
                        text = "Align QR code within the frame",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.85f),
                    )
                }
            }

            // Scanned code result card
            AnimatedVisibility(
                visible = scannedCode != null,
                enter = slideInVertically(initialOffsetY = { it / 2 }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it / 2 }) + fadeOut(),
            ) {
                val code = scannedCode.orEmpty()
                val isUrl = code.startsWith("http://") || code.startsWith("https://")

                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = Color(0xFF1E222B).copy(alpha = 0.95f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(24.dp)),
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                Icons.Rounded.QrCodeScanner,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "Code Detected",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }

                        Spacer(Modifier.height(12.dp))

                        Text(
                            text = code,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                            color = Color.White,
                            textAlign = TextAlign.Center,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )

                        Spacer(Modifier.height(18.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (isUrl) {
                                Button(
                                    onClick = {
                                        try {
                                            context.startActivity(
                                                Intent(Intent.ACTION_VIEW, Uri.parse(code)),
                                            )
                                        } catch (e: Exception) {
                                            Log.e("QrScanner", "Failed to open link", e)
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(14.dp),
                                ) {
                                    Icon(
                                        Icons.AutoMirrored.Rounded.OpenInNew,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text("Open", maxLines = 1)
                                }
                            }

                            Button(
                                onClick = {
                                    clipboardManager.setText(AnnotatedString(code))
                                    copiedFeedback = true
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (isUrl) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary,
                                    contentColor = if (isUrl) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onPrimary,
                                ),
                            ) {
                                Icon(
                                    if (copiedFeedback) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(if (copiedFeedback) "Copied!" else "Copy", maxLines = 1)
                            }

                            OutlinedButton(
                                onClick = { scannedCode = null },
                                shape = RoundedCornerShape(14.dp),
                            ) {
                                Icon(
                                    Icons.Rounded.Refresh,
                                    contentDescription = "Scan Again",
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Viewfinder overlay with a centered rounded rectangle cutout and
 * Google Photos / Google Lens style organic floating dots.
 */
@Composable
private fun QrScannerViewfinder(
    modifier: Modifier = Modifier,
    isScanning: Boolean = true,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "scannerAnimation")

    // Continuous float time
    val floatTime by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 6000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "floatTime",
    )

    // Vertical scan beam progress
    val beamProgress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2600, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "beamProgress",
    )

    // Google Lens inspired color palette: vibrant cyan, mint, amber, coral, soft white
    val dots = remember {
        listOf(
            ScanDot(0.18f, 0.22f, 3.5f, Color(0xFF38B6FF), 1.2f, 0.9f, 0.2f, 0.5f, 14f, 10f, 1.4f, 0.1f, 0.75f),
            ScanDot(0.32f, 0.35f, 4.2f, Color(0xFF00E5FF), 0.8f, 1.3f, 1.1f, 0.8f, 18f, 12f, 1.1f, 0.6f, 0.85f),
            ScanDot(0.48f, 0.20f, 3.2f, Color(0xFFF8F9FA), 1.5f, 1.0f, 2.3f, 1.4f, 12f, 15f, 1.7f, 1.2f, 0.70f),
            ScanDot(0.65f, 0.28f, 4.0f, Color(0xFF00E676), 0.9f, 1.4f, 0.7f, 2.1f, 16f, 14f, 1.3f, 0.9f, 0.80f),
            ScanDot(0.82f, 0.24f, 3.6f, Color(0xFFFFD54F), 1.3f, 0.8f, 1.8f, 0.4f, 15f, 11f, 1.5f, 2.0f, 0.75f),
            ScanDot(0.25f, 0.52f, 4.5f, Color(0xFF80D8FF), 1.1f, 1.1f, 2.5f, 1.9f, 20f, 16f, 1.2f, 1.5f, 0.90f),
            ScanDot(0.42f, 0.48f, 3.8f, Color(0xFFFFFFFF), 1.4f, 1.2f, 0.4f, 1.7f, 14f, 13f, 1.6f, 0.4f, 0.80f),
            ScanDot(0.58f, 0.55f, 4.4f, Color(0xFF4285F4), 0.7f, 1.5f, 1.9f, 0.3f, 17f, 18f, 1.0f, 1.8f, 0.85f),
            ScanDot(0.75f, 0.50f, 3.4f, Color(0xFFFF5252), 1.6f, 0.9f, 2.9f, 2.4f, 13f, 12f, 1.8f, 0.7f, 0.70f),
            ScanDot(0.15f, 0.74f, 4.0f, Color(0xFF69F0AE), 1.0f, 1.3f, 1.3f, 1.0f, 16f, 15f, 1.3f, 2.2f, 0.80f),
            ScanDot(0.35f, 0.80f, 3.5f, Color(0xFF00B0FF), 1.2f, 0.8f, 0.6f, 2.8f, 15f, 10f, 1.4f, 1.1f, 0.75f),
            ScanDot(0.52f, 0.76f, 4.6f, Color(0xFFFFE082), 0.8f, 1.4f, 2.2f, 1.2f, 19f, 17f, 1.1f, 0.8f, 0.90f),
            ScanDot(0.70f, 0.82f, 3.8f, Color(0xFF26C6DA), 1.3f, 1.1f, 0.9f, 0.7f, 14f, 14f, 1.5f, 1.6f, 0.80f),
            ScanDot(0.85f, 0.72f, 3.2f, Color(0xFFFFFFFF), 1.5f, 1.2f, 3.1f, 1.8f, 12f, 13f, 1.7f, 0.3f, 0.70f),
            ScanDot(0.50f, 0.38f, 5.0f, Color(0xFF00E5FF), 0.6f, 0.9f, 1.5f, 2.0f, 22f, 16f, 0.9f, 1.0f, 0.95f),
            ScanDot(0.62f, 0.68f, 3.6f, Color(0xFFFF8A80), 1.4f, 1.0f, 2.0f, 0.9f, 13f, 12f, 1.4f, 2.5f, 0.75f),
        )
    }

    androidx.compose.foundation.Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height

        // Viewfinder rectangle size (proportional rectangular frame)
        val rectWidth = (width * 0.78f).coerceIn(260.dp.toPx(), 340.dp.toPx())
        val rectHeight = (rectWidth * 0.68f).coerceIn(180.dp.toPx(), 240.dp.toPx())
        val cornerRadiusPx = 22.dp.toPx()

        val centerX = width / 2f
        val centerY = height / 2f - 24.dp.toPx()

        val left = centerX - rectWidth / 2f
        val top = centerY - rectHeight / 2f
        val right = centerX + rectWidth / 2f
        val bottom = centerY + rectHeight / 2f

        // Cutout path of the scanning rectangle
        val rectPath = Path().apply {
            addRoundRect(
                RoundRect(
                    left = left,
                    top = top,
                    right = right,
                    bottom = bottom,
                    cornerRadius = CornerRadius(cornerRadiusPx, cornerRadiusPx),
                ),
            )
        }

        // 1. Darkened outer scrim with rounded rectangle cutout
        clipPath(rectPath, clipOp = ClipOp.Difference) {
            drawRect(color = Color(0xB8000000))
        }

        // 2. Subtle glass border outline around the rectangle
        drawRoundRect(
            color = Color.White.copy(alpha = 0.22f),
            topLeft = Offset(left, top),
            size = Size(rectWidth, rectHeight),
            cornerRadius = CornerRadius(cornerRadiusPx, cornerRadiusPx),
            style = Stroke(width = 1.2.dp.toPx()),
        )

        // 3. Four corner reticles / brackets (Google Lens style)
        val bracketLength = 26.dp.toPx()
        val bracketStroke = 3.5.dp.toPx()
        val cornerR = cornerRadiusPx
        val bracketColor = Color.White

        // Top-Left corner bracket
        val tlPath = Path().apply {
            moveTo(left, top + bracketLength)
            lineTo(left, top + cornerR)
            arcTo(
                rect = androidx.compose.ui.geometry.Rect(left, top, left + cornerR * 2, top + cornerR * 2),
                startAngleDegrees = 180f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false,
            )
            lineTo(left + bracketLength, top)
        }
        drawPath(tlPath, color = bracketColor, style = Stroke(width = bracketStroke, cap = StrokeCap.Round))

        // Top-Right corner bracket
        val trPath = Path().apply {
            moveTo(right - bracketLength, top)
            lineTo(right - cornerR, top)
            arcTo(
                rect = androidx.compose.ui.geometry.Rect(right - cornerR * 2, top, right, top + cornerR * 2),
                startAngleDegrees = 270f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false,
            )
            lineTo(right, top + bracketLength)
        }
        drawPath(trPath, color = bracketColor, style = Stroke(width = bracketStroke, cap = StrokeCap.Round))

        // Bottom-Right corner bracket
        val brPath = Path().apply {
            moveTo(right, bottom - bracketLength)
            lineTo(right, bottom - cornerR)
            arcTo(
                rect = androidx.compose.ui.geometry.Rect(right - cornerR * 2, bottom - cornerR * 2, right, bottom),
                startAngleDegrees = 0f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false,
            )
            lineTo(right - bracketLength, bottom)
        }
        drawPath(brPath, color = bracketColor, style = Stroke(width = bracketStroke, cap = StrokeCap.Round))

        // Bottom-Left corner bracket
        val blPath = Path().apply {
            moveTo(left + bracketLength, bottom)
            lineTo(left + cornerR, bottom)
            arcTo(
                rect = androidx.compose.ui.geometry.Rect(left, bottom - cornerR * 2, left + cornerR * 2, bottom),
                startAngleDegrees = 90f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false,
            )
            lineTo(left, bottom - bracketLength)
        }
        drawPath(blPath, color = bracketColor, style = Stroke(width = bracketStroke, cap = StrokeCap.Round))

        // Inside the rectangle: Google Photos / Google Lens floating dots & scanning beam
        clipPath(rectPath) {
            if (isScanning) {
                // Vertical scanning beam wave
                val beamY = top + (bottom - top) * beamProgress
                val beamHeight = 40.dp.toPx()
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color(0x2200E5FF),
                            Color(0x6600E5FF),
                            Color(0x2200E5FF),
                            Color.Transparent,
                        ),
                        startY = beamY - beamHeight / 2f,
                        endY = beamY + beamHeight / 2f,
                    ),
                    topLeft = Offset(left, beamY - beamHeight / 2f),
                    size = Size(rectWidth, beamHeight),
                )

                // Floating dots (Google Photos style)
                dots.forEach { dot ->
                    val driftX = sin(floatTime * 2f * Math.PI.toFloat() * dot.freqX + dot.phaseX) * dot.ampX
                    val driftY = cos(floatTime * 2f * Math.PI.toFloat() * dot.freqY + dot.phaseY) * dot.ampY

                    val dotX = left + dot.relX * rectWidth + driftX
                    val dotY = top + dot.relY * rectHeight + driftY

                    val pulse = sin(floatTime * 2f * Math.PI.toFloat() * dot.pulseFreq + dot.pulsePhase)
                    val alpha = (dot.baseAlpha + pulse * 0.22f).coerceIn(0.12f, 0.98f)
                    val radius = dot.radiusDp.dp.toPx() * (1f + 0.24f * pulse)

                    // Outer soft luminous halo
                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                dot.color.copy(alpha = alpha * 0.7f),
                                dot.color.copy(alpha = 0f),
                            ),
                            center = Offset(dotX, dotY),
                            radius = radius * 3.4f,
                        ),
                        radius = radius * 3.4f,
                        center = Offset(dotX, dotY),
                    )

                    // Solid bright inner core
                    drawCircle(
                        color = dot.color.copy(alpha = alpha),
                        radius = radius,
                        center = Offset(dotX, dotY),
                    )
                }
            }
        }
    }
}

/**
 * ZXing-based image analyzer for CameraX that decodes QR codes and common barcodes.
 */
private class QrCodeAnalyzer(
    private val onQrCodeScanned: (String) -> Unit,
) : ImageAnalysis.Analyzer {
    private val reader = MultiFormatReader().apply {
        setHints(
            mapOf(
                DecodeHintType.POSSIBLE_FORMATS to listOf(
                    BarcodeFormat.QR_CODE,
                    BarcodeFormat.DATA_MATRIX,
                    BarcodeFormat.AZTEC,
                    BarcodeFormat.CODE_128,
                ),
                DecodeHintType.TRY_HARDER to true,
            ),
        )
    }

    private var lastScannedTime = 0L

    override fun analyze(imageProxy: ImageProxy) {
        val currentTime = System.currentTimeMillis()
        // Throttle scans: don't analyze more than once every 180ms
        if (currentTime - lastScannedTime < 180L) {
            imageProxy.close()
            return
        }

        val plane = imageProxy.planes.getOrNull(0)
        if (plane == null) {
            imageProxy.close()
            return
        }

        val buffer = plane.buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)

        val width = imageProxy.width
        val height = imageProxy.height
        val rowStride = plane.rowStride
        val rotation = imageProxy.imageInfo.rotationDegrees

        val (rotatedBytes, rotWidth, rotHeight) = when (rotation) {
            90 -> Triple(rotateYuv90(bytes, width, height, rowStride), height, width)
            180 -> Triple(rotateYuv180(bytes, width, height, rowStride), width, height)
            270 -> Triple(rotateYuv270(bytes, width, height, rowStride), height, width)
            else -> Triple(bytes, width, height)
        }

        val stride = if (rotation == 90 || rotation == 270) rotWidth else rowStride
        val source = PlanarYUVLuminanceSource(
            rotatedBytes,
            stride,
            rotHeight,
            0,
            0,
            rotWidth,
            rotHeight,
            false,
        )
        val binaryBitmap = BinaryBitmap(HybridBinarizer(source))

        try {
            val result = reader.decodeWithState(binaryBitmap)
            if (!result.text.isNullOrBlank()) {
                lastScannedTime = currentTime
                onQrCodeScanned(result.text)
            }
        } catch (_: Exception) {
            // Normal when no barcode in current frame
        } finally {
            reader.reset()
            imageProxy.close()
        }
    }

    private fun rotateYuv90(data: ByteArray, width: Int, height: Int, rowStride: Int): ByteArray {
        val rotated = ByteArray(width * height)
        for (y in 0 until height) {
            val yOffset = y * rowStride
            for (x in 0 until width) {
                rotated[x * height + (height - y - 1)] = data[yOffset + x]
            }
        }
        return rotated
    }

    private fun rotateYuv180(data: ByteArray, width: Int, height: Int, rowStride: Int): ByteArray {
        val rotated = ByteArray(width * height)
        for (y in 0 until height) {
            val yOffset = y * rowStride
            val targetY = (height - y - 1) * width
            for (x in 0 until width) {
                rotated[targetY + (width - x - 1)] = data[yOffset + x]
            }
        }
        return rotated
    }

    private fun rotateYuv270(data: ByteArray, width: Int, height: Int, rowStride: Int): ByteArray {
        val rotated = ByteArray(width * height)
        for (y in 0 until height) {
            val yOffset = y * rowStride
            for (x in 0 until width) {
                rotated[(width - x - 1) * height + y] = data[yOffset + x]
            }
        }
        return rotated
    }
}
