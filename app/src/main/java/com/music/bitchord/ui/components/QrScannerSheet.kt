package com.music.bitchord.ui.components

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.util.Log
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
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
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Refresh
import com.music.bitchord.data.code.BitChordBarDetector
import com.music.bitchord.playback.MusicLink
import com.music.bitchord.playback.LinkRequest
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
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
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.GlobalHistogramBinarizer
import com.google.zxing.common.HybridBinarizer
import com.music.bitchord.R

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
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

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
        keyboard?.hide()
        focusManager.clearFocus(force = true)
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    var camera by remember { mutableStateOf<Camera?>(null) }
    var cameraProviderRef by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val mainExecutor = remember(context) { ContextCompat.getMainExecutor(context) }
    val scope = rememberCoroutineScope()
    var isTorchOn by remember { mutableStateOf(false) }
    var scannedCode by remember { mutableStateOf<String?>(null) }
    var copiedFeedback by remember { mutableStateOf(false) }
    var isScanningGallery by remember { mutableStateOf(false) }

    val handleScannedResult: (String) -> Unit = { text ->
        if (scannedCode == null) {
            scannedCode = text
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            val request = MusicLink.parseCode(text)
            if (request != null) {
                MusicLink.submit(request)
                onCodeScanned(text)
                onDismiss()
            } else {
                onCodeScanned(text)
            }
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null && !isScanningGallery) {
            isScanningGallery = true
            scope.launch {
                val decoded = decodeCodeFromImageUri(context, uri)
                isScanningGallery = false
                if (!decoded.isNullOrBlank()) {
                    handleScannedResult(decoded)
                } else {
                    Toast.makeText(
                        context,
                        "No BitChord or QR code found in image",
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        onDispose {
            cameraExecutor.shutdown()
            try {
                cameraProviderRef?.unbindAll()
            } catch (e: Exception) {
                Log.e("QrScanner", "Failed to unbind camera on dispose", e)
            }
        }
    }

    LaunchedEffect(isTorchOn, camera) {
        camera?.cameraControl?.enableTorch(isTorchOn)
    }

    LaunchedEffect(copiedFeedback) {
        if (copiedFeedback) {
            kotlinx.coroutines.delay(2000L)
            copiedFeedback = false
        }
    }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        val rectWidthDp = (maxWidth * 0.88f).coerceIn(300.dp, 420.dp)
        val rectHeightDp = (rectWidthDp * 0.60f).coerceIn(200.dp, 270.dp)
        val viewfinderBottomDp = (maxHeight / 2f) - 28.dp + (rectHeightDp / 2f)
        if (hasCameraPermission) {
            // Camera preview
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx).apply {
                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    cameraProviderFuture.addListener({
                        try {
                            val cameraProvider = cameraProviderFuture.get()
                            cameraProviderRef = cameraProvider
                            val preview = Preview.Builder().build().also {
                                it.surfaceProvider = previewView.surfaceProvider
                            }
                            val imageAnalysis = ImageAnalysis.Builder()
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .setTargetResolution(android.util.Size(1280, 720))
                                .build()
                                .also { analysis ->
                                    analysis.setAnalyzer(
                                        cameraExecutor,
                                        QrCodeAnalyzer { text ->
                                            mainExecutor.execute {
                                                handleScannedResult(text)
                                            }
                                        },
                                    )
                                }

                            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                            cameraProvider.unbindAll()
                            val boundCamera = cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                cameraSelector,
                                preview,
                                imageAnalysis,
                            )
                            camera = boundCamera

                            // Tap to focus on preview, auto-cancelling after 2s so continuous AF resumes
                            previewView.setOnTouchListener { view, event ->
                                if (event.action == android.view.MotionEvent.ACTION_UP) {
                                    val factory = previewView.meteringPointFactory
                                    val point = factory.createPoint(event.x, event.y)
                                    val action = androidx.camera.core.FocusMeteringAction.Builder(point)
                                        .setAutoCancelDuration(2, java.util.concurrent.TimeUnit.SECONDS)
                                        .build()
                                    boundCamera.cameraControl.startFocusAndMetering(action)
                                    view.performClick()
                                }
                                true
                            }
                        } catch (e: Exception) {
                            Log.e("QrScanner", "Failed to bind camera use cases", e)
                        }
                    }, mainExecutor)
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

        // Guidance hint & gallery scan option positioned directly below the scanning rectangle
        AnimatedVisibility(
            visible = scannedCode == null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(if (hasCameraPermission) Alignment.TopCenter else Alignment.BottomCenter)
                .fillMaxWidth()
                .then(
                    if (hasCameraPermission) {
                        Modifier.padding(top = viewfinderBottomDp + 22.dp)
                    } else {
                        Modifier.navigationBarsPadding().padding(bottom = 36.dp)
                    },
                ),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (hasCameraPermission) {
                    Text(
                        text = "Align code within the frame",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.82f),
                    )
                }

                // Scan Code From Your Gallery pill button
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color.Black.copy(alpha = 0.58f))
                        .border(1.dp, Color.White.copy(alpha = 0.24f), RoundedCornerShape(24.dp))
                        .clickable(enabled = !isScanningGallery) {
                            galleryLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isScanningGallery) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Color.White,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Rounded.PhotoLibrary,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = if (isScanningGallery) "Scanning image…" else "Scan Code From Your Gallery",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                    )
                }
            }
        }

        // Bottom section: scanned code result sheet
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = 24.dp),
            contentAlignment = Alignment.Center,
        ) {

            // Scanned code result card
            AnimatedVisibility(
                visible = scannedCode != null,
                enter = slideInVertically(initialOffsetY = { it / 2 }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it / 2 }) + fadeOut(),
            ) {
                val code = scannedCode.orEmpty()
                val musicRequest = remember(code) { MusicLink.parseCode(code) }
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
                            if (musicRequest != null) {
                                Button(
                                    onClick = {
                                        MusicLink.submit(musicRequest)
                                        onDismiss()
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(14.dp),
                                ) {
                                    Icon(
                                        if (musicRequest is LinkRequest.Track) Icons.Rounded.PlayArrow else Icons.AutoMirrored.Rounded.OpenInNew,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (musicRequest is LinkRequest.Track) "Play Track" else "Open in BitChord", maxLines = 1)
                                }
                            } else if (isUrl) {
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
 * a sleek modern scanning beam animation.
 */
@Composable
private fun QrScannerViewfinder(
    modifier: Modifier = Modifier,
    isScanning: Boolean = true,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "scannerAnimation")

    // Vertical scan beam progress
    val beamProgress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "beamProgress",
    )

    androidx.compose.foundation.Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height

        // Larger rectangular scanning frame with a wide aspect ratio
        val rectWidth = (width * 0.88f).coerceIn(300.dp.toPx(), 420.dp.toPx())
        val rectHeight = (rectWidth * 0.60f).coerceIn(200.dp.toPx(), 270.dp.toPx())
        val cornerRadiusPx = 24.dp.toPx()

        val centerX = width / 2f
        val centerY = height / 2f - 28.dp.toPx()

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

        // 3. Four corner reticles / brackets
        val bracketLength = 32.dp.toPx()
        val bracketStroke = 4.dp.toPx()
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

        // Inside the rectangle: Sleek scanning laser beam moving left to right and right to left
        clipPath(rectPath) {
            if (isScanning) {
                val beamX = left + (right - left) * beamProgress
                val beamWidth = 48.dp.toPx()

                // Soft glowing aura moving horizontally
                drawRect(
                    brush = Brush.horizontalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color(0x1500E5FF),
                            Color(0x4000E5FF),
                            Color(0x1500E5FF),
                            Color.Transparent,
                        ),
                        startX = beamX - beamWidth / 2f,
                        endX = beamX + beamWidth / 2f,
                    ),
                    topLeft = Offset(beamX - beamWidth / 2f, top),
                    size = Size(beamWidth, rectHeight),
                )

                // Vertical laser beam line moving left to right and right to left
                drawLine(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color(0xFF00E5FF).copy(alpha = 0.85f),
                            Color.White,
                            Color(0xFF00E5FF).copy(alpha = 0.85f),
                            Color.Transparent,
                        ),
                        startY = top,
                        endY = bottom,
                    ),
                    start = Offset(beamX, top + 8.dp.toPx()),
                    end = Offset(beamX, bottom - 8.dp.toPx()),
                    strokeWidth = 2.5.dp.toPx(),
                    cap = StrokeCap.Round,
                )
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
    private val isAnalyzing = AtomicBoolean(false)
    private val reader = MultiFormatReader().apply {
        setHints(
            mapOf(
                DecodeHintType.POSSIBLE_FORMATS to listOf(
                    BarcodeFormat.QR_CODE,
                ),
                DecodeHintType.TRY_HARDER to true,
            ),
        )
    }

    private var lastScannedTime = 0L
    private var rotatedBuffer: ByteArray? = null
    private var packedBuffer: ByteArray? = null

    override fun analyze(imageProxy: ImageProxy) {
        if (!isAnalyzing.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }

        try {
            val currentTime = System.currentTimeMillis()
            // Cap analysis rate at ~12 fps to keep CPU cool and preview smooth
            if (currentTime - lastScannedTime < 80L) {
                return
            }
            lastScannedTime = currentTime

            val plane = imageProxy.planes.getOrNull(0) ?: return
            val buffer = plane.buffer
            val remaining = buffer.remaining()
            val width = imageProxy.width
            val height = imageProxy.height
            val rowStride = plane.rowStride
            val rotation = imageProxy.imageInfo.rotationDegrees

            val targetSize = width * height
            val currentRotated = rotatedBuffer?.takeIf { it.size == targetSize }
                ?: ByteArray(targetSize).also { rotatedBuffer = it }

            val bytes = if (rowStride == width && remaining == targetSize) {
                val arr = packedBuffer?.takeIf { it.size == targetSize }
                    ?: ByteArray(targetSize).also { packedBuffer = it }
                buffer.get(arr)
                arr
            } else {
                val raw = ByteArray(remaining)
                buffer.get(raw)
                raw
            }

            val (rotBytes, rotWidth, rotHeight) = when (rotation) {
                90 -> {
                    rotateYuv90Into(bytes, width, height, rowStride, currentRotated)
                    Triple(currentRotated, height, width)
                }
                180 -> {
                    rotateYuv180Into(bytes, width, height, rowStride, currentRotated)
                    Triple(currentRotated, width, height)
                }
                270 -> {
                    rotateYuv270Into(bytes, width, height, rowStride, currentRotated)
                    Triple(currentRotated, height, width)
                }
                else -> {
                    if (rowStride == width) {
                        Triple(bytes, width, height)
                    } else {
                        val packed = packedBuffer?.takeIf { it.size == targetSize }
                            ?: ByteArray(targetSize).also { packedBuffer = it }
                        for (y in 0 until height) {
                            System.arraycopy(bytes, y * rowStride, packed, y * width, width)
                        }
                        Triple(packed, width, height)
                    }
                }
            }

            // 1. First, attempt to detect and decode BitChord visual soundwave code
            try {
                val bitChordPayload = BitChordBarDetector.detect(rotBytes, rotWidth, rotHeight)
                if (bitChordPayload != null) {
                    lastScannedTime = currentTime
                    onQrCodeScanned(bitChordPayload.canonicalUri)
                    return
                }
            } catch (_: Exception) {}

            val stride = if (rotation == 90 || rotation == 270) rotWidth else rowStride
            val source = PlanarYUVLuminanceSource(
                rotBytes,
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
            }
        } finally {
            imageProxy.close()
            isAnalyzing.set(false)
        }
    }

    private fun rotateYuv90Into(data: ByteArray, width: Int, height: Int, rowStride: Int, out: ByteArray) {
        for (y in 0 until height) {
            val yOffset = y * rowStride
            for (x in 0 until width) {
                out[x * height + (height - y - 1)] = data[yOffset + x]
            }
        }
    }

    private fun rotateYuv180Into(data: ByteArray, width: Int, height: Int, rowStride: Int, out: ByteArray) {
        for (y in 0 until height) {
            val yOffset = y * rowStride
            val targetY = (height - y - 1) * width
            for (x in 0 until width) {
                out[targetY + (width - x - 1)] = data[yOffset + x]
            }
        }
    }

    private fun rotateYuv270Into(data: ByteArray, width: Int, height: Int, rowStride: Int, out: ByteArray) {
        for (y in 0 until height) {
            val yOffset = y * rowStride
            for (x in 0 until width) {
                out[(width - x - 1) * height + y] = data[yOffset + x]
            }
        }
    }
}

