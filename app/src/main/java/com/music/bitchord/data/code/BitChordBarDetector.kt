package com.music.bitchord.data.code

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Bounding box of a candidate vertical bar in the camera frame.
 */
data class BarBox(
    var x: Int,
    var y: Int,
    var w: Int,
    var h: Int,
    var area: Int,
) {
    val centerX: Float get() = x + w / 2f
    val centerY: Float get() = y + h / 2f
    val right: Int get() = x + w
    val bottom: Int get() = y + h
}

/**
 * High-performance real-time detector for BitChord visual soundwave codes from camera frames.
 *
 * Uses a multi-stage pipeline for high real-world consistency across varied lighting,
 * colorful/gradient artwork backgrounds, camera tilt, and perspective:
 * 1. Local adaptive thresholding via a 2D Integral Image (+ global Otsu fallback), isolating white bars
 *    cleanly even when card background brightness varies across the image.
 * 2. Fragment merging + tilt-tolerant chain linking + arithmetic grid reconstruction to recover
 *    exact 30-bar centers even if individual bars are small, merged, or slightly skewed.
 * 3. Sub-pixel FWHM (Full Width at Half Maximum) vertical height profiling from raw luminance,
 *    making level quantization invariant to optical blur and uneven lighting.
 * 4. Band-averaged multi-row scanline fallback when component segmentation struggles.
 */
object BitChordBarDetector {

    fun detect(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        if (width < 100 || height < 100 || yuvBytes.size < width * height) return null

        // Pass 1: Integral-image adaptive connected components + grid FWHM resampling
        detectByComponents(yuvBytes, width, height)?.let { return it }

        // Pass 2: Band-averaged scanline peak profiling + grid FWHM resampling
        detectByScanlines(yuvBytes, width, height)?.let { return it }

        return null
    }

