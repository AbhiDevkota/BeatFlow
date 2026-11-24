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
 * Real-time detector for BitChord visual soundwave codes from camera luminance frames.
 *
 * Scans the region of interest corresponding to the viewfinder, binarizes using Otsu
 * thresholding for both polarities, performs connected component labeling to identify
 * vertical rounded bars, clusters aligned bars, evaluates calibration bar heights,
 * and validates candidate codes with CRC-8 via [BitChordCodec].
 */
object BitChordBarDetector {

    /**
     * Attempts to detect and decode a BitChord soundwave visual code from a grayscale (Y plane) buffer.
     *
     * @param yuvBytes Grayscale luminance bytes (8 bits per pixel)
     * @param width Frame width
     * @param height Frame height
     * @return Decoded [BitChordCodec.Payload] if a valid code was verified, or null otherwise.
     */
    fun detect(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        if (width < 100 || height < 100 || yuvBytes.size < width * height) return null

        // Viewfinder region of interest (centered horizontally and vertically)
        val roiX = (width * 0.04f).toInt()
        val roiY = (height * 0.15f).toInt()
        val roiW = (width * 0.92f).toInt()
        val roiH = (height * 0.70f).toInt()

        // Downsample factor if the camera resolution is high to keep processing < 2ms
        val step = if (roiW > 700) 2 else 1
        val downW = roiW / step
        val downH = roiH / step
        val totalPixels = downW * downH
        if (totalPixels <= 0) return null

        // 1. Compute histogram of luminance for Otsu's thresholding
        val hist = IntArray(256)
        for (y in 0 until downH) {
            val srcY = roiY + y * step
            val rowOffset = srcY * width
            for (x in 0 until downW) {
                val srcX = roiX + x * step
                val v = yuvBytes[rowOffset + srcX].toInt() and 0xFF
                hist[v]++
            }
        }

        val otsuThreshold = computeOtsuThreshold(hist, totalPixels)

        // 2. Preallocate buffers for connected component analysis
        val visited = BooleanArray(totalPixels)
        val queueX = IntArray(totalPixels)
        val queueY = IntArray(totalPixels)
        val binary = BooleanArray(totalPixels)

        // Test polarity 0: white bars on dark background (BitChord card default)
        // Test polarity 1: dark bars on light background (paper printout or light theme)
        for (invert in booleanArrayOf(false, true)) {
            // Fill binary array
            for (y in 0 until downH) {
                val srcY = roiY + y * step
                val rowOffset = srcY * width
                val binRow = y * downW
                for (x in 0 until downW) {
                    val srcX = roiX + x * step
                    val v = yuvBytes[rowOffset + srcX].toInt() and 0xFF
                    binary[binRow + x] = if (invert) v < otsuThreshold else v >= otsuThreshold
                }
            }

            visited.fill(false)
            val candidates = ArrayList<BarBox>()
            val minBarH = (downH * 0.05f).toInt().coerceAtLeast(10)
            val maxBarW = (downW * 0.08f).toInt().coerceAtLeast(14)

            for (y in 0 until downH) {
                val binRow = y * downW
                for (x in 0 until downW) {
                    val idx = binRow + x
                    if (!binary[idx] || visited[idx]) continue

                    // BFS flood fill to find bounding box of connected component
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

                        // 4-neighborhood
                        if (qx + 1 < downW) {
                            val nIdx = qy * downW + (qx + 1)
                            if (binary[nIdx] && !visited[nIdx]) {
                                visited[nIdx] = true
                                queueX[tail] = qx + 1; queueY[tail] = qy; tail++
                            }
                        }
                        if (qx - 1 >= 0) {
                            val nIdx = qy * downW + (qx - 1)
                            if (binary[nIdx] && !visited[nIdx]) {
                                visited[nIdx] = true
                                queueX[tail] = qx - 1; queueY[tail] = qy; tail++
                            }
                        }
                        if (qy + 1 < downH) {
                            val nIdx = (qy + 1) * downW + qx
                            if (binary[nIdx] && !visited[nIdx]) {
                                visited[nIdx] = true
                                queueX[tail] = qx; queueY[tail] = qy + 1; tail++
                            }
                        }
                        if (qy - 1 >= 0) {
                            val nIdx = (qy - 1) * downW + qx
                            if (binary[nIdx] && !visited[nIdx]) {
                                visited[nIdx] = true
                                queueX[tail] = qx; queueY[tail] = qy - 1; tail++
                            }
                        }
                    }

                    val bw = maxX - minX + 1
                    val bh = maxY - minY + 1

                    // Candidate bars must be vertical strips: taller than wide, reasonable dimensions
                    if (bh >= minBarH && bw in 2..maxBarW && (bh.toFloat() / bw.coerceAtLeast(1)) >= 1.12f && area >= 14) {
                        candidates.add(BarBox(minX, minY, bw, bh, area))
                    }
                }
            }

            if (candidates.size < 5) continue

            // 3. Sort candidate bars left-to-right
            candidates.sortBy { it.x }

            // 4. Merge adjacent overlapping broken fragments (same as Python codec)
            val merged = ArrayList<BarBox>()
            for (bar in candidates) {
                if (merged.isEmpty()) {
                    merged.add(bar)
                    continue
                }
                val prev = merged.last()
                val gap = bar.x - prev.right
                val overlap = min(prev.bottom, bar.bottom) - max(prev.y, bar.y)
                if (gap <= 3 && overlap > 0) {
                    val left = min(prev.x, bar.x)
                    val right = max(prev.right, bar.right)
                    val top = min(prev.y, bar.y)
                    val bottom = max(prev.bottom, bar.bottom)
                    prev.x = left
                    prev.y = top
                    prev.w = right - left
                    prev.h = bottom - top
                    prev.area += bar.area
                } else {
                    merged.add(bar)
                }
            }

            if (merged.size < 5) continue

            // 5. Group bars that share the same horizontal baseline/center line
            val chains = findAlignedChains(merged)
            for (chain in chains) {
                val payload = evaluateChain(chain)
                if (payload != null) {
                    return payload
                }
            }
        }