/**
 * Loads a gallery image from [uri], scales it safely, and runs both [BitChordBarDetector]
 * (in full-frame mode, upright and 90-degree rotated) and ZXing QR decoding.
 */
private suspend fun decodeCodeFromImageUri(
    context: Context,
    uri: Uri,
): String? = withContext(Dispatchers.Default) {
    val rawBitmap = loadScaledBitmapForScan(context, uri, maxMinSide = 1440) ?: run {
        Log.w("QrScanner", "Failed to decode bitmap from gallery URI: $uri")
        return@withContext null
    }
    try {
        val w = rawBitmap.width
        val h = rawBitmap.height
        val pixels = IntArray(w * h)
        rawBitmap.getPixels(pixels, 0, w, 0, 0, w, h)

        // Compute luminance bytes, compositing transparent rounded corners over dark #0F1219
        val lum = ByteArray(w * h)
        for (i in pixels.indices) {
            val c = pixels[i]
            val a = (c ushr 24) and 0xFF
            var r = (c ushr 16) and 0xFF
            var g = (c ushr 8) and 0xFF
            var b = c and 0xFF
            if (a < 255) {
                val invA = 255 - a
                r = (r * a + 15 * invA) / 255
                g = (g * a + 18 * invA) / 255
                b = (b * a + 25 * invA) / 255
                pixels[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
            lum[i] = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).coerceIn(0, 255).toByte()
        }

        // 1. Try BitChord visual soundwave code (bright bars on dark background)
        runCatching { BitChordBarDetector.detect(lum, w, h, fullFrame = true) }
            .getOrNull()?.let { return@withContext it.canonicalUri }

        // Retry rotated 90 degrees (sideways photo/card)
        val rot90 = ByteArray(w * h)
        for (y in 0 until h) {
            val rowOff = y * w
            for (x in 0 until w) {
                rot90[x * h + (h - y - 1)] = lum[rowOff + x]
            }
        }
        runCatching { BitChordBarDetector.detect(rot90, h, w, fullFrame = true) }
            .getOrNull()?.let { return@withContext it.canonicalUri }

        // Retry inverted polarity (dark bars on light/white background)
        val invLum = ByteArray(lum.size) { i -> (255 - (lum[i].toInt() and 0xFF)).toByte() }
        runCatching { BitChordBarDetector.detect(invLum, w, h, fullFrame = true) }
            .getOrNull()?.let { return@withContext it.canonicalUri }

        // 2. Fallback to ZXing QR decoding
        val reader = MultiFormatReader().apply {
            setHints(
                mapOf(
                    DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                    DecodeHintType.TRY_HARDER to true,
                ),
            )
        }
        val source = RGBLuminanceSource(w, h, pixels)
        runCatching { reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))) }
            .getOrNull()?.text?.takeIf { it.isNotBlank() }?.let { return@withContext it }

        reader.reset()
        runCatching { reader.decodeWithState(BinaryBitmap(GlobalHistogramBinarizer(source))) }
            .getOrNull()?.text?.takeIf { it.isNotBlank() }?.let { return@withContext it }

        Log.d("QrScanner", "No code detected in gallery image (${w}x${h})")
        null
    } finally {
        rawBitmap.recycle()
    }
}