    /**
     * Pass 1: Isolates vertical bars using local adaptive thresholding (via 2D integral image)
     * plus an Otsu pass, then fits a 30-bar line/grid and decodes heights.
     */
    private fun detectByComponents(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        val roiX = (width * 0.03f).toInt()
        val roiY = (height * 0.14f).toInt()
        val roiW = (width * 0.94f).toInt().coerceAtMost(width - roiX)
        val roiH = (height * 0.72f).toInt().coerceAtMost(height - roiY)
        val total = roiW * roiH
        if (total <= 0) return null

        // Build 2D Integral Image over the ROI for O(1) local mean computation
        val stride = roiW + 1
        val integral = IntArray(stride * (roiH + 1))
        for (y in 0 until roiH) {
            val rowOffset = (roiY + y) * width + roiX
            val intRow = (y + 1) * stride
            val prevIntRow = y * stride
            var rowSum = 0
            for (x in 0 until roiW) {
                rowSum += yuvBytes[rowOffset + x].toInt() and 0xFF
                integral[intRow + x + 1] = integral[prevIntRow + x + 1] + rowSum
            }
        }

        val otsu = computeOtsuThreshold(yuvBytes, roiX, roiY, roiW, roiH, width)
        val halfW = max(14, roiW / 24)
        val halfH = max(14, roiH / 24)

        val binary = BooleanArray(total)
        val visited = BooleanArray(total)
        val maxQueue = 8192
        val queueX = IntArray(maxQueue)
        val queueY = IntArray(maxQueue)

        // Modes: >= 0 = global threshold value; < 0 = local adaptive delta (abs value)
        val modes = intArrayOf(-14, -26, otsu, (otsu - 18).coerceAtLeast(35))

        for (mode in modes) {
            if (mode < 0) {
                val delta = -mode
                for (y in 0 until roiH) {
                    val y1 = max(0, y - halfH)
                    val y2 = min(roiH - 1, y + halfH)
                    val y1Off = y1 * stride
                    val y2Off = (y2 + 1) * stride
                    val rowOffset = (roiY + y) * width + roiX
                    val binRow = y * roiW
                    for (x in 0 until roiW) {
                        val x1 = max(0, x - halfW)
                        val x2 = min(roiW - 1, x + halfW) + 1
                        val area = (x2 - x1) * (y2 - y1 + 1)
                        val sum = integral[y2Off + x2] - integral[y1Off + x2] - integral[y2Off + x1] + integral[y1Off + x1]
                        val localMean = sum / area
                        val v = yuvBytes[rowOffset + x].toInt() and 0xFF
                        binary[binRow + x] = v >= localMean + delta
                    }
                }
            } else {
                for (y in 0 until roiH) {
                    val rowOffset = (roiY + y) * width + roiX
                    val binRow = y * roiW
                    for (x in 0 until roiW) {
                        val v = yuvBytes[rowOffset + x].toInt() and 0xFF
                        binary[binRow + x] = v >= mode
                    }
                }
            }

            visited.fill(false)
            val candidates = ArrayList<BarBox>()

            for (y in 0 until roiH) {
                val binRow = y * roiW
                for (x in 0 until roiW) {
                    val idx = binRow + x
                    if (!binary[idx] || visited[idx]) continue

                    var minX = x
                    var maxX = x
                    var minY = y
                    var maxY = y
                    var area = 0

                    var head = 0
                    var tail = 0
                    queueX[tail] = x
                    queueY[tail] = y
                    tail++
                    visited[idx] = true

                    while (head < tail) {
                        val qx = queueX[head]
                        val qy = queueY[head]
                        head++
                        area++

                        if (qx < minX) minX = qx
                        if (qx > maxX) maxX = qx
                        if (qy < minY) minY = qy
                        if (qy > maxY) maxY = qy

                        if (tail < maxQueue - 4) {
                            if (qx + 1 < roiW) {
                                val n = qy * roiW + (qx + 1)
                                if (binary[n] && !visited[n]) {
                                    visited[n] = true
                                    queueX[tail] = qx + 1; queueY[tail] = qy; tail++
                                }
                            }
                            if (qx - 1 >= 0) {
                                val n = qy * roiW + (qx - 1)
                                if (binary[n] && !visited[n]) {
                                    visited[n] = true
                                    queueX[tail] = qx - 1; queueY[tail] = qy; tail++
                                }
                            }
                            if (qy + 1 < roiH) {
                                val n = (qy + 1) * roiW + qx
                                if (binary[n] && !visited[n]) {
                                    visited[n] = true
                                    queueX[tail] = qx; queueY[tail] = qy + 1; tail++
                                }
                            }
                            if (qy - 1 >= 0) {
                                val n = (qy - 1) * roiW + qx
                                if (binary[n] && !visited[n]) {
                                    visited[n] = true
                                    queueX[tail] = qx; queueY[tail] = qy - 1; tail++
                                }
                            }
                        }
                    }

                    val bw = maxX - minX + 1
                    val bh = maxY - minY + 1

                    // Relaxed filter so small level-0 bars at longer distances still pass
                    if (bh >= 4 && bw in 2..(roiW * 0.055f).toInt().coerceAtLeast(12) && (bh.toFloat() / max(bw, 1)) >= 0.70f && area >= 8) {
                        candidates.add(BarBox(roiX + minX, roiY + minY, bw, bh, area))
                    }
                }
            }

            if (candidates.size < 18) continue
            candidates.sortBy { it.x }

            // Merge only vertically split fragments of the same bar (substantial horizontal overlap)
            val merged = ArrayList<BarBox>(candidates.size)
            for (bar in candidates) {
                var wasMerged = false
                for (mIdx in (merged.size - 1) downTo max(0, merged.size - 4)) {
                    val prev = merged[mIdx]
                    val horizOverlap = min(prev.right, bar.right) - max(prev.x, bar.x)
                    val vertGap = max(bar.y - prev.bottom, prev.y - bar.bottom)
                    if (horizOverlap >= min(prev.w, bar.w) * 0.4f && vertGap <= max(prev.h, bar.h) * 0.5f) {
                        val nx = min(prev.x, bar.x)
                        val ny = min(prev.y, bar.y)
                        val nr = max(prev.right, bar.right)
                        val nb = max(prev.bottom, bar.bottom)
                        prev.x = nx
                        prev.y = ny
                        prev.w = nr - nx
                        prev.h = nb - ny
                        prev.area += bar.area
                        wasMerged = true
                        break
                    }
                }
                if (!wasMerged) {
                    merged.add(bar)
                }
            }

            if (merged.size < 18) continue

            // Find aligned sequences along a straight (possibly tilted) line
            val chains = findAlignedComponentChains(merged)
            for (chain in chains) {
                // Fast path: exact 30-bar chain with uniform pitch using bounding-box heights
                if (chain.size == 30 && isUniformGrid(chain)) {
                    val directHeights = FloatArray(30) { chain[it].h.toFloat() }
                    tryDecodeHeights(directHeights)?.let { return it }

                    val centersX = FloatArray(30) { chain[it].centerX }
                    val centersY = FloatArray(30) { chain[it].centerY }
                    val maxHalf = (chain.maxOf { it.h } * 0.75f).coerceIn(20f, height * 0.25f)
                    decodeWithFwhm(yuvBytes, width, height, centersX, centersY, maxHalf)?.let { return it }
                }

                // General path: reconstruct exact 30-bar grid (recovers missing bars, trims extra noise)
                reconstructAndDecodeGrid(yuvBytes, width, height, chain)?.let { return it }
            }
        }

        return null
    }