        return null
    }

    /**
     * Groups candidate bars into horizontal chains where adjacent bars share
     * approximately the same vertical center line.
     */
    private fun findAlignedChains(bars: List<BarBox>): List<List<BarBox>> {
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
                // Adjacent bars in soundwave barcode have small gaps
                val maxGap = max(current.w, next.w) * 4 + 10
                val dy = abs(next.centerY - current.centerY)
                val maxDy = max(current.h, next.h) * 0.40f

                if (gap in 0..maxGap && dy <= maxDy) {
                    chain.add(next)
                    visited[j] = true
                    current = next
                }
            }

            if (chain.size >= 12) {
                result.add(chain)
            }
        }

        return result
    }

    /**
     * Evaluates a chain of aligned bars by testing candidate subsequences with CRC-8 validation.
     */
    private fun evaluateChain(chain: List<BarBox>): BitChordCodec.Payload? {
        // Try entire chain first
        trySequence(chain)?.let { return it }

        // If chain has extra surrounding components (e.g. logo or text), test sliding windows
        // Valid BitChord codes typically have between 20 and 42 bars
        val minLen = 16
        val maxLen = min(chain.size, 45)

        for (len in maxLen downTo minLen) {
            for (start in 0..(chain.size - len)) {
                val sub = chain.subList(start, start + len)
                trySequence(sub)?.let { return it }
            }
        }

        return null
    }

    /**
     * Scales bar heights between the first and last calibration bars and tests
     * both forward and reversed orientation against [BitChordCodec].
     */
    private fun trySequence(bars: List<BarBox>): BitChordCodec.Payload? {
        if (bars.size < 5) return null

        // 1. Normal forward direction: first bar is calibration 0 (min), last bar is calibration 7 (max)
        val lowFwd = bars.first().h.toFloat()
        val highFwd = bars.last().h.toFloat()
        if (highFwd >= lowFwd + 5f) {
            val levels = ArrayList<Int>(bars.size)
            for (b in bars) {
                val scaled = ((b.h - lowFwd) / (highFwd - lowFwd)) * 7f
                levels.add(scaled.roundToInt().coerceIn(0, 7))
            }
            if (levels.first() == 0 && levels.last() == 7) {
                val payload = runCatching { BitChordCodec.decode(levels) }.getOrNull()
                    ?: runCatching { BitChordCodec.decodeLegacy1Bit(levels) }.getOrNull()
                if (payload != null) return payload
            }
        }

        // 2. Reversed direction: code presented upside down
        val lowRev = bars.last().h.toFloat()
        val highRev = bars.first().h.toFloat()
        if (highRev >= lowRev + 5f) {
            val revBars = bars.asReversed()
            val levels = ArrayList<Int>(revBars.size)
            for (b in revBars) {
                val scaled = ((b.h - lowRev) / (highRev - lowRev)) * 7f
                levels.add(scaled.roundToInt().coerceIn(0, 7))
            }
            if (levels.first() == 0 && levels.last() == 7) {
                val payload = runCatching { BitChordCodec.decode(levels) }.getOrNull()
                    ?: runCatching { BitChordCodec.decodeLegacy1Bit(levels) }.getOrNull()
                if (payload != null) return payload
            }
        }

        return null
    }

    /**
     * Computes Otsu's optimal binarization threshold from a 256-bin luminance histogram.
     */
    private fun computeOtsuThreshold(hist: IntArray, total: Int): Int {
        var sum = 0.0
        for (i in 0..255) {
            sum += i * hist[i]
        }
        var sumB = 0.0
        var wB = 0
        var varMax = 0.0
        var threshold = 128

        for (t in 0..255) {
            wB += hist[t]
            if (wB == 0) continue
            val wF = total - wB
            if (wF == 0) break

            sumB += t * hist[t]
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
}