private fun loadScaledBitmapForScan(context: Context, uri: Uri, maxMinSide: Int): Bitmap? {
    val resolver = context.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        runCatching {
            val source = ImageDecoder.createSource(resolver, uri)
            return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                val w = info.size.width
                val h = info.size.height
                val minSide = minOf(w, h)
                val maxSide = maxOf(w, h)
                // Only downscale huge camera photos; keep screenshots (1080x2400) & cards (1200x653) full-res
                val factor = maxOf(
                    if (minSide > maxMinSide) minSide.toFloat() / maxMinSide else 1f,
                    if (maxSide > 2600) maxSide.toFloat() / 2600f else 1f,
                )
                if (factor > 1.05f) {
                    decoder.setTargetSize(
                        (w / factor).toInt().coerceAtLeast(1),
                        (h / factor).toInt().coerceAtLeast(1),
                    )
                }
            }
        }.onFailure {
            Log.w("QrScanner", "ImageDecoder failed, falling back to BitmapFactory", it)
        }
    }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
    val srcW = bounds.outWidth
    val srcH = bounds.outHeight
    if (srcW <= 0 || srcH <= 0) return null

    var sampleSize = 1
    while (minOf(srcW / sampleSize, srcH / sampleSize) > maxMinSide * 2) {
        sampleSize *= 2
    }

    val decodeOpts = BitmapFactory.Options().apply {
        inSampleSize = sampleSize
        inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val decoded = resolver.openInputStream(uri)?.use {
        BitmapFactory.decodeStream(it, null, decodeOpts)
    } ?: return null

    val minSide = minOf(decoded.width, decoded.height)
    val maxSide = maxOf(decoded.width, decoded.height)
    val factor = maxOf(
        if (minSide > maxMinSide) minSide.toFloat() / maxMinSide else 1f,
        if (maxSide > 2600) maxSide.toFloat() / 2600f else 1f,
    )
    if (factor <= 1.05f) return decoded

    val dstW = (decoded.width / factor).toInt().coerceAtLeast(1)
    val dstH = (decoded.height / factor).toInt().coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(decoded, dstW, dstH, true)
    if (scaled !== decoded) decoded.recycle()
    return scaled
}
