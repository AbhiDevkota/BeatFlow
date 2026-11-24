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
 * Employs a dual-pass detection strategy:
 * 1. Otsu-thresholded Connected Component Analysis: 2D invariant analysis that tracks vertical
 *    bar bounding boxes directly, immune to camera tilt and vertical alignment offsets.
 * 2. Adaptive-threshold Scanline Peak Profiling: analyzes periodic oscillation along horizontal
 *    scanlines through the viewfinder.
 *
 * Candidate sequences are validated with 8-bit CRC checksums via [BitChordCodec], ensuring zero
 * false positives.
 */
object BitChordBarDetector {

    fun detect(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        if (width < 100 || height < 100 || yuvBytes.size < width * height) return null

        // Pass 1: Otsu-thresholded Connected Component Analysis (most resilient to tilt and level-0 alignment)
        detectByComponents(yuvBytes, width, height)?.let { return it }

        // Pass 2: Fast horizontal scanline peak profiling as fallback
        detectByScanlines(yuvBytes, width, height)?.let { return it }

        return null
    }

    /**
     * Pass 1: Identifies 2D candidate vertical bar bounding boxes using Otsu's adaptive binarization
     * and connected component labeling, then groups horizontally aligned sequences into codes.
     */
    private fun detectByComponents(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        // Focus primarily on the viewfinder region
        val roiX = (width * 0.04f).toInt()
        val roiY = (height * 0.12f).toInt()
        val roiW = (width * 0.92f).toInt()
        val roiH = (height * 0.76f).toInt()
        val total = roiW * roiH
        if (total <= 0) return null

        val otsuThreshold = computeOtsuThreshold(yuvBytes, roiX, roiY, roiW, roiH, width)

        val binary = BooleanArray(total)
        val visited = BooleanArray(total)
        val queueX = IntArray(total)
        val queueY = IntArray(total)

        // Test bright bars on dark background first, then inverted
        for (invert in booleanArrayOf(false, true)) {
            for (y in 0 until roiH) {
                val rowOffset = (roiY + y) * width + roiX
                val binRow = y * roiW
                for (x in 0 until roiW) {
                    val v = yuvBytes[rowOffset + x].toInt() and 0xFF
                    binary[binRow + x] = if (invert) v < otsuThreshold else v >= otsuThreshold
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

                    val bw = maxX - minX + 1
                    val bh = maxY - minY + 1

                    // Candidate vertical bar criteria
                    if (bh >= 6 && bw in 1..(roiW * 0.08f).toInt() && (bh.toFloat() / max(bw, 1)) >= 1.02f && area >= 8) {
                        candidates.add(BarBox(minX, minY, bw, bh, area))
                    }
                }
            }

            if (candidates.size < 18) continue
            candidates.sortBy { it.x }

            // Merge horizontally overlapping or touching split bar fragments
            val merged = ArrayList<BarBox>()
            for (bar in candidates) {
                if (merged.isEmpty()) {
                    merged.add(bar)
                    continue
                }
                val prev = merged.last()
                val gap = bar.x - prev.right
                val overlap = min(prev.bottom, bar.bottom) - max(prev.y, bar.y)
                if (gap <= 4 && overlap > 0) {
                    val nx = min(prev.x, bar.x)
                    val ny = min(prev.y, bar.y)
                    val nr = max(prev.right, bar.right)
                    val nb = max(prev.bottom, bar.bottom)
                    prev.x = nx
                    prev.y = ny
                    prev.w = nr - nx
                    prev.h = nb - ny
                    prev.area += bar.area
                } else {
                    merged.add(bar)
                }
            }

            if (merged.size < 18) continue

            // Find aligned bar chains
            val chains = findAlignedComponentChains(merged)
            for (chain in chains) {
                if (chain.size < 18) continue
                val heights = FloatArray(chain.size) { chain[it].h.toFloat() }
                evaluateHeightsSlices(heights)?.let { return it }
            }
        }

        return null
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
        for (i in 0 until 256) {
            sum += i * histogram[i]
        }

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

    private fun findAlignedComponentChains(bars: List<BarBox>): List<List<BarBox>> {
        val result = ArrayList<List<BarBox>>()
        val visited = BooleanArray(bars.size)

        for (i in bars.indices) {
            if (visited[i]) continue
            val chain = ArrayList<BarBox>()
            chain.add(bars[i])
            visited[i] = true

            var current = bars[i]
            for (j in (i + 1) until bars.size) {
                if (visited[j]) continue
                val next = bars[j]
                val gap = next.x - current.right
                val maxGap = max(current.w, next.w) * 5 + 28
                val dy = abs(next.centerY - current.centerY)
                val maxDy = max(current.h, next.h) * 0.65f + 12f

                if (gap in 0..maxGap && dy <= maxDy) {
                    chain.add(next)
                    visited[j] = true
                    current = next
                }
            }

            if (chain.size >= 18) {
                result.add(chain)
            }
        }
        return result
    }

    /**
     * Pass 2: Analyzes horizontal scanlines through the viewfinder looking for the characteristic
     * alternating peak/valley profile of soundwave bars, then measures the vertical extent of each bar.
     */
    private fun detectByScanlines(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        val roiLeft = (width * 0.04f).toInt()
        val roiRight = (width * 0.96f).toInt()
        val roiTop = (height * 0.15f).toInt()
        val roiBottom = (height * 0.85f).toInt()
        val roiW = roiRight - roiLeft
        if (roiW < 100) return null

        val row = IntArray(roiW)
        val smooth = IntArray(roiW)

        // Test scanlines spaced by 4 pixels vertically
        for (y in roiTop..roiBottom step 4) {
            val rowOffset = y * width

            // Read horizontal scanline
            for (x in 0 until roiW) {
                row[x] = yuvBytes[rowOffset + roiLeft + x].toInt() and 0xFF
            }

            // 3-point moving average smoothing: (r[x-1] + 2*r[x] + r[x+1]) / 4
            smooth[0] = row[0]
            smooth[roiW - 1] = row[roiW - 1]
            for (x in 1 until roiW - 1) {
                smooth[x] = (row[x - 1] + (row[x] shl 1) + row[x + 1]) shr 2
            }

            // Find local peaks (bright bars) and measure local contrast
            val peakIndices = ArrayList<Int>()
            val peakBgVals = ArrayList<Int>()
            var lastPeak = -100

            for (x in 2 until roiW - 2) {
                val v = smooth[x]
                if (v >= smooth[x - 1] && v > smooth[x + 1] && (x - lastPeak) >= 3) {
                    // Walk down slopes left and right to find actual local valleys
                    var minLeft = v
                    var leftX = x
                    var k = x - 1
                    while (k >= 0 && k >= x - 40) {
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
                    while (k < roiW && k <= x + 40) {
                        if (smooth[k] < minRight) {
                            minRight = smooth[k]
                            rightX = k
                        } else if (smooth[k] > minRight + 4) {
                            break
                        }
                        k++
                    }

                    val localBg = max(minLeft, minRight)
                    val contrast = v - localBg
                    if (contrast >= 8) {
                        val barCenterX = (leftX + rightX) / 2
                        peakIndices.add(roiLeft + barCenterX)
                        peakBgVals.add(localBg)
                        lastPeak = x
                    }
                }
            }

            if (peakIndices.size < 18) continue

            // Find chains of peaks with relatively uniform spacing
            val chains = findPeakChains(peakIndices, peakBgVals)
            for (chainPair in chains) {
                val chain = chainPair.first
                val chainBg = chainPair.second
                if (chain.size < 18) continue

                // Measure vertical height of each bar in the chain
                val barHeights = FloatArray(chain.size)
                val centerYs = FloatArray(chain.size)
                var validCount = 0

                for (i in chain.indices) {
                    val px = chain[i]
                    val peakVal = yuvBytes[y * width + px].toInt() and 0xFF
                    val bgVal = chainBg.getOrElse(i) { 0 }
                    val contrast = (peakVal - bgVal).coerceAtLeast(10)
                    val cutoff = bgVal + (contrast * 0.35f).toInt()

                    // Trace UP
                    var upY = y
                    val maxTravel = height / 2
                    while (upY > max(0, y - maxTravel)) {
                        val lum = yuvBytes[upY * width + px].toInt() and 0xFF
                        if (lum < cutoff) break
                        upY--
                    }

                    // Trace DOWN
                    var downY = y
                    while (downY < min(height - 1, y + maxTravel)) {
                        val lum = yuvBytes[downY * width + px].toInt() and 0xFF
                        if (lum < cutoff) break
                        downY++
                    }

                    val bh = (downY - upY).toFloat()
                    val cy = (upY + downY) / 2f
                    barHeights[i] = bh
                    centerYs[i] = cy
                    if (bh >= 4f) validCount++
                }

                if (validCount < 18) continue

                // Evaluate candidate slices of heights
                evaluateHeightsSlices(barHeights)?.let { return it }
            }
        }

        return null
    }

    private fun findPeakChains(
        peaks: List<Int>,
        bgs: List<Int>,
    ): List<Pair<List<Int>, List<Int>>> {
        val result = ArrayList<Pair<List<Int>, List<Int>>>()
        var currentChain = ArrayList<Int>()
        var currentBg = ArrayList<Int>()

        for (i in peaks.indices) {
            if (currentChain.isEmpty()) {
                currentChain.add(peaks[i])
                currentBg.add(bgs[i])
                continue
            }
            val gap = peaks[i] - currentChain.last()
            if (gap in 3..60) {
                currentChain.add(peaks[i])
                currentBg.add(bgs[i])
            } else {
                if (currentChain.size >= 18) {
                    result.add(Pair(currentChain, currentBg))
                }
                currentChain = ArrayList()
                currentBg = ArrayList()
                currentChain.add(peaks[i])
                currentBg.add(bgs[i])
            }
        }
        if (currentChain.size >= 18) {
            result.add(Pair(currentChain, currentBg))
        }
        return result
    }

    private fun evaluateHeightsSlices(heights: FloatArray): BitChordCodec.Payload? {
        val n = heights.size
        // Valid BitChord codes range from ~24 to 34 bars
        val minLen = 22
        val maxLen = min(n, 36)

        // Pass 1: Prioritize modern 2-bit format first (which handles TRACK/SONG, ALBUM, ARTIST, PLAYLIST)
        for (len in maxLen downTo minLen) {
            for (start in 0..(n - len)) {
                val sub = FloatArray(len) { heights[start + it] }
                tryDecodeHeights(sub, allowLegacy = false)?.let { return it }
            }
        }

        // Pass 2: Fall back to legacy 1-bit format only if modern format did not match
        for (len in maxLen downTo minLen) {
            for (start in 0..(n - len)) {
                val sub = FloatArray(len) { heights[start + it] }
                tryDecodeHeights(sub, allowLegacy = true)?.let { return it }
            }
        }

        return null
    }

    private fun tryDecodeHeights(h: FloatArray, allowLegacy: Boolean): BitChordCodec.Payload? {
        if (h.size < 5) return null

        // 1. Forward direction
        tryDecodeWithVariations(h, allowLegacy)?.let { return it }

        // 2. Reversed direction (upside down)
        val rev = FloatArray(h.size) { h[h.size - 1 - it] }
        tryDecodeWithVariations(rev, allowLegacy)?.let { return it }

        return null
    }

    private fun tryDecodeWithVariations(h: FloatArray, allowLegacy: Boolean): BitChordCodec.Payload? {
        val lowBase = h.first()
        val highBase = h.last()
        if (highBase <= lowBase + 4f) return null

        // Test base calibration and slight 1px delta variations for camera discretization resilience
        for (dLow in floatArrayOf(0f, -1f, 1f)) {
            for (dHigh in floatArrayOf(0f, 1f, -1f)) {
                val low = lowBase + dLow
                val high = highBase + dHigh
                if (high <= low + 4f) continue

                val levels = ArrayList<Int>(h.size)
                for (v in h) {
                    val scaled = ((v - low) / (high - low)) * 7f
                    levels.add(scaled.roundToInt().coerceIn(0, 7))
                }
                if (levels.first() == 0 && levels.last() == 7) {
                    val payload = runCatching { BitChordCodec.decode(levels) }.getOrNull()
                        ?: if (allowLegacy) runCatching { BitChordCodec.decodeLegacy1Bit(levels) }.getOrNull() else null
                    if (payload != null) return payload
                }
            }
        }
        return null
    }
}