    private fun isUniformGrid(chain: List<BarBox>): Boolean {
        if (chain.size < 2) return false
        val span = chain.last().centerX - chain.first().centerX
        val pitch = span / (chain.size - 1)
        if (pitch < 3f || pitch > 55f) return false
        var maxDev = 0f
        for (k in chain.indices) {
            val expectedX = chain.first().centerX + k * pitch
            val dev = abs(chain[k].centerX - expectedX)
            if (dev > maxDev) maxDev = dev
        }
        return maxDev <= pitch * 0.45f
    }

    /**
     * Links horizontally progressing bars along a smooth linear baseline (supports camera tilt).
     */
    private fun findAlignedComponentChains(bars: List<BarBox>): List<List<BarBox>> {
        val result = ArrayList<List<BarBox>>()
        val used = BooleanArray(bars.size)

        for (i in bars.indices) {
            if (used[i]) continue
            val chain = ArrayList<BarBox>(32)
            val indices = ArrayList<Int>(32)
            chain.add(bars[i])
            indices.add(i)

            var current = bars[i]
            var avgPitch = -1f
            var slopeY = 0f

            for (j in (i + 1) until bars.size) {
                val next = bars[j]
                val dx = next.centerX - current.centerX
                if (dx <= 2.5f) continue

                val maxJump = if (avgPitch > 0f) avgPitch * 3.4f else (max(current.w, next.w) * 6f + 40f)
                if (dx > maxJump) {
                    if (chain.size >= 18) break else continue
                }

                val expectedY = current.centerY + slopeY * dx
                val dy = abs(next.centerY - expectedY)
                val maxDy = max(current.h, next.h) * 0.55f + 14f
                val gap = next.x - current.right

                if (gap >= -2 && dy <= maxDy) {
                    // Prefer single-step pitch match if another bar already lies closer
                    if (avgPitch <= 0f) {
                        avgPitch = dx
                    } else if (dx < avgPitch * 1.45f) {
                        avgPitch = avgPitch * 0.7f + dx * 0.3f
                    }
                    if (chain.size >= 2) {
                        val totalDx = next.centerX - chain.first().centerX
                        if (totalDx > 10f) {
                            slopeY = ((next.centerY - chain.first().centerY) / totalDx).coerceIn(-0.6f, 0.6f)
                        }
                    }
                    chain.add(next)
                    indices.add(j)
                    current = next
                }
            }

            if (chain.size >= 18) {
                for (idx in indices) used[idx] = true
                result.add(chain)
            }
        }
        return result
    }

