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
 * 1. Fast horizontal scanline peak profiling: immune to global lighting changes, detects the
 *    periodic peak-valley oscillation of the soundwave bars along multiple horizontal scanlines
 *    and measures vertical bar height directly.
 * 2. Adaptive-threshold connected component analysis: identifies candidate vertical bar
 *    bounding boxes and aligns them horizontally.
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

        // Pass 1: Scanline peak profiling (fastest & most resilient to screen glare and shadows)
        detectByScanlines(yuvBytes, width, height)?.let { return it }

        // Pass 2: Connected component run-length analysis
        detectByComponents(yuvBytes, width, height)?.let { return it }

        return null
    }

    /**
     * Pass 1: Analyzes horizontal scanlines through the viewfinder looking for the characteristic
     * alternating peak/valley profile of soundwave bars, then measures the vertical extent of each bar.
     */
    private fun detectByScanlines(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        val roiLeft = (width * 0.02f).toInt()
        val roiRight = (width * 0.98f).toInt()
        val roiTop = (height * 0.08f).toInt()
        val roiBottom = (height * 0.92f).toInt()
        val roiW = roiRight - roiLeft
        if (roiW < 100) return null

        val row = IntArray(roiW)
        val smooth = IntArray(roiW)

        // Test scanlines spaced by 5 pixels vertically
        for (y in roiTop..roiBottom step 5) {
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

        // Pass 1: Prioritize modern 2-bit format first (which handles TRACK, ALBUM, ARTIST, PLAYLIST)
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

        // 1. Forward direction: first bar is 0, last bar is 7
        val lowFwd = h.first()
        val highFwd = h.last()
        if (highFwd >= lowFwd + 4f) {
            val levels = ArrayList<Int>(h.size)
            for (v in h) {
                val scaled = ((v - lowFwd) / (highFwd - lowFwd)) * 7f
                levels.add(scaled.roundToInt().coerceIn(0, 7))
            }
            if (levels.first() == 0 && levels.last() == 7) {
                val payload = runCatching { BitChordCodec.decode(levels) }.getOrNull()
                    ?: if (allowLegacy) runCatching { BitChordCodec.decodeLegacy1Bit(levels) }.getOrNull() else null
                if (payload != null) return payload
            }
        }

        // 2. Reversed direction: phone held upside down
        val lowRev = h.last()
        val highRev = h.first()
        if (highRev >= lowRev + 4f) {
            val rev = FloatArray(h.size) { h[h.size - 1 - it] }
            val levels = ArrayList<Int>(rev.size)
            for (v in rev) {
                val scaled = ((v - lowRev) / (highRev - lowRev)) * 7f
                levels.add(scaled.roundToInt().coerceIn(0, 7))
            }
            if (levels.first() == 0 && levels.last() == 7) {
                val payload = runCatching { BitChordCodec.decode(levels) }.getOrNull()
                    ?: if (allowLegacy) runCatching { BitChordCodec.decodeLegacy1Bit(levels) }.getOrNull() else null
                if (payload != null) return payload
            }
        }

        return null
    }

    /**
     * Pass 2: Connected component run-length analysis with low minimum thresholds so level-0 bars
     * are never discarded.
     */
    private fun detectByComponents(
        yuvBytes: ByteArray,
        width: Int,
        height: Int,
    ): BitChordCodec.Payload? {
        val roiX = (width * 0.02f).toInt()
        val roiY = (height * 0.08f).toInt()
        val roiW = (width * 0.96f).toInt()
        val roiH = (height * 0.84f).toInt()
        val total = roiW * roiH
        if (total <= 0) return null

        // Find min and max in ROI to set local contrast threshold
        var minLum = 255
        var maxLum = 0
        for (y in 0 until roiH step 3) {
            val rowOffset = (roiY + y) * width
            for (x in 0 until roiW step 3) {
                val v = yuvBytes[rowOffset + roiX + x].toInt() and 0xFF
                if (v < minLum) minLum = v
                if (v > maxLum) maxLum = v
            }
        }

        if (maxLum - minLum < 20) return null
        val threshold = minLum + ((maxLum - minLum) * 0.45f).toInt()

        val binary = BooleanArray(total)
        val visited = BooleanArray(total)
        val queueX = IntArray(total)
        val queueY = IntArray(total)

        for (invert in booleanArrayOf(false, true)) {
            for (y in 0 until roiH) {
                val rowOffset = (roiY + y) * width
                val binRow = y * roiW
                for (x in 0 until roiW) {
                    val v = yuvBytes[rowOffset + roiX + x].toInt() and 0xFF
                    binary[binRow + x] = if (invert) v < threshold else v >= threshold
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

                    // Accept even small bars (level 0 can be small)
                    if (bh >= 4 && bw in 1..(roiW * 0.12f).toInt() && (bh.toFloat() / bw) >= 1.05f && area >= 6) {
                        candidates.add(BarBox(minX, minY, bw, bh, area))
                    }
                }
            }

            if (candidates.size < 18) continue
            candidates.sortBy { it.x }

            // Group bars aligned along horizontal center
            val chains = findAlignedComponentChains(candidates)
            for (chain in chains) {
                if (chain.size < 18) continue
                val heights = FloatArray(chain.size) { chain[it].h.toFloat() }
                evaluateHeightsSlices(heights)?.let { return it }
            }
        }

        return null
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
                val maxGap = max(current.w, next.w) * 5 + 16
                val dy = abs(next.centerY - current.centerY)
                val maxDy = max(current.h, next.h) * 0.50f

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
}