    /**
     * Reconstructs exact 30-bar (x, y) center grid from a partial or noisy component chain,
     * then resamples each bar height directly from raw luminance via FWHM.
     */
    private fun reconstructAndDecodeGrid(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
        chain: List<BarBox>,
    ): BitChordCodec.Payload? {
        if (chain.size < 18) return null

        // If >30 bars, try slicing 30-bar contiguous windows first
        if (chain.size in 31..35) {
            for (start in 0..(chain.size - 30)) {
                val sub = chain.subList(start, start + 30)
                if (isUniformGrid(sub)) {
                    val directHeights = FloatArray(30) { sub[it].h.toFloat() }
                    tryDecodeHeights(directHeights)?.let { return it }
                    val cx = FloatArray(30) { sub[it].centerX }
                    val cy = FloatArray(30) { sub[it].centerY }
                    val maxHalf = (sub.maxOf { it.h } * 0.75f).coerceIn(20f, height * 0.25f)
                    decodeWithFwhm(yuvBytes, width, height, cx, cy, maxHalf)?.let { return it }
                }
            }
        }

        // Estimate fundamental pitch from smallest consecutive center spacings
        val gaps = ArrayList<Float>(chain.size)
        for (k in 1 until chain.size) {
            val dx = chain[k].centerX - chain[k - 1].centerX
            if (dx >= 3f) gaps.add(dx)
        }
        if (gaps.isEmpty()) return null
        gaps.sort()
        // Lower-third median avoids double/triple-gaps skewing pitch upward when bars are missing
        val basePitch = gaps[(gaps.size / 3).coerceIn(0, gaps.lastIndex)]
        if (basePitch < 3f || basePitch > 55f) return null

        val maxBarH = chain.maxOf { it.h }.toFloat()
        val maxHalf = (maxBarH * 0.85f).coerceIn(20f, height * 0.28f)

        // Anchor using first bar, or test shifting grid by -2..+2 slots if bar 0/29 was missed
        val firstX = chain.first().centerX
        val mapped = IntArray(chain.size)
        for (k in chain.indices) {
            mapped[k] = ((chain[k].centerX - firstX) / basePitch).roundToInt()
        }
        val spanSlots = mapped.last() - mapped.first()
        if (spanSlots !in 25..32) return null

        // Linear regression over (slot, centerX) and (slot, centerY)
        var sumK = 0.0
        var sumKK = 0.0
        var sumX = 0.0
        var sumKX = 0.0
        var sumY = 0.0
        var sumKY = 0.0
        var n = 0
        for (idx in chain.indices) {
            val k = mapped[idx]
            val residual = abs((firstX + k * basePitch) - chain[idx].centerX)
            if (residual <= basePitch * 0.45f) {
                sumK += k
                sumKK += k * k
                sumX += chain[idx].centerX
                sumKX += k * chain[idx].centerX
                sumY += chain[idx].centerY
                sumKY += k * chain[idx].centerY
                n++
            }
        }
        if (n < 16) return null

        val denom = n * sumKK - sumK * sumK
        if (abs(denom) < 1e-5) return null
        val stepX = ((n * sumKX - sumK * sumX) / denom).toFloat()
        val originX = ((sumX - stepX * sumK) / n).toFloat()
        val stepY = ((n * sumKY - sumK * sumY) / denom).toFloat()
        val originY = ((sumY - stepY * sumK) / n).toFloat()

        // Try grid shifts so missing first/last calibration bar is still checked cleanly
        val shiftCandidates = when (spanSlots) {
            29 -> intArrayOf(0)
            28 -> intArrayOf(0, -1)
            27 -> intArrayOf(-1, 0, -2)
            else -> intArrayOf(0, 1, -1, 2)
        }

        for (shift in shiftCandidates) {
            val cx = FloatArray(30)
            val cy = FloatArray(30)
            for (i in 0 until 30) {
                val slot = i + shift
                cx[i] = originX + slot * stepX
                cy[i] = originY + slot * stepY
            }
            if (cx.first() < 2f || cx.last() >= width - 2f) continue
            decodeWithFwhm(yuvBytes, width, height, cx, cy, maxHalf)?.let { return it }
        }

        return null
    }

    /**
     * Pass 2: Band-averaged horizontal scanline peak profiling + grid reconstruction.
     * Effective fallback when mild motion blur or bloom merges bar edges in binary masks.
     */
    private fun detectByScanlines(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        val roiLeft = (width * 0.04f).toInt()
        val roiRight = (width * 0.96f).toInt()
        val roiTop = (height * 0.16f).toInt()
        val roiBottom = (height * 0.84f).toInt()
        val roiW = roiRight - roiLeft
        if (roiW < 100) return null

        val row = IntArray(roiW)
        val smooth = IntArray(roiW)

        // Average a 5-row vertical band at step 4 to suppress camera sensor noise
        for (y in (roiTop + 2)..(roiBottom - 2) step 4) {
            for (x in 0 until roiW) {
                val gx = roiLeft + x
                val sum = (yuvBytes[(y - 2) * width + gx].toInt() and 0xFF) +
                    (yuvBytes[(y - 1) * width + gx].toInt() and 0xFF) +
                    (yuvBytes[y * width + gx].toInt() and 0xFF) +
                    (yuvBytes[(y + 1) * width + gx].toInt() and 0xFF) +
                    (yuvBytes[(y + 2) * width + gx].toInt() and 0xFF)
                row[x] = sum / 5
            }

            smooth[0] = row[0]
            smooth[roiW - 1] = row[roiW - 1]
            for (x in 1 until roiW - 1) {
                smooth[x] = (row[x - 1] + (row[x] shl 1) + row[x + 1]) shr 2
            }

            val peakX = ArrayList<Float>()
            var lastPeak = -100

            for (x in 2 until roiW - 2) {
                val v = smooth[x]
                if (v >= smooth[x - 1] && v > smooth[x + 1] && (x - lastPeak) >= 3) {
                    var minLeft = v
                    var leftX = x
                    var k = x - 1
                    while (k >= 0 && k >= x - 35) {
                        if (smooth[k] < minLeft) {
                            minLeft = smooth[k]
                            leftX = k
                        } else if (smooth[k] > minLeft + 4) {
                            break
                        }
                        k--
                    }

                    var minRight = v
                    var rightX = x
                    k = x + 1
                    while (k < roiW && k <= x + 35) {
                        if (smooth[k] < minRight) {
                            minRight = smooth[k]
                            rightX = k
                        } else if (smooth[k] > minRight + 4) {
                            break
                        }
                        k++
                    }

                    val localBg = max(minLeft, minRight)
                    if (v - localBg >= 8) {
                        peakX.add(roiLeft + (leftX + rightX) / 2f)
                        lastPeak = x
                    }
                }
            }

            if (peakX.size < 25) continue

            val chains = findScanlineChains(peakX)
            for (chain in chains) {
                if (chain.size !in 27..34) continue
                val span = chain.last() - chain.first()
                val pitch = span / (chain.size - 1)
                if (pitch < 3f || pitch > 50f) continue

                val maxHalf = (height * 0.22f).coerceAtLeast(30f)

                if (chain.size == 30) {
                    val cx = FloatArray(30) { chain[it] }
                    val cy = FloatArray(30) { y.toFloat() }
                    decodeWithFwhm(yuvBytes, width, height, cx, cy, maxHalf)?.let { return it }
                } else if (chain.size > 30) {
                    for (start in 0..(chain.size - 30)) {
                        val cx = FloatArray(30) { chain[start + it] }
                        val cy = FloatArray(30) { y.toFloat() }
                        decodeWithFwhm(yuvBytes, width, height, cx, cy, maxHalf)?.let { return it }
                    }
                } else {
                    // Recover missing bar gaps (27..29 peaks)
                    val firstX = chain.first()
                    val slots = FloatArray(30)
                    val totalSpan = chain.last() - firstX
                    val estPitch = totalSpan / 29f
                    for (i in 0 until 30) {
                        slots[i] = firstX + i * estPitch
                    }
                    val cy = FloatArray(30) { y.toFloat() }
                    decodeWithFwhm(yuvBytes, width, height, slots, cy, maxHalf)?.let { return it }
                }
            }
        }

        return null
    }

    private fun findScanlineChains(peaks: List<Float>): List<List<Float>> {
        val result = ArrayList<List<Float>>()
        var current = ArrayList<Float>()

        for (px in peaks) {
            if (current.isEmpty()) {
                current.add(px)
                continue
            }
            val gap = px - current.last()
            if (gap in 3f..50f) {
                current.add(px)
            } else {
                if (current.size >= 25) result.add(current)
                current = ArrayList()
                current.add(px)
            }
        }
        if (current.size >= 25) result.add(current)
        return result
    }

    /**
     * Measures sub-pixel FWHM (Full Width at Half Maximum) heights at the 30 known bar centers
     * and attempts decoding across slight cutoff variations.
     */
    private fun decodeWithFwhm(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
        centersX: FloatArray,
        centersY: FloatArray,
        maxHalfH: Float,
    ): BitChordCodec.Payload? {
        for (cutoffFrac in floatArrayOf(0.50f, 0.42f, 0.58f)) {
            val heights = FloatArray(30)
            var validCount = 0
            for (i in 0 until 30) {
                val h = measureFwhmHeight(
                    yuvBytes,
                    width,
                    height,
                    centersX[i].roundToInt(),
                    centersY[i].roundToInt(),
                    maxHalfH.roundToInt(),
                    cutoffFrac,
                )
                heights[i] = h
                if (h >= 3.5f) validCount++
            }
            if (validCount >= 28) {
                tryDecodeHeights(heights)?.let { return it }
            }
        }
        return null
    }

    /**
     * Measures a single bar's vertical height at (cx, cy) with sub-pixel interpolation
     * against local top/bottom background luminance.
     */
    private fun measureFwhmHeight(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
        cx: Int,
        cy: Int,
        maxHalfH: Int,
        cutoffFrac: Float,
    ): Float {
        if (cx < 1 || cx >= width - 1 || cy < 2 || cy >= height - 2) return 0f
        val yMin = max(1, cy - maxHalfH)
        val yMax = min(height - 2, cy + maxHalfH)
        if (yMax <= yMin + 4) return 0f

        val profileLen = yMax - yMin + 1
        val prof = IntArray(profileLen)
        for (k in 0 until profileLen) {
            val rowOff = (yMin + k) * width + cx
            val l0 = yuvBytes[rowOff - 1].toInt() and 0xFF
            val l1 = yuvBytes[rowOff].toInt() and 0xFF
            val l2 = yuvBytes[rowOff + 1].toInt() and 0xFF
            prof[k] = max(l1, max(l0, l2))
        }

        // Find peak near center
        val midIdx = cy - yMin
        val searchR = (profileLen / 4).coerceAtLeast(4)
        var peakIdx = midIdx
        var peakVal = prof[midIdx]
        for (k in max(1, midIdx - searchR)..min(profileLen - 2, midIdx + searchR)) {
            if (prof[k] > peakVal) {
                peakVal = prof[k]
                peakIdx = k
            }
        }

        // Local background above (stop if hitting a bright feature past the dark valley)
        var bgTop = peakVal
        var k = peakIdx - 1
        while (k >= 0) {
            val v = prof[k]
            if (v < bgTop) {
                bgTop = v
            } else if (v > bgTop + 10 && (peakVal - bgTop) >= 12) {
                break
            }
            k--
        }

        // Local background below
        var bgBot = peakVal
        k = peakIdx + 1
        while (k < profileLen) {
            val v = prof[k]
            if (v < bgBot) {
                bgBot = v
            } else if (v > bgBot + 10 && (peakVal - bgBot) >= 12) {
                break
            }
            k++
        }

        val localBg = (bgTop + bgBot) / 2f
        val contrast = peakVal - localBg
        if (contrast < 8f) return 0f

        val cutoff = localBg + contrast * cutoffFrac

        // Sub-pixel top edge
        var topY = peakIdx.toFloat()
        k = peakIdx
        while (k > 0) {
            if (prof[k - 1] <= cutoff) {
                val above = prof[k].toFloat()
                val below = prof[k - 1].toFloat()
                val denom = above - below
                val frac = if (denom > 0.5f) (above - cutoff) / denom else 0.5f
                topY = k - frac.coerceIn(0f, 1f)
                break
            }
            k--
        }

        // Sub-pixel bottom edge
        var botY = peakIdx.toFloat()
        k = peakIdx
        while (k < profileLen - 1) {
            if (prof[k + 1] <= cutoff) {
                val above = prof[k].toFloat()
                val below = prof[k + 1].toFloat()
                val denom = above - below
                val frac = if (denom > 0.5f) (above - cutoff) / denom else 0.5f
                botY = k + frac.coerceIn(0f, 1f)
                break
            }
            k++
        }

        return (botY - topY).coerceAtLeast(0f)
    }

    private fun computeOtsuThreshold(
        yuvBytes: ByteArray,
        roiX: Int,
        roiY: Int,
        roiW: Int,
        roiH: Int,
        width: Int,
    ): Int {
        val histogram = IntArray(256)
        var totalPixels = 0
        for (y in 0 until roiH step 2) {
            val rowOffset = (roiY + y) * width + roiX
            for (x in 0 until roiW step 2) {
                val v = yuvBytes[rowOffset + x].toInt() and 0xFF
                histogram[v]++
                totalPixels++
            }
        }
        if (totalPixels == 0) return 128

        var sum = 0.0
        for (i in 0 until 256) sum += i * histogram[i]

        var sumB = 0.0
        var wB = 0
        var varMax = 0.0
        var threshold = 128

        for (t in 0 until 256) {
            wB += histogram[t]
            if (wB == 0) continue
            val wF = totalPixels - wB
            if (wF == 0) break

            sumB += t * histogram[t]
            val mB = sumB / wB
            val mF = (sum - sumB) / wF

            val varBetween = wB.toDouble() * wF.toDouble() * (mB - mF) * (mB - mF)
            if (varBetween > varMax) {
                varMax = varBetween
                threshold = t
            }
        }
        return threshold
    }

    private fun tryDecodeHeights(h: FloatArray): BitChordCodec.Payload? {
        if (h.size != 30) return null

        // 1. Forward direction: first bar is 0, last bar is 7
        tryDecodeDirection(h)?.let { return it }

        // 2. Reversed direction: phone held upside down
        val rev = FloatArray(h.size) { h[h.size - 1 - it] }
        tryDecodeDirection(rev)?.let { return it }

        return null
    }

    private fun tryDecodeDirection(h: FloatArray): BitChordCodec.Payload? {
        val lowBase = h.first()
        val highBase = h.last()
        val rawSpan = highBase - lowBase
        if (rawSpan <= 4f) return null

        // First try zero-perspective with small proportional endpoint tweaks
        val endpointDeltas = floatArrayOf(0f, -0.025f * rawSpan, 0.025f * rawSpan, -0.05f * rawSpan, 0.05f * rawSpan)
        for (p in floatArrayOf(0f, -0.05f, 0.05f)) {
            val corrected = if (p == 0f) {
                h
            } else {
                FloatArray(30) { i -> h[i] * (1f + p * ((i - 14.5f) / 14.5f)) }
            }
            val cLowBase = corrected.first()
            val cHighBase = corrected.last()
            if (cHighBase <= cLowBase + 4f) continue

            val deltas = if (p == 0f) endpointDeltas else floatArrayOf(0f, -0.025f * rawSpan, 0.025f * rawSpan)
            for (dLow in deltas) {
                for (dHigh in deltas) {
                    val low = cLowBase + dLow
                    val high = cHighBase + dHigh
                    if (high <= low + 4f) continue

                    val levels = ArrayList<Int>(30)
                    for (v in corrected) {
                        val scaled = ((v - low) / (high - low)) * 7f
                        levels.add(scaled.roundToInt().coerceIn(0, 7))
                    }
                    if (levels.first() == 0 && levels.last() == 7) {
                        val payload = runCatching { BitChordCodec.decode(levels) }.getOrNull()
                        if (payload != null) return payload
                    }
                }
            }
        }
        return null
    }
}
